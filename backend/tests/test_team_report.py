"""
TeamReportGenerator 单元测试 — Step T1。
覆盖: 报告生成（Mock LLM + 规则兜底）、Markdown 格式验证。
"""

import json

import pytest

from engines.team.report import generate_report, _extract_key_events, _rule_based_report

pytestmark = pytest.mark.asyncio


# ── Mock LLM ─────────────────────────────────────────────

class _MockResult:
    def __init__(self, text): self.content = text


class MockReportClient:
    """返回预设 JSON 报告。"""
    def __init__(self, report_dict=None):
        self._report = report_dict or {
            "title": "测试报告",
            "content": "# 测试报告\n\n内容",
            "key_decisions": ["决策1", "决策2"],
            "strategy_summary": "总结",
            "collaboration_analysis": "分析",
        }

    async def create(self, messages, **kw):
        return _MockResult(json.dumps(self._report, ensure_ascii=False))


class FailingClient:
    async def create(self, messages, **kw):
        raise RuntimeError("LLM unavailable")


# ── Fixtures ─────────────────────────────────────────────

STEPS = [
    {"id": "s1", "title": "需求分析", "assignee": "a1", "status": "done", "progress": 1.0},
    {"id": "s2", "title": "技术方案", "assignee": "a2", "status": "done", "progress": 1.0},
    {"id": "s3", "title": "整合交付", "assignee": None, "status": "pending", "progress": 0.0},
]

EVENTS = [
    {"type": "agent_message", "tick": 1, "content": "开始讨论需求"},
    {"type": "agent_action", "tick": 2, "content": "完成需求文档"},
    {"type": "agent_message", "tick": 3, "content": "开始技术方案设计"},
    {"type": "plan_updated", "tick": 3, "content": "需求分析完成"},
    {"type": "agent_action", "tick": 4, "content": "技术方案完成"},
]


# ── Tests ────────────────────────────────────────────────


class TestExtractKeyEvents:

    def test_filters_relevant_types(self):
        """只提取 agent_message / agent_action / plan_updated / tool_call。"""
        events = EVENTS + [{"type": "tick_boundary", "content": "ignored"}]
        key = _extract_key_events(events)
        assert all(e["type"] in {"agent_message", "agent_action", "plan_updated", "tool_call"}
                    for e in key)

    def test_max_30_events(self):
        """最多返回 30 条。"""
        events = [{"type": "agent_message", "content": f"msg{i}"} for i in range(50)]
        key = _extract_key_events(events)
        assert len(key) == 30

    def test_excludes_empty_content(self):
        """排除无 content 和 description 的事件。"""
        events = [
            {"type": "agent_message", "content": ""},
            {"type": "agent_message", "description": ""},
            {"type": "agent_message", "content": "有效内容"},
        ]
        key = _extract_key_events(events)
        assert len(key) == 1


class TestGenerateReportWithLLM:

    async def test_llm_report(self):
        """LLM 可用时返回结构化报告。"""
        client = MockReportClient()
        report = await generate_report("设计 App", STEPS, EVENTS, model_client=client)

        assert report["title"] == "测试报告"
        assert "content" in report
        assert "key_decisions" in report
        assert len(report["key_decisions"]) == 2
        assert "strategy_summary" in report
        assert "collaboration_analysis" in report

    async def test_llm_failure_fallback(self):
        """LLM 不可用时走规则兜底。"""
        client = FailingClient()
        report = await generate_report("设计 App", STEPS, EVENTS, model_client=client)

        assert report["title"] == "团队复盘报告"
        assert "设计 App" in report["content"]
        assert "完成度" in report["content"]

    async def test_no_model_client(self):
        """model_client=None → 直接走规则兜底。"""
        report = await generate_report("设计 App", STEPS, EVENTS, model_client=None)
        assert report["title"] == "团队复盘报告"
        assert "content" in report


class TestRuleBasedReport:

    def test_report_structure(self):
        """规则报告包含所有必要字段。"""
        report = _rule_based_report("测试任务", STEPS, EVENTS, 2, 3)
        assert "title" in report
        assert "content" in report
        assert "key_decisions" in report
        assert "strategy_summary" in report
        assert "collaboration_analysis" in report

    def test_report_content_contains_task(self):
        """报告内容包含原始任务描述。"""
        report = _rule_based_report("校园社交App", STEPS, EVENTS, 2, 3)
        assert "校园社交App" in report["content"]

    def test_report_completion_percentage(self):
        """报告包含正确的完成百分比。"""
        report = _rule_based_report("任务", STEPS, EVENTS, 2, 3)
        assert "67%" in report["content"]

    def test_report_key_decisions_from_actions(self):
        """从 agent_action 事件提取关键决策。"""
        report = _rule_based_report("任务", STEPS, EVENTS, 2, 3)
        assert len(report["key_decisions"]) >= 1
        assert any("完成" in d for d in report["key_decisions"])

    def test_report_markdown_format(self):
        """报告内容为 Markdown 格式。"""
        report = _rule_based_report("任务", STEPS, EVENTS, 2, 3)
        content = report["content"]
        assert content.startswith("#")
        assert "##" in content  # 有子标题

    def test_empty_events(self):
        """无事件时不崩溃。"""
        report = _rule_based_report("空任务", [], [], 0, 0)
        assert report["title"] == "团队复盘报告"
        assert "0/0" in report["content"]
