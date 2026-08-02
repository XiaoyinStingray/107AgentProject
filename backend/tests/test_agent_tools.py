"""
Tool 注册体系 单元测试。

包含两部分：
1. 模块级 stub tools 测试（Arena/Bench 向后兼容）
2. State 4 闭包 tools 测试（make_agent_tools / make_team_tools）
"""

import asyncio

import pytest

from engines.agent_factory.tools import (
    DEFAULT_AGENT_TOOLS,
    EMPTY_TOOLS,
    STUDY_SCENE_TOOLS,
    observe,
    send_message,
    set_goal,
    think_aloud,
)


# =============================================================================
# Part 1: 模块级 Stub Tool 函数（Arena / Bench 使用）
# =============================================================================


@pytest.mark.asyncio
async def test_send_message_returns_string():
    result = await send_message(target_name="小明", content="你好", tone="gentle")
    assert isinstance(result, str)
    assert "小明" in result


@pytest.mark.asyncio
async def test_think_aloud_returns_string():
    result = await think_aloud(thought="我好像忘了什么东西...")
    assert isinstance(result, str)
    assert "思考已记录" in result


@pytest.mark.asyncio
async def test_set_goal_returns_string():
    result = await set_goal(description="保研清华", priority=1)
    assert isinstance(result, str)
    assert "保研清华" in result


@pytest.mark.asyncio
async def test_observe_returns_string():
    result = await observe(target="图书馆的陌生人")
    assert isinstance(result, str)
    assert "观察" in result


@pytest.mark.asyncio
async def test_set_goal_default_priority():
    """priority 默认值为 1。"""
    result = await set_goal(description="测试")
    assert "测试" in result


def test_default_tools_count():
    """DEFAULT_AGENT_TOOLS 包含 4 个工具。"""
    assert len(DEFAULT_AGENT_TOOLS) == 4


def test_default_tools_are_callables():
    """所有 tool 都是可调用对象。"""
    for tool in DEFAULT_AGENT_TOOLS:
        assert callable(tool)


def test_study_scene_tools_includes_defaults():
    """场景特定工具包含所有默认工具 + 场景工具。"""
    for default_tool in DEFAULT_AGENT_TOOLS:
        assert default_tool in STUDY_SCENE_TOOLS


def test_empty_tools_is_empty():
    assert len(EMPTY_TOOLS) == 0


@pytest.mark.asyncio
async def test_lifeagent_has_tools_attached():
    """通过 AgentFactory 创建的 LifeAgent 携带 DEFAULT_AGENT_TOOLS。"""
    import json

    from engines.agent_factory.tools import DEFAULT_AGENT_TOOLS

    class _FakeResult:
        def __init__(self, c):
            self.content = c

    class MockClient:
        model_info = {"function_calling": True}

        def __init__(self):
            self.call_count = 0

        async def create(self, messages):
            from engines.persona.builder import MOCK_PERSONA_JSON

            self.call_count += 1
            return _FakeResult(json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False))

    from engines.agent_factory.factory import AgentFactory

    factory = AgentFactory(MockClient())
    agent = await factory.create_from_description("测试角色")

    assert len(agent.autogen_agent._tools) == len(DEFAULT_AGENT_TOOLS)  # noqa: SLF001


@pytest.mark.asyncio
async def test_all_tools_callable_concurrently():
    """所有 4 个 tool 可以并发调用而不冲突。"""
    results = await asyncio.gather(
        send_message(target_name="A", content="hello"),
        think_aloud(thought="hmm"),
        set_goal(description="goal1"),
        observe(target="someone"),
    )
    assert len(results) == 4
    for r in results:
        assert isinstance(r, str)


# =============================================================================
# Part 2: State 4 闭包 Tool 测试（make_agent_tools）
# =============================================================================


class TestClosureToolsSend:
    """闭包 send_message 真实副作用测试。"""

    @pytest.mark.asyncio
    async def test_send_message_produces_pending(self, factory, mock_engine):
        """闭包 send_message 推入 _pending_messages 队列。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        b = await factory.create_from_description("B")
        a.persona.name = "小明"
        b.persona.name = "小红"

        engine = mock_engine({a.id: a, b.id: b})
        tools = make_agent_tools(engine, a.id)
        send = tools[0]

        result = await send(target_name="小红", content="周末复习？", tone="gentle")

        assert "✅" in result
        assert len(engine._pending_messages) == 1
        assert engine._pending_messages[0]["to"] == b.id
        assert engine._pending_messages[0]["content"] == "周末复习？"

    @pytest.mark.asyncio
    async def test_send_message_target_not_found(self, factory, mock_engine):
        """目标不存在时返回 ❌ 错误。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)
        send = tools[0]

        result = await send(target_name="不存在的人", content="你好")
        assert "❌" in result
        assert "找不到" in result

    @pytest.mark.asyncio
    async def test_send_message_empty_target(self, factory, mock_engine):
        """空目标名返回错误。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)
        send = tools[0]

        result = await send(target_name="", content="你好")
        assert "❌" in result

    @pytest.mark.asyncio
    async def test_send_message_engine_destroyed(self, factory, mock_engine):
        """engine 销毁后 tool 返回 ⚠️ 守卫。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        b = await factory.create_from_description("B")
        b.persona.name = "小红"
        engine = mock_engine({a.id: a, b.id: b})
        tools = make_agent_tools(engine, a.id)
        send = tools[0]

        # 模拟 engine 销毁
        engine.world = None
        result = await send(target_name="小红", content="你好")
        assert "⚠️" in result


class TestClosureToolsThink:
    """闭包 think_aloud 真实副作用测试。"""

    @pytest.mark.asyncio
    async def test_think_aloud_records_to_log(self, factory, mock_engine):
        """闭包 think_aloud 写入 _thought_log。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)
        think = tools[1]

        result = await think(thought="我觉得小红在躲我")

        assert "🤔" in result
        assert a.id in engine._thought_log
        assert engine._thought_log[a.id][0]["thought"] == "我觉得小红在躲我"

    @pytest.mark.asyncio
    async def test_think_aloud_empty_thought(self, factory, mock_engine):
        """空想法返回提示。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)
        think = tools[1]

        result = await think(thought="")
        assert "🤔" in result


class TestClosureToolsGoal:
    """闭包 set_goal 真实副作用测试。"""

    @pytest.mark.asyncio
    async def test_set_goal_adds_to_agent(self, factory, mock_engine):
        """闭包 set_goal 追加到 agent.goals。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        initial = len(a.goals)
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)
        set_g = tools[2]

        result = await set_g(description="考到 3.5 GPA", priority=1)

        assert "✅" in result
        assert len(a.goals) == initial + 1
        assert a.goals[-1].description == "考到 3.5 GPA"
        assert engine._goal_check_pending is True

    @pytest.mark.asyncio
    async def test_set_goal_dedup_reactivates(self, factory, mock_engine):
        """重复设定同名目标时重新激活而非新增。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)
        set_g = tools[2]

        await set_g(description="保研", priority=1)
        count_after_first = len(a.goals)
        await set_g(description="保研", priority=2)
        count_after_second = len(a.goals)

        assert count_after_second == count_after_first  # 未新增


class TestClosureToolsObserve:
    """闭包 observe 真实副作用测试。"""

    @pytest.mark.asyncio
    async def test_observe_agent_returns_state(self, factory, mock_engine):
        """observe 返回目标 agent 的情绪/能量/位置。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        b = await factory.create_from_description("B")
        b.persona.name = "小红"
        engine = mock_engine({a.id: a, b.id: b})
        tools = make_agent_tools(engine, a.id)
        obs = tools[3]

        result = await obs(target="小红")
        assert "🔍" in result
        assert "情绪" in result
        assert "能量" in result

    @pytest.mark.asyncio
    async def test_observe_non_agent_returns_fallback(self, factory, mock_engine):
        """observe 非 agent 目标返回环境描述。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)
        obs = tools[3]

        result = await obs(target="图书馆")
        assert "🔍" in result


class TestClosureToolsNotes:
    """闭包 write_note / read_notes 测试。"""

    @pytest.mark.asyncio
    async def test_write_and_read_notes(self, factory, mock_engine):
        """write_note 写入 + read_notes 读取。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)
        write = tools[4]
        read = tools[5]

        await write(content="小红没来图书馆")
        await write(content="她可能在准备比赛")
        result = await read(limit=5)

        assert "小红没来" in result
        assert "准备比赛" in result

    @pytest.mark.asyncio
    async def test_notes_limit_100(self, factory, mock_engine):
        """笔记超过 100 条时自动截断。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)
        write = tools[4]

        for i in range(110):
            await write(content=f"笔记{i}")

        assert len(a._notes) <= 100

    @pytest.mark.asyncio
    async def test_read_notes_empty(self, factory, mock_engine):
        """无笔记时返回提示。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)
        read = tools[5]

        result = await read()
        assert "暂无笔记" in result


class TestClosureToolsCount:
    """make_agent_tools 返回数量测试。"""

    @pytest.mark.asyncio
    async def test_make_agent_tools_returns_9_tools(self, factory, mock_engine):
        """make_agent_tools 返回 9 个 tools（含 write_note/read_notes/move_to/interact_with/web_search）。"""
        from engines.agent_factory.tools import make_agent_tools

        a = await factory.create_from_description("A")
        engine = mock_engine({a.id: a})
        tools = make_agent_tools(engine, a.id)

        # 9 tools: send_message, think_aloud, set_goal, observe,
        #          write_note, read_notes, move_to, interact_with, web_search
        assert len(tools) == 9
        for t in tools:
            assert callable(t)
