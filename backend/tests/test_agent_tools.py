"""
Tool 注册体系 单元测试。
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
# Tool 函数
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


# =============================================================================
# Tool 集合
# =============================================================================


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


# =============================================================================
# 与 LifeAgent 集成
# =============================================================================


@pytest.mark.asyncio
async def test_lifeagent_has_tools_attached():
    """通过 AgentFactory 创建的 LifeAgent 携带 DEFAULT_AGENT_TOOLS。"""
    import json

    from engines.agent_factory.tools import DEFAULT_AGENT_TOOLS

    # 复用 test_agent_factory 的 Mock 模式
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

    # 验证 tool 已注入 AutoGen Agent
    assert len(agent.autogen_agent._tools) == len(DEFAULT_AGENT_TOOLS)  # noqa: SLF001


# =============================================================================
# 并发安全性
# =============================================================================


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
