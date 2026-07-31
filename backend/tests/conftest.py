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
