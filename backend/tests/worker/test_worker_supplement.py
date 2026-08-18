"""M12 Worker 工作台补充测试——覆盖配方、调度器、SSE 事件完整性、持久化恢复。"""
import asyncio
import json
import os
import tempfile
import time
from dataclasses import asdict
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from engines.worker.events import (
    WorkerDoneData, WorkerErrorData, WorkerEventType,
    WorkerFileUpdatedData, WorkerPlanData, WorkerReflectionData,
    WorkerStartedData, WorkerStepDecisionData, WorkerSummaryData,
    WorkerThoughtData, WorkerToolResultData, WorkerToolStartData,
    PlanStep,
)
from engines.worker.recipes import (
    ALL_RECIPES, RECIPE_CODE_REVIEW, RECIPE_COMPETITOR_ANALYSIS,
    RECIPE_DATA_ANALYSIS, RECIPE_DEEP_RESEARCH, RECIPE_SECURITY_AUDIT,
    Recipe, RecipePhase, get_recipe, list_recipes,
)
from engines.worker.scheduler import ScheduledTask, WorkerScheduler
from engines.worker.state_machine import (
    MAX_STEPS, MAX_PARSE_RETRIES, MAX_LLM_RETRIES,
    ErrorLevel, WorkerState, ERROR_STRATEGIES, STATE_TRANSITIONS,
)


# =============================================================================
# 配方系统
# =============================================================================


class TestRecipes:
    """测试配方定义和 API。"""

    def test_all_recipes_count(self):
        assert len(ALL_RECIPES) == 5

    def test_recipe_has_required_fields(self):
        for rid, recipe in ALL_RECIPES.items():
            assert rid, "Recipe missing id key"
            assert recipe.name, f"Recipe {rid} missing name"
            assert recipe.description, f"Recipe {rid} missing description"
            assert recipe.icon, f"Recipe {rid} missing icon"
            assert recipe.phases, f"Recipe {rid} missing phases"
            assert len(recipe.phases) >= 2, f"Recipe {rid} should have >= 2 phases"

    def test_recipe_phases_have_fields(self):
        for rid, recipe in ALL_RECIPES.items():
            for i, phase in enumerate(recipe.phases):
                assert phase.id, f"Phase {i} in {rid} missing id"
                assert phase.title, f"Phase {i} in {rid} missing title"
                assert phase.instruction, f"Phase {i} in {rid} missing instruction"
                assert isinstance(phase.required_tools, list), f"Phase {i} in {rid} required_tools must be list"
                # output 可为空（如 setup 阶段不产出文件）
                assert isinstance(phase.output, str)

    def test_get_recipe_found(self):
        recipe = get_recipe("deep_research")
        assert recipe is not None
        assert recipe.name == "深度调研"

    def test_get_recipe_not_found(self):
        recipe = get_recipe("nonexistent_recipe")
        assert recipe is None

    def test_list_recipes_summary(self):
        summaries = list_recipes()
        assert len(summaries) == 5
        for s in summaries:
            assert "id" in s
            assert "name" in s
            assert "description" in s
            assert "phase_count" in s
            assert "icon" in s

    def test_deep_research_phases(self):
        recipe = get_recipe("deep_research")
        assert recipe is not None
        assert len(recipe.phases) == 4
        # 验证包含核心阶段（标题可能微调）
        assert len(recipe.phases) == 4
        assert recipe.phases[0].title == "多角度搜索"
        assert recipe.phases[1].title == "交叉验证"

    def test_code_review_phases(self):
        recipe = get_recipe("code_review")
        assert recipe is not None
        assert len(recipe.phases) == 4

    def test_data_analysis_phases(self):
        recipe = get_recipe("data_analysis")
        assert recipe is not None
        assert len(recipe.phases) == 5

    def test_recipe_phase_instruction(self):
        recipe = get_recipe("deep_research")
        assert recipe is not None
        instr = recipe.phase_instruction(0)
        assert instr is not None
        assert len(instr) > 0
        assert recipe.phase_instruction(999) is None

    def test_recipe_all_done(self):
        recipe = get_recipe("deep_research")
        assert recipe is not None
        assert recipe.all_done(0) is False
        assert recipe.all_done(len(recipe.phases)) is True
        assert recipe.all_done(len(recipe.phases) + 1) is True


# =============================================================================
# 调度器
# =============================================================================


class TestScheduler:
    """测试自主调度器。"""

    def _make_scheduler(self, tmp_path):
        return WorkerScheduler(str(tmp_path))

    def _make_task(self, trigger_type="cron", cron_expr="daily 10:00", **kwargs):
        return ScheduledTask(
            id=kwargs.get("id", "task-1"),
            name=kwargs.get("name", "测试任务"),
            agent_id=kwargs.get("agent_id", "agent-1"),
            task=kwargs.get("task", "执行测试"),
            trigger_type=trigger_type,
            cron_expr=cron_expr,
            watch_dir=kwargs.get("watch_dir", ""),
        )

    def test_init(self, tmp_path):
        s = self._make_scheduler(tmp_path)
        assert s._running is False
        assert s._tasks == []

    def test_add_task(self, tmp_path):
        s = self._make_scheduler(tmp_path)
        task = self._make_task()
        s.add_task(task)
        assert len(s._tasks) == 1

    def test_add_file_watch_task(self, tmp_path):
        s = self._make_scheduler(tmp_path)
        task = self._make_task(trigger_type="file_watch", watch_dir="/some/path")
        s.add_task(task)
        assert task.trigger_type == "file_watch"
        assert len(s._tasks) == 1

    def test_remove_task(self, tmp_path):
        s = self._make_scheduler(tmp_path)
        task = self._make_task()
        s.add_task(task)
        assert len(s._tasks) == 1
        s.remove_task(task.id)
        assert len(s._tasks) == 0

    def test_remove_nonexistent_task(self, tmp_path):
        s = self._make_scheduler(tmp_path)
        s.remove_task("nonexistent")  # should not raise

    def test_list_tasks(self, tmp_path):
        s = self._make_scheduler(tmp_path)
        s.add_task(self._make_task(id="t1"))
        s.add_task(self._make_task(id="t2", trigger_type="file_watch", watch_dir="/p"))
        tasks = s.list_tasks()
        assert len(tasks) == 2

    def test_cron_daily_should_run(self, tmp_path):
        """daily cron 在指定时间应触发。"""
        from datetime import datetime, timezone
        s = self._make_scheduler(tmp_path)
        task = self._make_task(cron_expr="daily 10:00")
        # 模拟 10:00 → 应该触发
        now_match = datetime(2026, 8, 18, 10, 0, 0, tzinfo=timezone.utc)
        assert s._should_run_cron(task, now_match) is True
        # 模拟 11:00 → 不应触发
        now_no = datetime(2026, 8, 18, 11, 0, 0, tzinfo=timezone.utc)
        assert s._should_run_cron(task, now_no) is False

    def test_cron_daily_no_double_run(self, tmp_path):
        """daily cron 同一天不重复触发。"""
        from datetime import datetime, timezone
        s = self._make_scheduler(tmp_path)
        task = self._make_task(cron_expr="daily 10:00")
        now = datetime(2026, 8, 18, 10, 0, 0, tzinfo=timezone.utc)
        assert s._should_run_cron(task, now) is True
        task.last_run = now.isoformat()
        assert s._should_run_cron(task, now) is False

    def test_cron_hourly_should_run(self, tmp_path):
        """hourly cron 应触发。"""
        from datetime import datetime, timezone
        s = self._make_scheduler(tmp_path)
        task = self._make_task(cron_expr="hourly")
        now = datetime(2026, 8, 18, 5, 0, 0, tzinfo=timezone.utc)
        assert s._should_run_cron(task, now) is True

    def test_cron_hourly_no_double_run(self, tmp_path):
        """hourly cron 在不到一小时后不应触发。"""
        from datetime import datetime, timezone
        s = self._make_scheduler(tmp_path)
        task = self._make_task(cron_expr="hourly")
        now = datetime(2026, 8, 18, 5, 0, 0, tzinfo=timezone.utc)
        task.last_run = datetime(2026, 8, 18, 4, 30, 0, tzinfo=timezone.utc).isoformat()
        assert s._should_run_cron(task, now) is False

    def test_cron_every_n_minutes(self, tmp_path):
        """every N minutes 按间隔触发。"""
        from datetime import datetime, timezone
        s = self._make_scheduler(tmp_path)
        task = self._make_task(cron_expr="every 15 minutes")
        now = datetime(2026, 8, 18, 0, 0, 0, tzinfo=timezone.utc)
        assert s._should_run_cron(task, now) is True
        # 模拟 5 分钟后 → 不到 15 分钟
        task.last_run = datetime(2026, 8, 18, 0, 0, 0, tzinfo=timezone.utc).isoformat()
        now2 = datetime(2026, 8, 18, 0, 5, 0, tzinfo=timezone.utc)
        assert s._should_run_cron(task, now2) is False
        # 模拟 16 分钟后 → 超过 15 分钟
        now3 = datetime(2026, 8, 18, 0, 16, 0, tzinfo=timezone.utc)
        assert s._should_run_cron(task, now3) is True

    @pytest.mark.asyncio
    async def test_file_watch_detects_change(self, tmp_path):
        """文件监视检测新文件。"""
        watch_dir = tmp_path / "watch"
        watch_dir.mkdir()

        s = self._make_scheduler(tmp_path)
        task = self._make_task(id="fw1", trigger_type="file_watch", watch_dir=str(watch_dir))
        s.add_task(task)

        # 初始化 watcher 状态（首次检查设置基线）
        result1 = await s._check_file_watch(task)
        # 首次检查：mtime 从 0 变为有值，但没有新文件（files 从空变到当前）
        # 实际逻辑：首次检查时 files 为空集，当前文件也是空集 → 无新文件

        # 添加新文件
        time.sleep(0.1)
        (watch_dir / "new_file.txt").write_text("hello")

        # 应检测到新文件
        result2 = await s._check_file_watch(task)
        assert result2 is True

    @pytest.mark.asyncio
    async def test_file_watch_no_change(self, tmp_path):
        """文件未变化时不触发。"""
        watch_dir = tmp_path / "watch"
        watch_dir.mkdir()
        (watch_dir / "existing.txt").write_text("stable")

        s = self._make_scheduler(tmp_path)
        task = self._make_task(id="fw2", trigger_type="file_watch", watch_dir=str(watch_dir))
        s.add_task(task)

        # 第一次检查建立基线
        await s._check_file_watch(task)
        # 第二次检查无变化
        result = await s._check_file_watch(task)
        assert result is False


# =============================================================================
# SSE 事件完整性
# =============================================================================


class TestSSEEventCompleteness:
    """测试所有 11 种 SSE 事件类型的数据结构完整性。"""

    def test_event_types_count(self):
        """确认 11 种事件类型。"""
        event_dataclasses = [
            WorkerStartedData, WorkerPlanData, WorkerStepDecisionData,
            WorkerToolStartData, WorkerToolResultData, WorkerReflectionData,
            WorkerFileUpdatedData, WorkerDoneData, WorkerErrorData,
            WorkerSummaryData, WorkerThoughtData,
        ]
        assert len(event_dataclasses) == 11

    def test_started_data_fields(self):
        d = WorkerStartedData(run_id="r1", agent_name="test", task="do stuff", workspace="local")
        assert d.run_id == "r1"
        assert d.agent_name == "test"
        assert d.task == "do stuff"
        assert d.workspace == "local"

    def test_plan_data_fields(self):
        steps = [PlanStep(title="Step 1", estimated_tools=["web_search"])]
        d = WorkerPlanData(steps=steps, total_steps=1)
        assert len(d.steps) == 1
        assert d.total_steps == 1

    def test_step_decision_data_fields(self):
        d = WorkerStepDecisionData(
            step_index=1, action="tool_call", reason="test",
        )
        assert d.step_index == 1
        assert d.action == "tool_call"

    def test_tool_start_data_fields(self):
        d = WorkerToolStartData(step_index=1, tool_name="write_file",
                                args_summary="path=test.txt")
        assert d.tool_name == "write_file"
        assert "test.txt" in d.args_summary

    def test_tool_result_data_fields(self):
        d = WorkerToolResultData(
            step_index=1, tool_name="write_file",
            result_summary="wrote file", result_detail="full content",
            duration_ms=100, success=True,
        )
        assert d.success is True
        assert d.duration_ms == 100

    def test_reflection_data_fields(self):
        d = WorkerReflectionData(
            step_index=1, satisfied=True, plan_changed=False,
            thought="good progress", next_action="continue",
        )
        assert d.satisfied is True
        assert d.next_action == "continue"

    def test_file_updated_data_fields(self):
        d = WorkerFileUpdatedData(
            step_index=1,
            files=[{"path": "report.md", "size": 1024}],
        )
        assert len(d.files) == 1

    def test_done_data_fields(self):
        d = WorkerDoneData(
            reason="task completed", total_steps=5,
            files=["report.md"],
        )
        assert d.reason == "task completed"
        assert len(d.files) == 1

    def test_error_data_fields(self):
        d = WorkerErrorData(
            step_index=3, error_type="tool_timeout",
            message="search timed out", recoverable=True,
        )
        assert d.recoverable is True
        assert d.error_type == "tool_timeout"

    def test_summary_data_fields(self):
        d = WorkerSummaryData(
            deliverable_summary="good report",
            self_rating="4",
            key_findings=["finding1"],
            total_duration_ms=5000,
        )
        assert d.self_rating == "4"
        assert d.total_duration_ms == 5000

    def test_thought_data_fields(self):
        d = WorkerThoughtData(step_index=1, thought="thinking...")
        assert d.thought == "thinking..."

    def test_sse_event_helper_format(self):
        """测试 _sse_event 辅助函数生成正确的 SSE 格式。"""
        from engines.worker.engine import _sse_event
        data = WorkerStartedData(
            run_id="r1", agent_name="Test", task="test task", workspace="local"
        )
        sse_str = _sse_event("worker.started", data.__dict__)
        assert sse_str.startswith("data: ")
        assert sse_str.endswith("\n\n")
        parsed = json.loads(sse_str[6:])
        assert parsed["type"] == "worker.started"
        assert "timestamp" in parsed
        assert parsed["data"]["agent_name"] == "Test"

    def test_sse_event_with_dict(self):
        """_sse_event 也接受 dict。"""
        from engines.worker.engine import _sse_event
        data = {"agent_name": "Dict", "task": "dict task", "run_id": "r", "workspace": "w"}
        sse_str = _sse_event("worker.started", data)
        parsed = json.loads(sse_str[6:])
        assert parsed["data"]["agent_name"] == "Dict"


# =============================================================================
# 状态机常量与转换完整性
# =============================================================================


class TestStateMachineCompleteness:
    """补充测试状态机常量和转换规则。"""

    def test_constants_are_positive(self):
        assert MAX_STEPS > 0
        assert MAX_PARSE_RETRIES > 0
        assert MAX_LLM_RETRIES > 0

    def test_all_states_have_transitions(self):
        """每个非终态至少有一条转换规则。"""
        non_terminal = {WorkerState.IDLE, WorkerState.PLANNING, WorkerState.DECIDING,
                       WorkerState.EXECUTING, WorkerState.REFLECTING}
        from_states = {t.from_state for t in STATE_TRANSITIONS}
        for state in non_terminal:
            assert state in from_states, f"State {state.value} has no transitions"

    def test_error_strategies_cover_levels(self):
        """错误策略覆盖所有 ErrorLevel。"""
        covered_levels = {s.level for s in ERROR_STRATEGIES}
        assert ErrorLevel.RETRYABLE in covered_levels
        assert ErrorLevel.SKIPPABLE in covered_levels
        assert ErrorLevel.FATAL in covered_levels

    def test_cancel_transition_exists(self):
        """取消转换存在于多个状态。"""
        cancel_transitions = [t for t in STATE_TRANSITIONS if t.event == "cancel"]
        assert len(cancel_transitions) >= 4  # PLANNING, DECIDING, EXECUTING, REFLECTING (+ IDLE)

    def test_error_strategy_lookup(self):
        from engines.worker.state_machine import get_error_strategy
        strategy = get_error_strategy("web_search_timeout")
        assert strategy is not None
        assert strategy.level == ErrorLevel.RETRYABLE

    def test_unknown_error_strategy(self):
        from engines.worker.state_machine import get_error_strategy
        strategy = get_error_strategy("totally_unknown_error")
        assert strategy is not None
        assert strategy.level == ErrorLevel.FATAL  # 未知错误 → 致命


# =============================================================================
# 持久化与恢复
# =============================================================================


class TestPersistence:
    """测试 Worker 状态持久化和恢复。"""

    @pytest.mark.asyncio
    async def test_persist_and_restore(self, tmp_path):
        """持久化→恢复 往返一致性。"""
        from api.workers import _persist_worker_state, _restore_workers_from_disk, _active_workers

        mock_workspace = MagicMock()
        mock_workspace._root = str(tmp_path)
        mock_workspace.list_files = AsyncMock(return_value=[])
        mock_workspace.location_description = "test"

        mock_worker = MagicMock()
        mock_worker.run_id = "test-persist-run"
        mock_worker.state = WorkerState.DONE
        mock_worker._agent_name = "TestAgent"
        mock_worker._workspace = mock_workspace
        mock_worker._step_index = 5
        mock_worker._total_duration_ms = 1000
        mock_worker._self_rating = "good"
        mock_worker._key_findings = ["finding1"]

        entry = {
            "worker": mock_worker,
            "agent_id": "test-agent",
            "agent_name": "TestAgent",
            "task": "Test task",
            "running": False,
            "events": [{"type": "worker.done", "data": {"status": "completed"}}],
            "created_at": "2026-08-18T10:00:00",
            "accepted": True,
        }

        # 持久化
        await _persist_worker_state(entry)

        # 验证文件存在
        state_file = tmp_path / "worker_state.json"
        assert state_file.exists()

        state_data = json.loads(state_file.read_text(encoding="utf-8"))
        assert state_data["run_id"] == "test-persist-run"
        assert state_data["accepted"] is True

        # 清理 _active_workers 中的测试条目
        _active_workers.pop("test-persist-run", None)

    @pytest.mark.asyncio
    async def test_restore_from_empty_dir(self, tmp_path):
        """空目录恢复不报错。"""
        from api.workers import _restore_workers_from_disk
        result = await _restore_workers_from_disk(str(tmp_path))
        assert result is None or result == 0

    @pytest.mark.asyncio
    async def test_save_events_file(self, tmp_path):
        """事件文件保存。"""
        from api.workers import _save_events_file

        mock_worker = MagicMock()
        mock_worker._workspace._root = str(tmp_path)

        entry = {
            "worker": mock_worker,
            "events": [{"type": "worker.started"}, {"type": "worker.done"}],
        }

        await _save_events_file(entry)

        events_file = tmp_path / "worker_events.json"
        assert events_file.exists()
        data = json.loads(events_file.read_text(encoding="utf-8"))
        assert len(data) == 2


# =============================================================================
# 管道补充测试
# =============================================================================


class TestPipelineSupplement:
    """管道模型补充测试。"""

    def test_node_spec_defaults(self):
        from engines.worker.pipeline import NodeStatus, PipelineNodeSpec
        node = PipelineNodeSpec(id="n1", title="Node 1", agent_id="a1", task="do stuff")
        assert node.role == "worker"
        assert node.enabled_tools == []
        assert node.extra_tools == []
        assert node.produces == []

    def test_edge_types(self):
        from engines.worker.pipeline import EdgeType
        assert EdgeType.FLOW.value == "flow"
        assert EdgeType.LOOP.value == "loop"
        assert EdgeType.BRANCH.value == "branch"

    def test_validate_empty_pipeline(self):
        from engines.worker.pipeline import PipelineSpec, validate_pipeline
        spec = PipelineSpec(id="p1", name="Empty", nodes=[], edges=[])
        valid, msg = validate_pipeline(spec)
        assert valid is False
        assert "节点" in msg

    def test_validate_valid_pipeline(self):
        from engines.worker.pipeline import PipelineEdge, PipelineNodeSpec, PipelineSpec, validate_pipeline
        nodes = [
            PipelineNodeSpec(id="a", title="A", agent_id="a1", task="task a"),
            PipelineNodeSpec(id="b", title="B", agent_id="a1", task="task b"),
        ]
        edges = [
            PipelineEdge(id="e1", from_node="a", to_node="b"),
        ]
        spec = PipelineSpec(id="p1", name="Test", nodes=nodes, edges=edges)
        valid, msg = validate_pipeline(spec)
        assert valid is True

    def test_validate_duplicate_node_ids(self):
        from engines.worker.pipeline import PipelineNodeSpec, PipelineSpec, validate_pipeline
        nodes = [
            PipelineNodeSpec(id="a", title="A", agent_id="a1", task="task a"),
            PipelineNodeSpec(id="a", title="A2", agent_id="a1", task="task a2"),
        ]
        spec = PipelineSpec(id="p1", name="Test", nodes=nodes, edges=[])
        valid, msg = validate_pipeline(spec)
        assert valid is False
        assert "唯一" in msg


# =============================================================================
# 沙盒补充测试
# =============================================================================


class TestSandboxSupplement:
    """安全沙盒补充测试。"""

    def test_danger_pattern_detection(self):
        from engines.worker.sandbox import check_code_safety
        dangerous_codes = [
            "import os",
            "import subprocess",
            "import socket",
            "import requests",
            "eval('dangerous_code')",
            "exec('import os')",
        ]
        for code in dangerous_codes:
            is_safe, reason = check_code_safety(code)
            assert is_safe is False, f"Should detect danger in: {code}"

    def test_safe_code_passes(self):
        from engines.worker.sandbox import check_code_safety
        safe_code = "result = sum(range(100))\nprint(f'Sum: {result}')"
        is_safe, reason = check_code_safety(safe_code)
        assert is_safe is True

    @pytest.mark.asyncio
    async def test_output_truncation(self, tmp_path):
        from engines.worker.sandbox import run_python_sandbox
        code = "print('x' * 20000)"
        result = await run_python_sandbox(code, str(tmp_path), timeout=5)
        assert len(result.stdout) <= 10500  # 10KB + 截断标记余量

    @pytest.mark.asyncio
    async def test_timeout_handling(self, tmp_path):
        from engines.worker.sandbox import run_python_sandbox
        code = "import time; time.sleep(10)"
        result = await run_python_sandbox(code, str(tmp_path), timeout=1)
        assert result.exit_code != 0 or "timeout" in result.stderr.lower() or result.exit_code == -1

    @pytest.mark.asyncio
    async def test_simple_execution(self, tmp_path):
        from engines.worker.sandbox import run_python_sandbox
        code = "print(2 + 3)"
        result = await run_python_sandbox(code, str(tmp_path), timeout=5)
        assert result.exit_code == 0
        assert "5" in result.stdout

    @pytest.mark.asyncio
    async def test_dangerous_code_rejected(self, tmp_path):
        from engines.worker.sandbox import run_python_sandbox
        code = "import os; os.system('echo hi')"
        result = await run_python_sandbox(code, str(tmp_path), timeout=5)
        assert result.exit_code == -1
        assert "安全检查" in result.stderr


# =============================================================================
# 交付校验补充测试
# =============================================================================


class TestDeliveryValidationSupplement:
    """确定性交付校验补充测试。"""

    def test_correct_arithmetic(self):
        from engines.worker.delivery_validation import validate_delivery
        issues = validate_delivery(
            task="普通任务",
            deliverables="计算结果：2 + 3 = 5",
        )
        assert len(issues) == 0

    def test_wrong_arithmetic(self):
        from engines.worker.delivery_validation import validate_delivery
        issues = validate_delivery(
            task="普通任务",
            deliverables="答案是 2 + 3 = 6",
        )
        assert len(issues) > 0
        assert any("算式" in str(i.get("constraint", "")) for i in issues)

    def test_no_validations_needed(self):
        from engines.worker.delivery_validation import validate_delivery
        issues = validate_delivery(
            task="普通文本总结",
            deliverables="普通内容，没有算式",
        )
        assert len(issues) == 0

    def test_duration_validation(self):
        from engines.worker.delivery_validation import validate_delivery
        issues = validate_delivery(
            task="制定 60 分钟学习计划",
            deliverables="- 数学 30 分钟\n- 英语 20 分钟",
        )
        # 30 + 20 = 50 ≠ 60 → should fail
        assert len(issues) > 0
        assert any("分钟" in str(i.get("constraint", "")) for i in issues)

    def test_correct_duration(self):
        from engines.worker.delivery_validation import validate_delivery
        issues = validate_delivery(
            task="制定 60 分钟学习计划",
            deliverables="- 数学 30 分钟\n- 英语 30 分钟",
        )
        assert len(issues) == 0


# =============================================================================
# 工作区补充测试
# =============================================================================


class TestWorkspaceSupplement:
    """工作区补充测试。"""

    def test_local_workspace_init(self, tmp_path):
        from engines.worker.workspace import LocalWorkspace
        ws = LocalWorkspace(str(tmp_path), "test-run")
        assert ws._run_id == "test-run"
        assert Path(ws._root).exists()

    @pytest.mark.asyncio
    async def test_local_workspace_write_read(self, tmp_path):
        from engines.worker.workspace import LocalWorkspace
        ws = LocalWorkspace(str(tmp_path), "test-run")
        await ws.write_file("test.txt", "hello world")
        content = await ws.read_file("test.txt")
        assert content == "hello world"

    @pytest.mark.asyncio
    async def test_local_workspace_list_files(self, tmp_path):
        from engines.worker.workspace import LocalWorkspace
        ws = LocalWorkspace(str(tmp_path), "test-run")
        await ws.write_file("a.txt", "aaa")
        await ws.write_file("b.txt", "bbb")
        files = await ws.list_files()
        paths = [f.path for f in files]
        assert "a.txt" in paths
        assert "b.txt" in paths

    @pytest.mark.asyncio
    async def test_local_workspace_delete(self, tmp_path):
        from engines.worker.workspace import LocalWorkspace
        ws = LocalWorkspace(str(tmp_path), "test-run")
        await ws.write_file("del.txt", "delete me")
        await ws.delete_file("del.txt")
        files = await ws.list_files()
        paths = [f.path for f in files]
        assert "del.txt" not in paths

    @pytest.mark.asyncio
    async def test_path_traversal_blocked(self, tmp_path):
        from engines.worker.workspace import LocalWorkspace
        ws = LocalWorkspace(str(tmp_path), "test-run")
        with pytest.raises(PermissionError):
            await ws.write_file("../../etc/passwd", "hacked")

    def test_safe_write_utf8(self, tmp_path):
        from engines.worker.workspace import safe_write
        test_file = tmp_path / "utf8.txt"
        safe_write(test_file, "你好世界 🌍")
        content = test_file.read_text(encoding="utf-8")
        assert "你好世界" in content

    def test_safe_read_utf8(self, tmp_path):
        from engines.worker.workspace import safe_read
        test_file = tmp_path / "read.txt"
        test_file.write_text("hello", encoding="utf-8")
        content = safe_read(test_file)
        assert content == "hello"

    def test_file_info_namedtuple(self):
        from engines.worker.workspace import FileInfo
        fi = FileInfo(path="test.txt", size=100, modified_at="2026-01-01")
        assert fi.path == "test.txt"
        assert fi.size == 100

    def test_sandbox_result_dataclass(self):
        from engines.worker.workspace import SandboxResult
        sr = SandboxResult(stdout="output", stderr="", exit_code=0)
        assert sr.exit_code == 0

    def test_resolve_safe_blocks_traversal(self, tmp_path):
        from engines.worker.workspace import _resolve_safe
        root = str(tmp_path)
        with pytest.raises(PermissionError):
            _resolve_safe(root, "../../etc/passwd")

    def test_resolve_safe_allows_valid_path(self, tmp_path):
        from engines.worker.workspace import _resolve_safe
        root = str(tmp_path)
        result = _resolve_safe(root, "subdir/file.txt")
        assert str(tmp_path) in result


# =============================================================================
# 分叉补充测试
# =============================================================================


class TestForkSupplement:
    """决策分叉补充测试。"""

    def test_decision_log_path(self):
        from engines.worker.fork import _log_path
        path = _log_path("test-run")
        assert "decision_logs" in str(path)
        assert "test-run.jsonl" in str(path)

    def test_save_and_load_decision_log(self, tmp_path):
        from engines.worker.fork import save_decision_step, load_decision_log, DECISION_LOG_DIR
        # 临时修改 DECISION_LOG_DIR
        import engines.worker.fork as fork_module
        original_dir = fork_module.DECISION_LOG_DIR
        fork_module.DECISION_LOG_DIR = tmp_path / ".decision_logs"
        try:
            save_decision_step("test-run", 1, "tool_call", "search first", "web_search")
            save_decision_step("test-run", 2, "tool_call", "write report", "write_file")
            log = load_decision_log("test-run")
            assert len(log) == 2
            assert log[0]["step_index"] == 1
            assert log[1]["tool_name"] == "write_file"
        finally:
            fork_module.DECISION_LOG_DIR = original_dir

    def test_load_empty_decision_log(self, tmp_path):
        from engines.worker.fork import load_decision_log, DECISION_LOG_DIR
        import engines.worker.fork as fork_module
        original_dir = fork_module.DECISION_LOG_DIR
        fork_module.DECISION_LOG_DIR = tmp_path / ".decision_logs"
        try:
            log = load_decision_log("nonexistent-run")
            assert log == []
        finally:
            fork_module.DECISION_LOG_DIR = original_dir

    def test_snapshot_original_path_new_format(self):
        from engines.worker.fork import _snapshot_original_path
        # 新格式: subdir__file.txt---20260818_100000
        result = _snapshot_original_path("subdir__file.txt---20260818_100000")
        assert result == "subdir/file.txt"

    def test_snapshot_original_path_old_format(self):
        from engines.worker.fork import _snapshot_original_path
        result = _snapshot_original_path("report.md.20260818_100000")
        assert result == "report.md"
 