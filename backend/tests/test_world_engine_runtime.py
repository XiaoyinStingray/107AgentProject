"""WorldEngine persistence, LLM execution, and runtime loop tests."""

import pytest

from tests.world_engine_fixtures import (
    FakeMessage,
    MockModelClient,
    db_session,
    engine,  # noqa: F401 - dependency fixture used by db_session
    make_agent,
    make_world,
)


class TestGroupIdentityProtocol:
    def test_agent_context_locks_identity_and_maps_participants(self, db_session):
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        su = make_agent("a2", "苏瑶")
        world_engine = WorldEngine(make_world(), [chen, su], db_session)
        context = world_engine._build_agent_context(
            su,
            world_engine._build_world_context(),
        )

        assert "你的唯一身份：苏瑶" in context
        assert f"{chen.autogen_agent.name} = 陈默" in context
        assert f"{su.autogen_agent.name} = 苏瑶" in context
        assert "'我'只能指苏瑶" in context
        assert "source 是发言者身份的唯一依据" in context
        assert "回复末尾追加 [END_TICK]" in context
        assert "[SKIP_TURN]" not in context

    def test_group_task_contains_shared_identity_rules(self, db_session):
        from engines.world.engine import WorldEngine

        world_engine = WorldEngine(make_world(), [], db_session)
        task = world_engine._build_group_task()

        assert "唯一身份" in task
        assert "不得代替其他参与者" in task
        assert "[SKIP_TURN]" not in task

    def test_targeted_instruction_is_private_and_consumed_once(self, db_session):
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        su = make_agent("a2", "苏瑶")
        world_engine = WorldEngine(make_world(), [chen, su], db_session)
        world_engine.inject_event(
            "请主动去和陈默讨论复习计划",
            event_type="agent_action",
            target_agent_ids=[su.id],
        )
        shared = world_engine._build_world_context()

        chen_context = world_engine._build_agent_context(chen, shared)
        first_su_context = world_engine._build_agent_context(su, shared)
        second_su_context = world_engine._build_agent_context(su, shared)

        assert "用户只对你下达的一次性指令" not in chen_context
        assert "请主动去和陈默讨论复习计划" in first_su_context
        assert "互动对象已锁定为：陈默" in first_su_context
        assert "第一次可见发言必须直接称呼“陈默”" in first_su_context
        assert "发言后等待陈默回应" in first_su_context
        assert "请由你本人在本轮行动或发言中立即执行" in first_su_context
        assert "用户只对你下达的一次性指令" not in second_su_context

    def test_social_instruction_forces_actor_then_named_target(self, db_session):
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        su = make_agent("a2", "苏瑶")
        song = make_agent("a3", "宋明远")
        world_engine = WorldEngine(make_world(), [chen, su, song], db_session)

        class ActiveGroupToken:
            def __init__(self):
                self.cancelled = False

            def cancel(self):
                self.cancelled = True

        active_token = ActiveGroupToken()
        world_engine._group_cancel_token = active_token
        world_engine.inject_event(
            "请主动去和陈默讨论复习计划",
            event_type="agent_action",
            target_agent_ids=[su.id],
        )

        assert active_token.cancelled is True
        assert world_engine._instruction_preempt_requested is True
        # Injection may arrive while the previous group tick is still running.
        # Its route must not be consumed before the matching prompt is injected.
        assert world_engine._pending_speaker_ids == []
        assert world_engine._pending_instruction_routes == [[su.id, chen.id]]
        world_engine._activate_pending_instruction_routes()
        assert world_engine._instruction_preempt_requested is False

        first = world_engine._select_addressed_speaker([
            FakeMessage("继续当前场景。", "user"),
        ])
        second = world_engine._select_addressed_speaker([
            FakeMessage("陈默，我们讨论一下复习计划。", su.autogen_agent.name),
        ])

        assert first == su.autogen_agent.name
        assert second == chen.autogen_agent.name
        assert world_engine._pending_speaker_ids == []
        assert world_engine._pending_instruction_routes == []

    @pytest.mark.asyncio
    async def test_instruction_prompt_and_route_activate_at_same_tick_boundary(
        self,
        db_session,
    ):
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        su = make_agent("a2", "苏瑶")
        world_engine = WorldEngine(make_world(), [chen, su], db_session)
        world_engine.inject_event(
            "去和陈默交流新画展",
            event_type="agent_action",
            target_agent_ids=[su.id],
        )
        captured_contexts: dict[str, str] = {}
        original_builder = world_engine._build_agent_context

        def capture_context(agent, shared_context):
            context = original_builder(agent, shared_context)
            captured_contexts[agent.id] = context
            return context

        world_engine._build_agent_context = capture_context
        await world_engine._inject_world_context()

        assert "去和陈默交流新画展" in captured_contexts[su.id]
        assert "用户只对你下达的一次性指令" in captured_contexts[su.id]
        assert "用户只对你下达的一次性指令" not in captured_contexts[chen.id]
        assert world_engine._pending_instruction_routes == []
        assert world_engine._pending_speaker_ids == [su.id, chen.id]
        assert world_engine._pending_agent_instructions == {}

    def test_non_social_instruction_only_forces_actor(self, db_session):
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        su = make_agent("a2", "苏瑶")
        world_engine = WorldEngine(make_world(), [chen, su], db_session)
        world_engine.inject_event(
            "请去弹钢琴",
            event_type="agent_action",
            target_agent_ids=[su.id],
        )
        assert world_engine._pending_speaker_ids == []
        world_engine._activate_pending_instruction_routes()
        shared = world_engine._build_world_context()
        su_context = world_engine._build_agent_context(su, shared)

        first = world_engine._select_addressed_speaker([
            FakeMessage("继续当前场景。", "user"),
        ])
        follow_up = world_engine._select_addressed_speaker([
            FakeMessage("我去看看钢琴。", su.autogen_agent.name),
        ])

        assert first == su.autogen_agent.name
        assert follow_up is None
        assert "没有唯一指定另一位在场人物" in su_context
        assert "不得擅自把它改成找某个 Agent 聊天" in su_context
        assert "若当前场景无法完成，要明确说明原因" in su_context

    def test_single_agent_instruction_preempts_without_speaker_route(self, db_session):
        from engines.world.engine import WorldEngine

        su = make_agent("a1", "苏瑶")
        world_engine = WorldEngine(make_world(), [su], db_session)
        world_engine.inject_event(
            "请去弹钢琴",
            event_type="agent_action",
            target_agent_ids=[su.id],
        )

        assert world_engine._instruction_preempt_requested is True
        assert world_engine._pending_instruction_routes == []
        world_engine._activate_pending_instruction_routes()
        assert world_engine._instruction_preempt_requested is False

    def test_single_named_addressee_is_selected_directly(self, db_session):
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        song = make_agent("a2", "宋明远")
        world_engine = WorldEngine(make_world(), [chen, song], db_session)
        message = FakeMessage("陈默，你怎么看？", song.autogen_agent.name)

        assert world_engine._select_addressed_speaker([message]) == chen.autogen_agent.name

    def test_ambiguous_addressee_defers_to_selector(self, db_session):
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        song = make_agent("a2", "宋明远")
        su = make_agent("a3", "苏瑶")
        world_engine = WorldEngine(make_world(), [chen, song, su], db_session)
        message = FakeMessage("陈默和苏瑶都可以回答。", song.autogen_agent.name)

        assert world_engine._select_addressed_speaker([message]) is None

    def test_group_chat_uses_selector_and_role_descriptions(self, db_session):
        from engines.world.engine import WorldEngine

        agents = [make_agent("a1", "陈默"), make_agent("a2", "苏瑶")]
        team = WorldEngine(make_world(), agents, db_session).build_group_chat()

        assert type(team).__name__ == "SelectorGroupChat"
        assert agents[0].autogen_agent.description.startswith("陈默：")
        assert agents[1].autogen_agent.description.startswith("苏瑶：")

    def test_identity_conflicts_are_rejected(self, db_session):
        from engines.world.engine import WorldEngine

        su = make_agent("a1", "苏瑶")
        song = make_agent("a2", "宋明远")
        world_engine = WorldEngine(make_world(), [su, song], db_session)

        own_as_other = FakeMessage("苏瑶，你怎么看？", su.autogen_agent.name)
        other_as_self = FakeMessage("我叫宋明远。", su.autogen_agent.name)
        valid = FakeMessage("我想先整理笔记。", su.autogen_agent.name)

        assert world_engine._convert_message_to_event(own_as_other) is None
        assert world_engine._convert_message_to_event(other_as_self) is None
        assert world_engine._convert_message_to_event(valid).source_agent_id == "a1"

    def test_stream_identity_conflict_is_rejected(self, db_session):
        from autogen_agentchat.messages import TextMessage

        from engines.world.engine import WorldEngine

        su = make_agent("a1", "苏瑶")
        world_engine = WorldEngine(make_world(), [su], db_session)
        message = TextMessage(
            content="（看向苏瑶）苏瑶，你怎么看？",
            source=su.autogen_agent.name,
        )

        assert world_engine._stream_message_to_event(message) is None

    @pytest.mark.asyncio
    async def test_selector_group_chat_routes_mock_conversation(self, db_session):
        from autogen_core.models import CreateResult, RequestUsage

        from engines.world.engine import WorldEngine

        agents = [
            make_agent("a1", "陈默"),
            make_agent("a2", "宋明远"),
            make_agent("a3", "苏瑶"),
        ]

        class RoutingClient:
            model_info = {**MockModelClient.model_info, "family": "unknown"}

            async def create(self, messages, **kwargs):
                prompt = "\n".join(str(getattr(item, "content", "")) for item in messages)
                if "只返回一个内部角色标识" in prompt:
                    content = agents[0].autogen_agent.name
                elif "你的唯一身份：陈默" in prompt:
                    content = "宋明远，你怎么看？"
                elif "你的唯一身份：宋明远" in prompt:
                    content = "苏瑶，你怎么看？"
                else:
                    content = "我同意，我们继续。"
                return CreateResult(
                    finish_reason="stop",
                    content=content,
                    usage=RequestUsage(prompt_tokens=10, completion_tokens=5),
                    cached=False,
                )

        client = RoutingClient()
        for agent in agents:
            agent._model_client = client
            agent._agent._model_client = client

        world_engine = WorldEngine(make_world(), agents, db_session)
        events = [event async for event in world_engine.tick_stream()]
        messages = [event for event in events if event.type == "agent_message"]

        assert [event.source_agent_id for event in messages] == [
            "a1", "a2", "a3", "a1", "a2", "a3", "a1", "a2", "a3",
        ]


class TestPersistEvents:
    @pytest.mark.asyncio
    async def test_persist_writes_to_db(self, db_session):
        from engines.world.engine import WorldEngine
        from models.event import SimEvent

        engine = WorldEngine(make_world(), [], db_session)
        events = [SimEvent(
            id="evt-1",
            world_id="world-1",
            tick=0,
            type="agent_message",
            source_agent_id="a1",
            description="测试事件",
            created_at="2026-01-01",
        )]
        await engine._persist_events(events)
        result = await db_session.execute(
            __import__("sqlalchemy").text("SELECT * FROM events WHERE id = 'evt-1'")
        )
        assert result.fetchone().description == "测试事件"

    @pytest.mark.asyncio
    async def test_persist_empty_list_noop(self, db_session):
        from engines.world.engine import WorldEngine

        await WorldEngine(make_world(), [], db_session)._persist_events([])


class TestSoloTick:
    @pytest.mark.asyncio
    async def test_solo_tick_returns_events(self, db_session):
        from engines.world.engine import WorldEngine

        agent = make_agent("agent-1", "小明")
        setattr(agent._agent, "_model_client", MockModelClient("我想去图书馆看看。"))
        events = await WorldEngine(make_world(), [agent], db_session)._run_solo_tick(agent)
        assert events[0].type in ("thought_stream", "agent_message")
        assert events[0].source_agent_id == "agent-1"

    @pytest.mark.asyncio
    async def test_solo_tick_error_handling(self, db_session):
        from engines.world.engine import WorldEngine

        class BrokenClient:
            model_info = {
                "function_calling": True,
                "vision": False,
                "json_output": True,
            }

            async def create(self, messages, **kwargs):
                raise RuntimeError("模拟的网络故障")

        agent = make_agent("agent-1", "小明")
        setattr(agent._agent, "_model_client", BrokenClient())
        events = await WorldEngine(make_world(), [agent], db_session)._run_solo_tick(agent)
        assert len(events) == 1
        assert events[0].type == "world_event"
        assert "网络故障" in events[0].description


class TestTickIntegration:
    @pytest.mark.asyncio
    async def test_tick_increments_and_archives(self, db_session):
        from engines.world.engine import WorldEngine

        agent = make_agent("agent-1", "小明")
        setattr(agent._agent, "_model_client", MockModelClient("思考中..."))
        engine = WorldEngine(make_world(), [agent], db_session)
        await engine.tick()
        assert engine.current_tick == 1
        assert engine.world.current_tick == 1
        assert len(engine.events) >= 1


class TestRun:
    @pytest.mark.asyncio
    async def test_run_respects_max_ticks(self, db_session):
        from engines.world.engine import WorldEngine

        agent = make_agent("agent-1", "小明")
        setattr(agent._agent, "_model_client", MockModelClient("tick tick..."))
        engine = WorldEngine(make_world(), [agent], db_session)
        all_events = await engine.run(max_ticks=3)
        assert engine.current_tick == 3
        assert len(all_events) >= 3

    @pytest.mark.asyncio
    async def test_run_stops_when_paused(self, db_session):
        from engines.world.engine import WorldEngine

        agent = make_agent("agent-1", "小明")
        engine = WorldEngine(make_world(), [agent], db_session)
        original_tick = engine.tick
        call_count = 0

        async def tick_with_pause():
            nonlocal call_count
            call_count += 1
            if call_count == 2:
                engine.world.status = "paused"
            return await original_tick()

        engine.tick = tick_with_pause
        await engine.run(max_ticks=10)
        assert call_count == 2


class TestActionBoundaries:
    def test_unknown_action_is_noop(self, db_session):
        from engines.world.engine import WorldEngine
        from models.event import SimEvent

        event = SimEvent(
            id="e1",
            world_id="w1",
            tick=0,
            type="agent_action",
            source_agent_id="a1",
            description="unknown",
            created_at="2026-01-01",
        )
        assert WorldEngine(make_world(), [], db_session)._apply_action(event) == []

    def test_empty_relationship_update_is_noop(self, db_session):
        from engines.world.engine import WorldEngine

        assert WorldEngine(make_world(), [], db_session)._update_relationships([]) == []


# =============================================================================
# State 4: Tool 副作用基础设施测试
# =============================================================================


class TestState4ToolInfrastructure:
    """WorldEngine State 4 新增方法和属性的单元测试。"""

    def test_find_agent_by_persona_name(self, db_session):
        """_find_agent_by_name 按 persona.name 查找。"""
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        su = make_agent("a2", "苏瑶")
        engine = WorldEngine(make_world(), [chen, su], db_session)

        found = engine._find_agent_by_name("陈默")
        assert found is not None
        assert found.id == "a1"

    def test_find_agent_by_autogen_name(self, db_session):
        """_find_agent_by_name 回退到 AutoGen name。"""
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        engine = WorldEngine(make_world(), [chen], db_session)

        found = engine._find_agent_by_name(chen.autogen_agent.name)
        assert found is not None
        assert found.id == "a1"

    def test_find_agent_returns_none_when_missing(self, db_session):
        """_find_agent_by_name 找不到时返回 None。"""
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [make_agent("a1", "陈默")], db_session)
        assert engine._find_agent_by_name("不存在的人") is None

    def test_get_agent_public_state_returns_string(self, db_session):
        """_get_agent_public_state 返回情绪和能量信息。"""
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        engine = WorldEngine(make_world(), [chen], db_session)

        state = engine._get_agent_public_state("a1")
        assert "情绪" in state
        assert "能量" in state

    def test_get_agent_public_state_missing_returns_unknown(self, db_session):
        """_get_agent_public_state 找不到 agent 返回 '未知'。"""
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        assert engine._get_agent_public_state("nonexistent") == "未知"

    def test_pending_messages_initialized(self, db_session):
        """WorldEngine 初始化时 _pending_messages 为空列表。"""
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        assert engine._pending_messages == []

    def test_thought_log_initialized(self, db_session):
        """WorldEngine 初始化时 _thought_log 为空 dict。"""
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        assert engine._thought_log == {}

    def test_closure_tools_injected_into_agents(self, db_session):
        """WorldEngine 初始化后每个 agent 的 tools 被替换为闭包版本。"""
        from engines.world.engine import WorldEngine

        chen = make_agent("a1", "陈默")
        su = make_agent("a2", "苏瑶")
        engine = WorldEngine(make_world(), [chen, su], db_session)

        # 闭包 tools 应该有 9 个（make_agent_tools 返回 9 个）
        assert len(chen.autogen_agent._tools) == 9
        assert len(su.autogen_agent._tools) == 9

    def test_goal_check_pending_flag(self, db_session):
        """_goal_check_pending 初始为 False。"""
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        assert engine._goal_check_pending is False

    def test_scene_bridge_initially_none(self, db_session):
        """scene_bridge 初始为 None。"""
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        assert engine.scene_bridge is None
