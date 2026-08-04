"""Step T10: E2E Worker 全链路测试。

覆盖 Plan 要求的完整链路：任务 → 计划 → 工具调用 → 写文件 → 反思 → 完成。
使用 Mock LLM 模拟完整决策流程（无需真实网络）。

真实 LLM 测试需手动运行: pytest -m e2e_worker tests/worker/test_e2e_worker.py
"""

import asyncio
import json
import tempfile

import pytest

from engines.worker.engine import AgentWorker, _sse_event, _safe_json_parse
from engines.worker.state_machine import WorkerState, MAX_STEPS
from engines.worker.workspace import LocalWorkspace, FileInfo, SandboxResult, WorkspaceProvider


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
    def __init__(self, name="E2EWorker"):
        self.name = name


class MockAutogenAgent:
    def __init__(self, responses: list[str]):
        self._responses = responses
        self._idx = 0

    async def on_messages(self, messages, cancellation_token=None):
        resp = self._responses[self._idx] if self._idx < len(self._responses) else json.dumps(
            {"decision": "done", "reason": "mock done"}
        )
        self._idx += 1

        class Msg:
            def __init__(self, c): self.content = c
        class Result:
            def __init__(self, c): self.chat_message = Msg(c)
        return Result(resp)


class MockLifeAgent:
    def __init__(self, responses: list[str]):
        self.persona = MockPersona()
        self.autogen_agent = MockAutogenAgent(responses)


def _collect_events(worker, task: str, max_events=100):
    """运行 worker 并收集所有 SSE 事件。"""
    events = []
    async def _collect():
        async for ev in worker.execute(task):
            events.append(ev)
            if len(events) >= max_events:
                break
    _run(_collect())
    return events


def _parse_events(events: list[str]) -> list[dict]:
    """解析 SSE 事件字符串为 dict 列表。"""
    result = []
    for ev in events:
        if ev.startswith("data: "):
            result.append(json.loads(ev[6:].strip()))
    return result


# =============================================================================
# E2E: 完整任务链路（Mock LLM）
# =============================================================================


class TestE2EFullWorkflow:
    """E2E 全链路：任务 → 计划 → 搜索 → 写文件 → 自检 → 完成。"""

    def test_task_to_completion(self):
        """完整链路：任务 → 计划 → 写文件 → 反思 → 完成。"""
        responses = [
            # 1. Planning: 制定计划
            json.dumps({
                "decision": "tool_call",
                "reason": "先制定计划：写一份简短报告",
                "tool_name": "write_file",
                "tool_args": {"path": "plan.md", "content": "# Plan\n1. Write report"},
            }),
            # 2. Deciding: 写报告
            json.dumps({
                "decision": "tool_call",
                "reason": "写报告文件",
                "tool_name": "write_file",
                "tool_args": {"path": "report.md", "content": "# Report\nThis is a test report."},
            }),
            # 3. Reflecting: 满意，继续
            json.dumps({
                "satisfied": True,
                "plan_changed": False,
                "thought": "报告已写好",
                "next_action": "continue",
            }),
            # 4. Deciding: 完成
            json.dumps({
                "decision": "done",
                "reason": "报告已完成，任务结束",
            }),
        ]

        ws = MockWorkspace()
        agent = MockLifeAgent(responses)
        worker = AgentWorker(agent, workspace=ws)

        events = _collect_events(worker, "写一份简短报告")
        parsed = _parse_events(events)
        event_types = [e["type"] for e in parsed]

        # 验证完整事件流
        assert "worker.started" in event_types, "缺少 worker.started"
        assert "worker.plan" in event_types, "缺少 worker.plan"
        assert "worker.tool_start" in event_types, "缺少 worker.tool_start"
        assert "worker.tool_result" in event_types, "缺少 worker.tool_result"
        assert "worker.file_updated" in event_types, "缺少 worker.file_updated"
        assert "worker.reflection" in event_types, "缺少 worker.reflection"
        assert "worker.done" in event_types, "缺少 worker.done"
        assert "worker.summary" in event_types, "缺少 worker.summary"

        # 验证最终状态
        assert worker.state == WorkerState.DONE

        # 验证文件确实写入了
        assert "report.md" in ws._files
        assert "Report" in ws._files["report.md"]

    def test_tool_error_recovery(self):
        """工具失败后 Agent 调整策略。"""
        responses = [
            # 0. Planning: 制定计划
            json.dumps({
                "decision": "tool_call",
                "reason": "读取已有数据",
                "tool_name": "read_file",
                "tool_args": {"path": "nonexistent.txt"},
            }),
            # 1. Deciding: 尝试读不存在的文件
            json.dumps({
                "decision": "tool_call",
                "reason": "读取数据",
                "tool_name": "read_file",
                "tool_args": {"path": "nonexistent.txt"},
            }),
            # 2. Reflecting: 不满意，调整
            json.dumps({
                "satisfied": False,
                "plan_changed": True,
                "thought": "文件不存在，改为直接创建",
                "next_action": "continue",
            }),
            # 3. Deciding: 创建文件
            json.dumps({
                "decision": "tool_call",
                "reason": "直接创建文件",
                "tool_name": "write_file",
                "tool_args": {"path": "data.txt", "content": "fresh data"},
            }),
            # 4. Reflecting: 满意
            json.dumps({
                "satisfied": True,
                "plan_changed": False,
                "thought": "ok",
                "next_action": "done",
            }),
        ]

        ws = MockWorkspace()
        agent = MockLifeAgent(responses)
        worker = AgentWorker(agent, workspace=ws)

        events = _collect_events(worker, "读取数据并处理")
        parsed = _parse_events(events)
        event_types = [e["type"] for e in parsed]

        # 验证工具执行了（包括失败的）
        assert "worker.tool_result" in event_types

        # 验证最终完成
        assert worker.state == WorkerState.DONE
        assert "data.txt" in ws._files

    def test_multiple_tools_sequential(self):
        """多工具顺序执行：list → write → read → done。"""
        responses = [
            # 0. planning
            json.dumps({"decision": "tool_call", "reason": "plan", "tool_name": "list_files", "tool_args": {"directory": ""}}),
            # 1. deciding: list_files
            json.dumps({"decision": "tool_call", "reason": "list", "tool_name": "list_files", "tool_args": {"directory": ""}}),
            # 2. reflecting
            json.dumps({"satisfied": True, "plan_changed": False, "thought": "listed", "next_action": "continue"}),
            # 3. deciding: write
            json.dumps({"decision": "tool_call", "reason": "write", "tool_name": "write_file",
                        "tool_args": {"path": "output.txt", "content": "hello world"}}),
            # 4. reflecting
            json.dumps({"satisfied": True, "plan_changed": False, "thought": "written", "next_action": "continue"}),
            # 5. deciding: read back
            json.dumps({"decision": "tool_call", "reason": "verify", "tool_name": "read_file",
                        "tool_args": {"path": "output.txt"}}),
            # 6. reflecting
            json.dumps({"satisfied": True, "plan_changed": False, "thought": "verified", "next_action": "done"}),
        ]

        ws = MockWorkspace()
        agent = MockLifeAgent(responses)
        worker = AgentWorker(agent, workspace=ws)

        events = _collect_events(worker, "write and verify")
        parsed = _parse_events(events)

        tool_names = [
            e["data"]["tool_name"]
            for e in parsed
            if e["type"] == "worker.tool_start"
        ]
        assert "list_files" in tool_names
        assert "write_file" in tool_names
        assert "read_file" in tool_names
        assert worker.state == WorkerState.DONE


class TestE2ESSEEventIntegrity:
    """SSE 事件完整性测试。"""

    def test_all_events_have_required_fields(self):
        """所有 SSE 事件包含 type, data, timestamp。"""
        responses = [
            json.dumps({"decision": "tool_call", "reason": "plan", "tool_name": "list_files", "tool_args": {}}),
            json.dumps({"decision": "done", "reason": "done"}),
        ]
        ws = MockWorkspace()
        agent = MockLifeAgent(responses)
        worker = AgentWorker(agent, workspace=ws)

        events = _collect_events(worker, "test")
        parsed = _parse_events(events)

        for event in parsed:
            assert "type" in event, f"事件缺少 type: {event}"
            assert "data" in event, f"事件缺少 data: {event}"
            assert "timestamp" in event, f"事件缺少 timestamp: {event}"

    def test_started_event_has_run_id(self):
        """worker.started 包含 run_id。"""
        responses = [json.dumps({"decision": "done", "reason": "plan"})]
        ws = MockWorkspace()
        agent = MockLifeAgent(responses)
        worker = AgentWorker(agent, workspace=ws)

        events = _collect_events(worker, "test")
        parsed = _parse_events(events)

        started = [e for e in parsed if e["type"] == "worker.started"]
        assert len(started) == 1
        assert "run_id" in started[0]["data"]
        assert "agent_name" in started[0]["data"]
        assert "task" in started[0]["data"]

    def test_done_event_has_files(self):
        """worker.done 包含文件列表。"""
        responses = [
            json.dumps({"decision": "tool_call", "reason": "plan", "tool_name": "write_file",
                        "tool_args": {"path": "result.txt", "content": "data"}}),
            json.dumps({"satisfied": True, "plan_changed": False, "thought": "ok", "next_action": "done"}),
        ]
        ws = MockWorkspace()
        agent = MockLifeAgent(responses)
        worker = AgentWorker(agent, workspace=ws)

        events = _collect_events(worker, "write result")
        parsed = _parse_events(events)

        done_events = [e for e in parsed if e["type"] == "worker.done"]
        assert len(done_events) == 1
        assert "files" in done_events[0]["data"]
        assert "total_steps" in done_events[0]["data"]
