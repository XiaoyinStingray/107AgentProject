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
        assert "‘我’只能指苏瑶" in context
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
