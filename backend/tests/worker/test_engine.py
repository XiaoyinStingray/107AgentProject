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

    async def on_messages(self, messages, cancellation_token=None):
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
        """LLM 返回完全无效的 JSON → ERROR。"""
        responses = [
            "This is not JSON at all",  # planning 失败
            "Also not JSON",            # retry 也失败
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
        assert "worker.error" in event_types


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
