"""Step T10: AgentWorker 引擎测试 — Mock LLM + Mock Workspace。"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import pytest

from engines.worker.state_machine import WorkerState, MAX_STEPS
from engines.worker.workspace import FileInfo, SandboxResult, WorkspaceProvider


def _run(coro):
    """Python 3.14 兼容的异步运行辅助。"""
    return asyncio.run(coro)


# =============================================================================
# Mock 对象
# =============================================================================


class MockWorkspace(WorkspaceProvider):
    """测试用 Mock WorkspaceProvider。"""

    def __init__(self):
        self._files: dict[str, str] = {}

    async def write_file(self, path: str, content: str) -> str:
        self._files[path] = content
        return f"/mock/{path}"

    async def read_file(self, path: str, snapshot: str | None = None) -> str:
        if path not in self._files:
            raise FileNotFoundError(f"文件不存在: {path}")
        return self._files[path]

    async def list_files(self, directory: str = "") -> list[FileInfo]:
        return [
            FileInfo(path=p, size=len(c), modified_at="2024-01-01T00:00:00Z")
            for p, c in self._files.items()
            if not directory or p.startswith(directory)
        ]

    async def delete_file(self, path: str) -> bool:
        if path in self._files:
            del self._files[path]
            return True
        return False

    async def run_python(self, code: str, timeout: int = 30) -> SandboxResult:
        return SandboxResult(stdout="42\n", stderr="", exit_code=0)

    async def exists(self, path: str) -> bool:
        return path in self._files

    async def list_snapshots(self, path: str) -> list[dict]:
        return []

    @property
    def location_description(self) -> str:
        return "本地: /mock/test"


class MockPersona:
    """Mock persona for LifeAgent."""
    def __init__(self, name="TestWorker"):
        self.name = name


class MockAutogenAgent:
    """Mock AutoGen agent."""
    def __init__(self, responses: list[str]):
        self._responses = responses
        self._call_idx = 0
        self.received_messages = []

    async def on_messages(self, messages, cancellation_token=None):
        self.received_messages.append(messages)
        if self._call_idx < len(self._responses):
            resp = self._responses[self._call_idx]
            self._call_idx += 1
        else:
            # 默认返回 done
            resp = json.dumps({"decision": "done", "reason": "mock exhausted"})
        return MockChatResult(resp)


class MockChatResult:
    """Mock AutoGen ChatResult."""
    def __init__(self, content: str):
        self.chat_message = MockChatMessage(content)


class MockChatMessage:
    def __init__(self, content: str):
        self.content = content


class MockLifeAgent:
    """Mock LifeAgent。"""
    def __init__(self, responses: list[str]):
        self.persona = MockPersona()
        self.autogen_agent = MockAutogenAgent(responses)


def _make_worker(responses: list[str], workspace=None):
    """创建 AgentWorker 实例（不启动执行）。"""
    from engines.worker.engine import AgentWorker
    agent = MockLifeAgent(responses)
    ws = workspace or MockWorkspace()
    return AgentWorker(agent, workspace=ws), ws


# =============================================================================
# 辅助函数测试
# =============================================================================


class TestSSEEvent:
    """SSE 事件构建测试。"""

    def test_sse_event_format(self):
        """SSE 事件格式正确。"""
        from engines.worker.engine import _sse_event
        event = _sse_event("worker.started", {"run_id": "r1", "task": "test"})
        assert event.startswith("data: ")
        assert event.endswith("\n\n")
        payload = json.loads(event[6:].strip())
        assert payload["type"] == "worker.started"
        assert payload["data"]["run_id"] == "r1"
        assert "timestamp" in payload

    def test_sse_event_with_dataclass(self):
        """SSE 事件支持 dataclass。"""
        from engines.worker.engine import _sse_event
        from engines.worker.events import WorkerStartedData
        data = WorkerStartedData(run_id="r2", agent_name="Test", task="do it", workspace="local")
        event = _sse_event("worker.started", data.__dict__)
        payload = json.loads(event[6:].strip())
        assert payload["data"]["agent_name"] == "Test"


class TestSafeJsonParse:
    """_safe_json_parse 辅助函数测试。"""

    def test_clean_json(self):
        from engines.worker.engine import _safe_json_parse
        r = _safe_json_parse('{"decision": "done"}')
        assert r is not None and r["decision"] == "done"

    def test_markdown_wrapped(self):
        from engines.worker.engine import _safe_json_parse
        text = '```json\n{"decision": "tool_call"}\n```'
        r = _safe_json_parse(text)
        assert r is not None and r["decision"] == "tool_call"

    def test_text_around_json(self):
        from engines.worker.engine import _safe_json_parse
        text = 'I think...\n{"decision": "done", "reason": "ok"}\nDone.'
        r = _safe_json_parse(text)
        assert r is not None and r["decision"] == "done"

    def test_non_dict_returns_none(self):
        from engines.worker.engine import _safe_json_parse
        assert _safe_json_parse("[1,2,3]") is None
        assert _safe_json_parse('"hello"') is None

    def test_empty_returns_none(self):
        from engines.worker.engine import _safe_json_parse
        assert _safe_json_parse("") is None
        assert _safe_json_parse("   ") is None

    def test_decision_prompt_uses_a_valid_json_example(self):
        from engines.worker.prompts import DECISION_JSON_EXAMPLE

        parsed = json.loads(DECISION_JSON_EXAMPLE)
        assert parsed["decision"] == "tool_call"


# =============================================================================
# AgentWorker 状态机测试
# =============================================================================


class TestAgentWorkerInit:
    """AgentWorker 初始化测试。"""

    def test_initial_state_is_idle(self):
        """初始状态为 IDLE。"""
        worker, _ = _make_worker([])
        assert worker.state == WorkerState.IDLE

    def test_run_id_assigned(self):
        """run_id 自动分配。"""
        worker, _ = _make_worker([])
        assert worker.run_id.startswith("run-")

    def test_workspace_assigned(self):
        """workspace 正确赋值。"""
        ws = MockWorkspace()
        worker, _ = _make_worker([], workspace=ws)
        assert worker.workspace is ws


class TestAgentWorkerExecute:
    """AgentWorker.execute() 状态机全路径测试。"""

    def test_planning_to_done(self):
        """IDLE → PLANNING → DECIDING → DONE（Agent 直接选 done）。"""
        # LLM 返回：planning 阶段返回 reason，deciding 阶段选 done
        responses = [
            json.dumps({"decision": "tool_call", "reason": "start plan", "tool_name": "list_files", "tool_args": {}}),
            json.dumps({"decision": "done", "reason": "all done"}),
        ]
        worker, ws = _make_worker(responses)

        events = []
        async def collect():
            async for ev in worker.execute("test task"):
                events.append(ev)
                if len(events) > 50:  # 安全阀
                    break

        _run(collect())
        assert worker.state == WorkerState.DONE
        # 应包含 worker.started 事件
        event_types = [json.loads(e[6:].strip())["type"] for e in events]
        assert "worker.started" in event_types

    def test_tool_call_flow(self):
        """IDLE → PLANNING → DECIDING → EXECUTING → REFLECTING → DECIDING → DONE。"""
        responses = [
            # planning
            json.dumps({"decision": "tool_call", "reason": "plan", "tool_name": "list_files", "tool_args": {"directory": ""}}),
            # deciding: call list_files
            json.dumps({"decision": "tool_call", "reason": "check files", "tool_name": "list_files", "tool_args": {"directory": ""}}),
            # reflecting: satisfied, continue
            json.dumps({"satisfied": True, "plan_changed": False, "thought": "ok", "next_action": "continue"}),
            # deciding: done
            json.dumps({"decision": "done", "reason": "finished"}),
        ]
        worker, ws = _make_worker(responses)

        events = []
        async def collect():
            async for ev in worker.execute("list my files"):
                events.append(ev)
                if len(events) > 50:
                    break

        _run(collect())
        assert worker.state == WorkerState.DONE
        event_types = [json.loads(e[6:].strip())["type"] for e in events]
        assert "worker.tool_start" in event_types
        assert "worker.tool_result" in event_types

    def test_read_file_full_content_reaches_reflection_and_next_decision(self):
        """长文件正文不能只以 200 字事件摘要进入 Agent 上下文。"""
        marker = "FINAL_DECISION_B_PLUS_TREE_WITH_REAL_MEMBERS"
        source_content = "调研材料\n" + ("背景信息" * 700) + marker
        responses = [
            json.dumps({"decision": "tool_call", "reason": "先读取输入材料"}),
            json.dumps({
                "decision": "tool_call",
                "reason": "读取 team-report.md",
                "tool_name": "read_file",
                "tool_args": {"path": "team-report.md"},
            }),
            json.dumps({
                "satisfied": True,
                "plan_changed": False,
                "thought": "已读取完整材料",
                "next_action": "continue",
            }),
            json.dumps({"decision": "done", "reason": "已根据材料完成核对"}),
            json.dumps({
                "passed": True,
                "checked_constraints": [],
                "issues": [],
                "repair_instructions": "",
            }),
        ]
        ws = MockWorkspace()
        ws._files["team-report.md"] = source_content
        worker, _ = _make_worker(responses, workspace=ws)

        events = []

        async def collect():
            async for event in worker.execute("读取 team-report.md 并核对最终选题"):
                events.append(json.loads(event[6:].strip()))

        _run(collect())

        messages = worker._agent.autogen_agent.received_messages
        assert marker in messages[2][0].content  # reflection prompt
        assert marker in messages[3][0].content  # next decision prompt

        read_result = next(
            event for event in events
            if event["type"] == "worker.tool_result"
            and event["data"]["tool_name"] == "read_file"
        )
        assert len(read_result["data"]["result_summary"]) <= 200
        assert marker not in read_result["data"]["result_summary"]
        assert worker._tool_execution_ledger[0]["tool_name"] == "read_file"
        assert worker._tool_execution_ledger[0]["arguments"]["path"] == "team-report.md"
        assert worker._tool_execution_ledger[0]["success"] is True

    def test_write_file_triggers_file_updated(self):
        """write_file 成功后发射 file_updated 事件。"""
        responses = [
            json.dumps({"decision": "tool_call", "reason": "plan", "tool_name": "write_file",
                        "tool_args": {"path": "report.md", "content": "# Report"}}),
            json.dumps({"decision": "tool_call", "reason": "write", "tool_name": "write_file",
                        "tool_args": {"path": "report.md", "content": "# Report"}}),
            json.dumps({"satisfied": True, "plan_changed": False, "thought": "written", "next_action": "done"}),
        ]
        worker, ws = _make_worker(responses)

        events = []
        async def collect():
            async for ev in worker.execute("write a report"):
                events.append(ev)
                if len(events) > 50:
                    break

        _run(collect())
        event_types = [json.loads(e[6:].strip())["type"] for e in events]
        assert "worker.file_updated" in event_types
        record = worker._tool_execution_ledger[0]
        assert record["tool_name"] == "write_file"
        assert record["arguments"]["path"] == "report.md"
        assert record["arguments"]["content_chars"] == len("# Report")
        assert "content" not in record["arguments"]
        assert record["success"] is True

    def test_max_steps_forces_done(self):
        """超过 MAX_STEPS 强制终止。"""
        # 让 Agent 永远不调用 done
        responses = []
        for i in range(MAX_STEPS + 5):
            responses.append(json.dumps({
                "decision": "tool_call",
                "reason": f"step {i}",
                "tool_name": "list_files",
                "tool_args": {"directory": ""},
            }))
            # reflecting: continue
            responses.append(json.dumps({
                "satisfied": True, "plan_changed": False,
                "thought": "continue", "next_action": "continue",
            }))

        worker, ws = _make_worker(responses)

        events = []
        async def collect():
            async for ev in worker.execute("infinite task"):
                events.append(ev)
                if len(events) > 200:
                    break

        _run(collect())
        assert worker.state == WorkerState.DONE

    def test_cancel_stops_worker(self):
        """cancel() 在下一个检查点停止 Worker。"""
        responses = [
            json.dumps({"decision": "tool_call", "reason": "plan", "tool_name": "list_files", "tool_args": {}}),
        ]
        # 添加大量后续响应让 Worker 持续运行
        for _ in range(30):
            responses.append(json.dumps({"decision": "tool_call", "reason": "more", "tool_name": "list_files", "tool_args": {}}))
            responses.append(json.dumps({"satisfied": True, "plan_changed": False, "thought": "ok", "next_action": "continue"}))

        worker, ws = _make_worker(responses)

        events = []
        async def collect_and_cancel():
            async for ev in worker.execute("long task"):
                events.append(ev)
                worker.cancel()
                if len(events) > 50:
                    break

        _run(collect_and_cancel())
        # Worker 应该已停止
        event_types = [json.loads(e[6:].strip())["type"] for e in events]
        assert "worker.done" in event_types

    def test_non_idle_start_returns_error(self):
        """非 IDLE 状态调用 execute 返回错误。"""
        worker, ws = _make_worker([])
        worker._state = WorkerState.DONE  # 手动设为 DONE

        events = []
        async def collect():
            async for ev in worker.execute("task"):
                events.append(ev)

        _run(collect())
        assert len(events) == 1
        payload = json.loads(events[0][6:].strip())
        assert payload["type"] == "worker.error"

    def test_json_parse_error_returns_error(self):
        """计划 JSON 异常时使用兜底计划，不阻断真实执行。"""
        responses = [
            "This is not JSON at all",  # planning 失败
            "Also not JSON",            # retry 也失败
            json.dumps({"decision": "done", "reason": "fallback plan continued"}),
        ]
        worker, ws = _make_worker(responses)

        events = []
        async def collect():
            async for ev in worker.execute("task"):
                events.append(ev)
                if len(events) > 20:
                    break

        _run(collect())
        event_types = [json.loads(e[6:].strip())["type"] for e in events]
        assert "worker.error" not in event_types
        assert "worker.done" in event_types
        assert "worker.thought" in event_types

        retry_message = worker._agent.autogen_agent.received_messages[1][0].content
        assert "This is not JSON at all" in retry_message

    def test_deciding_parse_failure_is_recoverable(self):
        responses = [
            json.dumps({"decision": "tool_call", "reason": "plan"}),
            "not json",
            "still not json",
        ]
        worker, _ = _make_worker(responses)

        events = []

        async def collect():
            async for event in worker.execute("task"):
                events.append(json.loads(event[6:].strip()))

        _run(collect())

        errors = [event for event in events if event["type"] == "worker.error"]
        assert len(errors) == 1
        assert errors[0]["data"]["error_type"] == "json_parse_failure"
        assert errors[0]["data"]["recoverable"] is True
        assert worker._outcome == "needs_attention"

    def test_delivery_gate_revises_and_rechecks_failed_output(self):
        """最终产出违反任务约束时，退回修订并在复验通过后完成。"""
        failed_audit = {
            "passed": False,
            "checked_constraints": [{
                "constraint": "总时长必须为90分钟",
                "status": "fail",
                "evidence": "30+60+5=95分钟",
            }],
            "issues": ["时间分配合计95分钟，不是90分钟"],
            "repair_instructions": "把最后5分钟自评并入后60分钟。",
        }
        passed_audit = {
            "passed": True,
            "checked_constraints": [{
                "constraint": "总时长必须为90分钟",
                "status": "pass",
                "evidence": "30+25+5+25+5=90分钟",
            }],
            "issues": [],
            "repair_instructions": "",
        }
        responses = [
            json.dumps({"decision": "tool_call", "reason": "制定计划", "tool_name": "write_file", "tool_args": {}}),
            json.dumps({
                "decision": "tool_call", "reason": "写入初稿", "tool_name": "write_file",
                "tool_args": {"path": "plan.md", "content": "30分钟答疑 + 60分钟自学 + 5分钟自评"},
            }),
            json.dumps({"satisfied": True, "plan_changed": False, "thought": "已写入", "next_action": "done"}),
            json.dumps(failed_audit, ensure_ascii=False),
            json.dumps({
                "decision": "tool_call", "reason": "按验收意见修订时间", "tool_name": "write_file",
                "tool_args": {"path": "plan.md", "content": "30分钟答疑 + 25分钟复习 + 5分钟休息 + 25分钟练习 + 5分钟自评"},
            }),
            json.dumps({"satisfied": True, "plan_changed": False, "thought": "已修订", "next_action": "done"}),
            json.dumps(passed_audit, ensure_ascii=False),
        ]
        worker, ws = _make_worker(responses)

        events = []

        async def collect():
            async for ev in worker.execute("制定严格90分钟的学习计划并写入 plan.md"):
                events.append(ev)

        _run(collect())

        assert worker.state == WorkerState.DONE
        assert ws._files["plan.md"] == "30分钟答疑 + 25分钟复习 + 5分钟休息 + 25分钟练习 + 5分钟自评"
        payloads = [json.loads(event[6:].strip()) for event in events]
        audit_reflections = [
            payload for payload in payloads
            if payload["type"] == "worker.reflection"
            and "交付验收" in payload["data"].get("thought", "")
        ]
        assert [item["data"]["satisfied"] for item in audit_reflections] == [False, True]
        summaries = [payload for payload in payloads if payload["type"] == "worker.summary"]
        assert summaries
        assert "交付验收通过" in summaries[-1]["data"]["key_findings"][0]

    def test_delivery_revision_parse_failure_preserves_artifact_as_recoverable(self):
        """已有交付物时，验收修订阶段格式失败应标为可恢复而非致命失败。"""
        failed_audit = {
            "passed": False,
            "checked_constraints": [{
                "constraint": "报告需要补充来源",
                "status": "fail",
                "evidence": "当前产物没有来源说明",
            }],
            "issues": ["当前产物没有来源说明"],
            "repair_instructions": "补充来源说明。",
        }
        responses = [
            json.dumps({"decision": "tool_call", "reason": "先完成报告"}),
            json.dumps({
                "decision": "tool_call",
                "reason": "写入报告",
                "tool_name": "write_file",
                "tool_args": {"path": "output.md", "content": "# 已完成的调研报告"},
            }),
            json.dumps({
                "satisfied": True,
                "plan_changed": False,
                "thought": "报告已写入",
                "next_action": "done",
            }),
            json.dumps(failed_audit, ensure_ascii=False),
            "这是一段无法解析的修订说明",
            "仍然不是 JSON",
        ]
        worker, ws = _make_worker(responses)
        events = []

        async def collect():
            async for event in worker.execute("完成调研并写入 output.md"):
                events.append(json.loads(event[6:].strip()))

        _run(collect())

        errors = [event for event in events if event["type"] == "worker.error"]
        assert ws._files["output.md"] == "# 已完成的调研报告"
        assert len(errors) == 1
        assert errors[0]["data"]["error_type"] == "delivery_finalize_parse_failure"
        assert errors[0]["data"]["recoverable"] is True
        assert "产物已保存" in errors[0]["data"]["message"]
        assert not any(event["type"] == "worker.done" for event in events)

    def test_delivery_audit_exhaustion_needs_attention_instead_of_done(self):
        """连续验收失败必须进入可恢复错误，不能显示任务完成。"""
        failed_audit = {
            "passed": False,
            "checked_constraints": [{
                "constraint": "必须生成 final-proposal.md",
                "status": "fail",
                "evidence": "工作区没有产出文件",
            }],
            "issues": ["final-proposal.md 未生成"],
            "repair_instructions": "读取输入材料并生成 final-proposal.md。",
        }
        responses = [
            json.dumps({"decision": "done", "reason": "开始验收"}),
            json.dumps({"decision": "done", "reason": "无法生成文件"}),
            json.dumps(failed_audit, ensure_ascii=False),
            json.dumps({"decision": "done", "reason": "仍无法生成文件"}),
            json.dumps(failed_audit, ensure_ascii=False),
            json.dumps({"decision": "done", "reason": "工具不可用"}),
            json.dumps(failed_audit, ensure_ascii=False),
        ]
        worker, _ = _make_worker(responses)
        events = []

        async def collect():
            async for event in worker.execute("读取材料并生成 final-proposal.md"):
                events.append(json.loads(event[6:].strip()))

        _run(collect())

        errors = [event for event in events if event["type"] == "worker.error"]
        assert len(errors) == 1
        assert errors[0]["data"]["error_type"] == "delivery_validation_failed"
        assert errors[0]["data"]["recoverable"] is True
        assert worker._outcome == "needs_attention"
        assert not any(event["type"] == "worker.done" for event in events)
        assert not any(event["type"] == "worker.summary" for event in events)

    def test_delivery_snapshot_excludes_context_and_upstream_files(self):
        worker, ws = _make_worker([])
        ws._files = {
            "CONTEXT.md": "系统上下文",
            "shared/TASK.md": "团队任务",
            "upstream/step_1/output.md": "上一步结果",
            "output.md": "本步骤最终结果",
        }

        snapshot = _run(worker._collect_delivery_snapshot())

        assert "本步骤最终结果" in snapshot
        assert "上一步结果" not in snapshot
        assert "系统上下文" not in snapshot

    @pytest.mark.parametrize("status", ["fail", "unverifiable"])
    def test_delivery_gate_does_not_trust_conflicting_pass_flag(self, status):
        """存在失败或待核实约束时，即使 LLM 误写 passed=true 也不能放行。"""
        response = json.dumps({
            "passed": True,
            "checked_constraints": [{
                "constraint": "地点必须为合肥",
                "status": status,
                "evidence": "产出写成了上海",
            }],
            "issues": [],
            "repair_instructions": "将地点修正为合肥。",
        }, ensure_ascii=False)
        worker, ws = _make_worker([response])
        ws._files["result.md"] = "活动地点：上海"

        audit = _run(worker._audit_delivery("活动地点必须为合肥"))

        assert audit is not None
        assert audit["passed"] is False

    def test_deterministic_check_overrides_auditor_arithmetic_mistake(self):
        """验收 LLM 也算错时，程序计算仍必须拦截错误交付。"""
        auditor_wrongly_passes = json.dumps({
            "passed": True,
            "checked_constraints": [{
                "constraint": "总时长必须为90分钟",
                "status": "pass",
                "evidence": "声称已经核对",
            }],
            "issues": [],
            "repair_instructions": "",
        }, ensure_ascii=False)
        worker, ws = _make_worker([auditor_wrongly_passes])
        ws._files["plan.md"] = (
            "- 答疑：30分钟\n- 自学：25分钟\n- 练习：25分钟\n"
            "- 休息：5分钟\n- 自评：10分钟\n"
            "30 + 25 + 25 + 5 + 10 = 90分钟"
        )

        audit = _run(worker._audit_delivery("总时长严格等于90分钟"))

        assert audit is not None
        assert audit["passed"] is False
        assert any("程序合计 95 分钟" in issue for issue in audit["issues"])

    @pytest.mark.parametrize("record_success", [False, None])
    def test_delivery_gate_requires_successful_explicit_tool_evidence(self, record_success):
        """失败调用或完全没有调用时，不能靠文字声明通过工具步骤验收。"""
        auditor_wrongly_passes = json.dumps({
            "passed": True,
            "checked_constraints": [{
                "constraint": "使用 read_file 读取 team-report.md",
                "status": "pass",
                "evidence": "Agent 声称已经读取",
            }],
            "issues": [],
            "repair_instructions": "",
        }, ensure_ascii=False)
        worker, ws = _make_worker([auditor_wrongly_passes])
        ws._files["team-report.md"] = "真实输入材料"
        if record_success is not None:
            worker._record_tool_execution(
                "read_file",
                {"path": "team-report.md"},
                record_success,
                "文件不存在",
            )

        audit = _run(worker._audit_delivery(
            "请使用 read_file 读取 team-report.md，然后完成分析。"
        ))

        assert audit is not None
        assert audit["passed"] is False
        assert any("机器执行台账" in issue for issue in audit["issues"])

    def test_delivery_auditor_receives_successful_tool_ledger(self):
        """验收器能区分本轮调用、本轮写入和工作区既有文件。"""
        auditor_passes = json.dumps({
            "passed": True,
            "checked_constraints": [{
                "constraint": "读取输入并回读产出",
                "status": "pass",
                "evidence": "机器台账中三次调用均成功",
            }],
            "issues": [],
            "repair_instructions": "",
        }, ensure_ascii=False)
        worker, ws = _make_worker([auditor_passes])
        ws._files = {
            "team-report.md": "真实输入材料",
            "context-check.md": "核对结果",
            "final-proposal.md": "上一轮既有文件",
        }
        worker._files_created.append("context-check.md")
        worker._record_tool_execution(
            "read_file", {"path": "team-report.md"}, True, "读取成功"
        )
        worker._record_tool_execution(
            "write_file",
            {"path": "context-check.md", "content": "核对结果"},
            True,
            "写入成功",
        )
        worker._record_tool_execution(
            "read_file", {"path": "context-check.md"}, True, "回读成功"
        )

        audit = _run(worker._audit_delivery(
            "请使用 read_file 读取 team-report.md；"
            "然后使用 write_file 写入 context-check.md；"
            "最后使用 read_file 回读 context-check.md。"
        ))

        assert audit is not None
        assert audit["passed"] is True
        prompt = worker._agent.autogen_agent.received_messages[0][0].content
        assert "机器生成的本轮工具执行台账" in prompt
        assert '"tool_name": "read_file"' in prompt
        assert '"success": true' in prompt
        assert '"content_chars": 4' in prompt
        assert "context-check.md（4 bytes；本轮成功写入）" in prompt
        assert "final-proposal.md（7 bytes；工作区既有（本轮未写入））" in prompt

    def test_forbidden_tool_clause_is_not_misread_as_requirement(self):
        """“不要读取某文件”不能被程序反向要求必须读取。"""
        from engines.worker.delivery_validation import validate_tool_execution

        issues = validate_tool_execution(
            "不要使用 read_file 读取 final-proposal.md；"
            "请使用 read_file 读取 team-report.md。",
            [{
                "tool_name": "read_file",
                "arguments": {"path": "team-report.md"},
                "success": True,
            }],
        )

        assert issues == []


class TestAgentWorkerFileLock:
    """文件锁测试。"""

    def test_lock_unlock(self):
        """lock_file / unlock_file 正确管理。"""
        worker, _ = _make_worker([])
        worker.lock_file("report.md")
        assert worker.is_file_locked("report.md")
        worker.unlock_file("report.md")
        assert not worker.is_file_locked("report.md")

    def test_locked_file_blocks_write(self):
        """锁定的文件在 write_file 工具中被拒绝。"""
        responses = [
            json.dumps({"decision": "tool_call", "reason": "plan", "tool_name": "write_file",
                        "tool_args": {"path": "report.md", "content": "v1"}}),
            json.dumps({"decision": "tool_call", "reason": "write", "tool_name": "write_file",
                        "tool_args": {"path": "report.md", "content": "v2"}}),
            json.dumps({"satisfied": True, "plan_changed": False, "thought": "ok", "next_action": "done"}),
        ]
        worker, ws = _make_worker(responses)
        worker.lock_file("report.md")

        events = []
        async def collect():
            async for ev in worker.execute("write report"):
                events.append(ev)
                if len(events) > 30:
                    break

        _run(collect())
        # 应该看到 tool_result 中 success=False（因为文件被锁）
        for ev_str in events:
            payload = json.loads(ev_str[6:].strip())
            if payload["type"] == "worker.tool_result":
                assert payload["data"]["success"] is False
                break
