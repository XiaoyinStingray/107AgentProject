"""
TaskDecomposer 单元测试 — Step T1。
覆盖: Mock LLM 分解、规则兜底、异常输入。
"""

import json

import pytest

from engines.team.decomposer import decompose_task

pytestmark = pytest.mark.asyncio


# ── Mock model client ────────────────────────────────────

class _MockResult:
    def __init__(self, content: str):
        self.content = content


class MockModelClient:
    """返回预设 JSON 的 Mock LLM。"""

    def __init__(self, response_json=None):
        self._response = response_json

    async def create(self, messages, **kw):
        if self._response is not None:
            return _MockResult(json.dumps(self._response, ensure_ascii=False))
        return _MockResult("[]")


class FailingModelClient:
    """模拟 LLM 调用失败。"""

    async def create(self, messages, **kw):
        raise RuntimeError("LLM unavailable")


# ── Tests ────────────────────────────────────────────────

AGENTS = [
    {"id": "a1", "name": "小红", "role": "产品经理", "mbti": "ENFP"},
    {"id": "a2", "name": "小明", "role": "后端开发", "mbti": "ISTJ"},
    {"id": "a3", "name": "小刚", "role": "技术架构师", "mbti": "INTJ"},
]


class TestDecomposeTask:

    async def test_mock_llm_returns_steps(self):
        """Mock LLM 返回有效 JSON → 正确解析。"""
        llm_response = [
            {"title": "需求调研", "assignee": "a1", "description": "用户访谈"},
            {"title": "技术方案", "assignee": "a2", "description": "架构设计"},
            {"title": "整合交付", "assignee": None, "description": "合并产出"},
        ]
        client = MockModelClient(llm_response)
        steps = await decompose_task("设计校园 App", AGENTS, client)

        assert len(steps) == 3
        assert steps[0]["title"] == "需求调研"
        assert steps[0]["assignee"] == "a1"
        assert steps[0]["status"] == "pending"
        assert "id" in steps[0]

    async def test_fallback_on_llm_failure(self):
        """LLM 不可用 → 规则兜底，每个 Agent 至少一个步骤。"""
        client = FailingModelClient()
        steps = await decompose_task("设计校园 App", AGENTS, client)

        assert len(steps) >= len(AGENTS)  # 每个 Agent 至少一步
        # 最后一步是整合交付
        assert steps[-1]["title"] == "整合交付"
        assert steps[-1]["assignee"] is None

    async def test_empty_agents_fallback(self):
        """无 Agent → 至少返回一个步骤。"""
        client = FailingModelClient()
        steps = await decompose_task("简单任务", [], client)
        assert len(steps) >= 1

    async def test_invalid_llm_response_fallback(self):
        """LLM 返回非 JSON → 规则兜底。"""
        client = MockModelClient(None)  # 返回 "[]"
        # 空数组 → validated 为空 → 兜底
        steps = await decompose_task("测试任务", AGENTS, client)
        assert len(steps) >= 1

    async def test_step_fields_complete(self):
        """每个步骤包含必要字段。"""
        llm_response = [
            {"title": "调研", "assignee": "a1", "description": "用户调研"},
        ]
        client = MockModelClient(llm_response)
        steps = await decompose_task("任务", AGENTS, client)

        for s in steps:
            assert "id" in s
            assert "title" in s
            assert "status" in s
            assert s["status"] == "pending"
            assert "progress" in s
            assert "depends_on" in s

    async def test_title_truncation(self):
        """超长标题截断到 30 字符。"""
        llm_response = [
            {"title": "A" * 50, "assignee": "a1", "description": "test"},
        ]
        client = MockModelClient(llm_response)
        steps = await decompose_task("任务", AGENTS, client)
        assert len(steps[0]["title"]) <= 30
