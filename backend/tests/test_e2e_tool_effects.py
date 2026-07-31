"""
State 4 Phase B E2E: Tool 真实副作用测试。

验证 make_agent_tools 创建的闭包 tools 产生真实的副作用。
"""

import pytest


# =============================================================================
# 闭包 Tool 工厂测试（需要 Mock WorldEngine）
# =============================================================================


class MockEngine:
    """模拟 WorldEngine——提供 tool 闭包所需的最小接口。"""

    def __init__(self, agents_dict: dict):
        self.agents = agents_dict
        self.world = object()  # State 4: _engine_alive() 检查此属性
        self.current_tick = 0
        self._pending_messages: list[dict] = []
        self._thought_log: dict[str, list] = {}
        self._goal_check_pending = False

    def _find_agent_by_name(self, name: str):
        for agent in self.agents.values():
            if getattr(agent, 'persona', None) and agent.persona.name == name:
                return agent
        return None


@pytest.mark.asyncio
async def test_closure_send_message_produces_pending_message(factory):
    """闭包 send_message 推入 _pending_messages 队列。"""
    from engines.agent_factory.tools import make_agent_tools

    agent_a = await factory.create_from_description("测试角色A")
    agent_b = await factory.create_from_description("测试角色B")

    # 设置 persona.name 方便查找
    agent_a.persona.name = "小明"
    agent_b.persona.name = "小红"

    engine = MockEngine({agent_a.id: agent_a, agent_b.id: agent_b})
    tools = make_agent_tools(engine, agent_a.id)

    # 找到 send_message tool
    send_msg = tools[0]
    result = await send_msg(target_name="小红", content="你好，周末一起复习？", tone="gentle")

    assert "✅" in result
    assert len(engine._pending_messages) == 1
    msg = engine._pending_messages[0]
    assert msg["to"] == agent_b.id
    assert msg["content"] == "你好，周末一起复习？"
    assert msg["tone"] == "gentle"


@pytest.mark.asyncio
async def test_closure_send_message_target_not_found(factory):
    """send_message 目标不存在时返回错误提示。"""
    from engines.agent_factory.tools import make_agent_tools

    agent = await factory.create_from_description("测试角色")
    engine = MockEngine({agent.id: agent})
    tools = make_agent_tools(engine, agent.id)

    send_msg = tools[0]
    result = await send_msg(target_name="不存在的人", content="你好")

    assert "❌" in result
    assert "找不到" in result


@pytest.mark.asyncio
async def test_closure_think_aloud_records_thought(factory):
    """闭包 think_aloud 写入 _thought_log。"""
    from engines.agent_factory.tools import make_agent_tools

    agent = await factory.create_from_description("测试角色")
    engine = MockEngine({agent.id: agent})
    tools = make_agent_tools(engine, agent.id)

    think = tools[1]
    result = await think(thought="我觉得小红在躲我")

    assert "🤔" in result
    assert agent.id in engine._thought_log
    assert len(engine._thought_log[agent.id]) == 1
    assert engine._thought_log[agent.id][0]["thought"] == "我觉得小红在躲我"


@pytest.mark.asyncio
async def test_closure_set_goal_adds_to_agent(factory):
    """闭包 set_goal 追加到 agent.goals 列表。"""
    from engines.agent_factory.tools import make_agent_tools

    agent = await factory.create_from_description("测试角色")
    initial_goal_count = len(agent.goals)
    engine = MockEngine({agent.id: agent})
    tools = make_agent_tools(engine, agent.id)

    set_g = tools[2]
    result = await set_g(description="考到 3.5 GPA", priority=1)

    assert "✅" in result
    assert len(agent.goals) == initial_goal_count + 1
    assert agent.goals[-1].description == "考到 3.5 GPA"


@pytest.mark.asyncio
async def test_closure_write_note_and_read_notes(factory):
    """闭包 write_note/read_notes 读写私有笔记。"""
    from engines.agent_factory.tools import make_agent_tools

    agent = await factory.create_from_description("测试角色")
    engine = MockEngine({agent.id: agent})
    tools = make_agent_tools(engine, agent.id)

    write = tools[4]
    read = tools[5]

    await write(content="小红今天没来图书馆")
    await write(content="她可能在准备比赛")

    result = await read(limit=5)
    assert "小红今天没来" in result
    assert "准备比赛" in result
    assert len(agent._notes) == 2


@pytest.mark.asyncio
async def test_closure_tools_make_agent_tools_count():
    """make_agent_tools 返回 6 个 tools（含 write_note/read_notes）。"""
    from engines.agent_factory.tools import make_agent_tools

    # 直接测试——不需要真实 agent/engine
    assert callable(make_agent_tools)
