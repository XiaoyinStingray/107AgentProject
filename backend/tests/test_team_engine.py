"""
TeamEngine 单元测试 — State 8 / T15。
覆盖: SSE 构建、Worker 事件映射、Agent ID 解析、StepResult dataclass。
"""

import json

import pytest

from engines.team.engine import (
    StepResult,
    _make_sse,
    _make_error_sse,
    _prefix_worker_sse,
    _parse_sse_dict,
    TeamEngine,
)


# =====================================================================
# _make_sse
# =====================================================================


class TestMakeSse:

    def test_basic_format(self):
        """SSE 格式: data: {json}\n\n"""
        raw = _make_sse("plan_created", {"task": "test"})
        assert raw.startswith("data: ")
        assert raw.endswith("\n\n")
        obj = json.loads(raw[6:].strip())
        assert obj["type"] == "plan_created"
        assert obj["data"]["task"] == "test"
        assert "timestamp" in obj

    def test_with_step_id(self):
        """带 step_id 的 SSE。"""
        raw = _make_sse("step.started", {"title": "t"}, step_id="s1")
        obj = json.loads(raw[6:].strip())
        assert obj["step_id"] == "s1"

    def test_without_step_id(self):
        """不带 step_id 的 SSE 不含 step_id 键。"""
        raw = _make_sse("team_done", {})
        obj = json.loads(raw[6:].strip())
        assert "step_id" not in obj

    def test_chinese_content(self):
        """中文内容正确序列化。"""
        raw = _make_sse("test", {"msg": "你好世界"})
        obj = json.loads(raw[6:].strip())
        assert obj["data"]["msg"] == "你好世界"


# =====================================================================
# _make_error_sse
# =====================================================================


class TestMakeErrorSse:

    def test_error_format(self):
        """team.error SSE 格式正确。"""
        raw = _make_error_sse("出错了")
        obj = json.loads(raw[6:].strip())
        assert obj["type"] == "team.error"
        assert obj["data"]["error"] == "出错了"

    def test_double_quotes_safe(self):
        """字符串内含双引号不破坏 JSON。"""
        raw = _make_error_sse('error with "quotes" inside')
        obj = json.loads(raw[6:].strip())
        assert obj["data"]["error"] == 'error with "quotes" inside'


# =====================================================================
# _prefix_worker_sse
# =====================================================================


class TestPrefixWorkerSse:

    def _make_worker_event(self, event_type: str, data: dict | None = None) -> str:
        payload = {"type": event_type, "data": data or {}, "timestamp": ""}
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    def test_worker_done_mapped(self):
        """worker.done → step.worker_done"""
        raw = self._make_worker_event("worker.done", {"total_steps": 5})
        result = _prefix_worker_sse(raw, "step-1")
        obj = json.loads(result[6:].strip())
        assert obj["type"] == "step.worker_done"
        assert obj["step_id"] == "step-1"

    def test_tool_start_mapped(self):
        """worker.tool_start → step.tool_start"""
        raw = self._make_worker_event("worker.tool_start")
        result = _prefix_worker_sse(raw, "s1")
        obj = json.loads(result[6:].strip())
        assert obj["type"] == "step.tool_start"

    def test_file_updated_mapped(self):
        """worker.file_updated → step.file_updated"""
        raw = self._make_worker_event("worker.file_updated")
        result = _prefix_worker_sse(raw, "s2")
        obj = json.loads(result[6:].strip())
        assert obj["type"] == "step.file_updated"

    def test_unknown_type_gets_step_prefix(self):
        """未知 worker 事件类型加 step. 前缀。"""
        raw = self._make_worker_event("worker.custom_event")
        result = _prefix_worker_sse(raw, "s3")
        obj = json.loads(result[6:].strip())
        assert obj["type"] == "step.worker.custom_event"

    def test_non_data_passthrough(self):
        """非 data: 开头的行原样返回。"""
        raw = "not a data line\n"
        result = _prefix_worker_sse(raw, "s1")
        assert result == raw

    def test_invalid_json_passthrough(self):
        """无效 JSON 原样返回。"""
        raw = "data: {invalid json}\n\n"
        result = _prefix_worker_sse(raw, "s1")
        assert result == raw


# =====================================================================
# _parse_sse_dict
# =====================================================================


class TestParseSseDict:

    def test_valid(self):
        raw = 'data: {"type":"worker.done","data":{}}\n\n'
        obj = _parse_sse_dict(raw)
        assert obj["type"] == "worker.done"

    def test_invalid(self):
        assert _parse_sse_dict("garbage") == {}

    def test_non_data(self):
        assert _parse_sse_dict("event: test") == {}


# =====================================================================
# _resolve_agent_id
# =====================================================================


class TestResolveAgentId:

    def _make_engine(self):
        engine = TeamEngine(team={"id": "t1"}, db=None)  # type: ignore[arg-type]
        engine._agents = [
            {"id": "uuid-1", "name": "小红", "role": "PM", "mbti": "ENFP"},
            {"id": "uuid-2", "name": "小明", "role": "Dev", "mbti": "ISTJ"},
        ]
        return engine

    def test_exact_uuid(self):
        engine = self._make_engine()
        assert engine._resolve_agent_id("uuid-1") == "uuid-1"

    def test_exact_name(self):
        engine = self._make_engine()
        assert engine._resolve_agent_id("小红") == "uuid-1"

    def test_partial_name(self):
        engine = self._make_engine()
        assert engine._resolve_agent_id("明") == "uuid-2"

    def test_none(self):
        engine = self._make_engine()
        assert engine._resolve_agent_id(None) is None

    def test_unknown_returns_original(self):
        engine = self._make_engine()
        assert engine._resolve_agent_id("unknown-xxx") == "unknown-xxx"


# =====================================================================
# StepResult dataclass
# =====================================================================


class TestStepResult:

    def test_defaults(self):
        sr = StepResult()
        assert sr.step_id == ""
        assert sr.success is False
        assert sr.files == []
        assert sr.duration_secs == 0.0

    def test_full_construction(self):
        sr = StepResult(
            step_id="s1", step_title="测试", assignee_id="a1",
            assignee_name="小红", success=True, files=["out.md"],
            output_summary="完成", steps_used=5, duration_secs=1.2,
        )
        assert sr.success is True
        assert sr.files == ["out.md"]
        assert sr.steps_used == 5


# =====================================================================
# TeamEngine._find_agent_name
# =====================================================================


class TestFindAgentName:

    def _make_engine(self):
        engine = TeamEngine(team={"id": "t1"}, db=None)  # type: ignore[arg-type]
        engine._agents = [
            {"id": "a1", "name": "小红"},
            {"id": "a2", "name": "小明"},
        ]
        return engine

    def test_found(self):
        engine = self._make_engine()
        assert engine._find_agent_name("a1") == "小红"

    def test_not_found(self):
        engine = self._make_engine()
        result = engine._find_agent_name("a999")
        assert result == "a999"[:8]

    def test_none_returns_all(self):
        engine = self._make_engine()
        assert engine._find_agent_name(None) == "全员"
