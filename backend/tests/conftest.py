# conftest.py — pytest fixtures 和全局配置

import json

import pytest


@pytest.fixture
def anyio_backend():
    return "asyncio"


# =============================================================================
# State 4: 共享 fixtures（供多个测试文件使用）
# =============================================================================


class _FakeCreateResult:
    """模拟 AutoGen CreateResult。"""

    def __init__(self, content: str):
        self.content = content


class MockLLMClient:
    """模拟 LLM 客户端——按预设 JSON 返回 Persona。"""

    model_info: dict = {"function_calling": True}

    def __init__(self, fixed_response: str | None = None):
        self._fixed = fixed_response
        self.call_count = 0
        self.last_messages: list | None = None

    async def create(self, messages):
        self.call_count += 1
        self.last_messages = messages
        if self._fixed is not None:
            return _FakeCreateResult(self._fixed)
        from engines.persona.builder import MOCK_PERSONA_JSON

        return _FakeCreateResult(json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False))


@pytest.fixture
def mock_client():
    return MockLLMClient()


@pytest.fixture
def factory(mock_client):
    from engines.agent_factory.factory import AgentFactory

    return AgentFactory(mock_client)


# =============================================================================
# State 4: MockEngine — 闭包 tool 测试的最小 WorldEngine 替身
# =============================================================================


class MockEngine:
    """模拟 WorldEngine——提供 tool 闭包所需的最小接口。

    用于 test_agent_tools / test_e2e_tool_effects 等测试文件。
    """

    def __init__(self, agents_dict: dict):
        self.agents = agents_dict
        self.world = object()  # _engine_alive() 检查此属性
        self.current_tick = 0
        self._pending_messages: list[dict] = []
        self._thought_log: dict[str, list] = {}
        self._goal_check_pending = False

    def _find_agent_by_name(self, name: str):
        for agent in self.agents.values():
            if getattr(agent, "persona", None) and agent.persona.name == name:
                return agent
        return None


@pytest.fixture
def mock_engine():
    """返回 MockEngine 类（非实例），测试中自行传 agents_dict 构造。"""
    return MockEngine
