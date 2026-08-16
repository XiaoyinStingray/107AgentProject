"""
Coordinator 单元测试 — Step T15。
覆盖: topological_order、get_ready_steps、schedule_steps。
（替代旧的 PlanManager 测试——State 8 中 PlanManager 已删除。）
"""

import pytest

from engines.team.coordinator import topological_order, get_ready_steps, schedule_steps

pytestmark = pytest.mark.asyncio


# ── 步骤工厂 ──────────────────────────────────────────────

def _step(sid, title, depends_on=None):
    return {"id": sid, "title": title, "depends_on": depends_on or []}


# =====================================================================
# topological_order
# =====================================================================


class TestTopologicalOrder:

    def test_empty(self):
        assert topological_order([]) == []

    def test_no_deps_serial(self):
        """无依赖 → 每批一个（串行）。"""
        steps = [_step("s1", "A"), _step("s2", "B"), _step("s3", "C")]
        batches = topological_order(steps)
        assert len(batches) == 3
        assert all(len(b) == 1 for b in batches)

    def test_linear_chain(self):
        """s1 → s2 → s3 → 三批。"""
        steps = [
            _step("s1", "A"),
            _step("s2", "B", depends_on=["s1"]),
            _step("s3", "C", depends_on=["s2"]),
        ]
        batches = topological_order(steps)
        assert len(batches) == 3
        assert batches[0][0]["id"] == "s1"
        assert batches[1][0]["id"] == "s2"
        assert batches[2][0]["id"] == "s3"

    def test_parallel_batch(self):
        """s1 → s3, s2 → s3 → s1 和 s2 同批。"""
        steps = [
            _step("s1", "A"),
            _step("s2", "B"),
            _step("s3", "C", depends_on=["s1", "s2"]),
        ]
        batches = topological_order(steps)
        assert len(batches) == 2
        first_ids = {s["id"] for s in batches[0]}
        assert first_ids == {"s1", "s2"}
        assert batches[1][0]["id"] == "s3"

    def test_diamond(self):
        """s1 → s2, s1 → s3, s2+s3 → s4 → 三批。"""
        steps = [
            _step("s1", "A"),
            _step("s2", "B", depends_on=["s1"]),
            _step("s3", "C", depends_on=["s1"]),
            _step("s4", "D", depends_on=["s2", "s3"]),
        ]
        batches = topological_order(steps)
        assert len(batches) == 3
        assert batches[0][0]["id"] == "s1"
        mid_ids = {s["id"] for s in batches[1]}
        assert mid_ids == {"s2", "s3"}
        assert batches[2][0]["id"] == "s4"

    def test_circular_dependency_fallback(self):
        """循环依赖 → 未覆盖步骤追加到末尾。"""
        steps = [
            _step("s1", "A", depends_on=["s2"]),
            _step("s2", "B", depends_on=["s1"]),
        ]
        batches = topological_order(steps)
        # 所有步骤都应该出现在结果中（即使有循环依赖）
        all_ids = {s["id"] for batch in batches for s in batch}
        assert all_ids == {"s1", "s2"}


# =====================================================================
# get_ready_steps
# =====================================================================


class TestGetReadySteps:

    def test_all_ready_no_deps(self):
        """无依赖 → 全部可执行。"""
        steps = [_step("s1", "A"), _step("s2", "B")]
        ready = get_ready_steps(steps, set(), set())
        assert len(ready) == 2

    def test_deps_satisfied(self):
        """依赖已完成 → 可执行。"""
        steps = [_step("s1", "A"), _step("s2", "B", depends_on=["s1"])]
        ready = get_ready_steps(steps, {"s1"}, set())
        assert len(ready) == 1
        assert ready[0]["id"] == "s2"

    def test_deps_not_satisfied(self):
        """依赖未完成 → 不可执行。"""
        steps = [_step("s1", "A"), _step("s2", "B", depends_on=["s1"])]
        ready = get_ready_steps(steps, set(), set())
        assert len(ready) == 1
        assert ready[0]["id"] == "s1"

    def test_skipped_counts_as_satisfied(self):
        """依赖已跳过 → 视为满足。"""
        steps = [_step("s1", "A"), _step("s2", "B", depends_on=["s1"])]
        ready = get_ready_steps(steps, set(), {"s1"})
        assert len(ready) == 1
        assert ready[0]["id"] == "s2"

    def test_completed_excluded(self):
        """已完成的步骤不返回。"""
        steps = [_step("s1", "A")]
        ready = get_ready_steps(steps, {"s1"}, set())
        assert len(ready) == 0


# =====================================================================
# schedule_steps
# =====================================================================


class TestScheduleSteps:

    async def test_serial_execution(self):
        """串行执行——按依赖顺序。"""
        steps = [
            _step("s1", "A"),
            _step("s2", "B", depends_on=["s1"]),
        ]
        execution_order = []

        async def execute_step(step):
            execution_order.append(step["id"])
            return {
                "step_id": step["id"], "step_title": step["title"],
                "success": True, "files": [], "output_summary": "",
                "steps_used": 1, "duration_secs": 0.1,
            }

        results = await schedule_steps(steps, execute_step, parallel=False)
        assert len(results) == 2
        assert execution_order == ["s1", "s2"]
        assert all(r["success"] for r in results)

    async def test_failed_step_still_allows_dependents(self):
        """步骤失败 → 仍记入 completed，下游步骤仍可执行（coordinator 不传播失败）。"""
        steps = [
            _step("s1", "A"),
            _step("s2", "B", depends_on=["s1"]),
        ]

        async def execute_step(step):
            if step["id"] == "s1":
                raise RuntimeError("step failed")
            return {
                "step_id": step["id"], "success": True,
                "files": [], "output_summary": "",
                "steps_used": 1, "duration_secs": 0.1,
            }

        results = await schedule_steps(steps, execute_step, parallel=False)
        assert len(results) == 2
        # s1 失败
        assert results[0]["success"] is False
        assert results[0]["error"] == "step failed"
        # s2 仍然执行（coordinator 不传播失败）
        assert results[1]["success"] is True

    async def test_independent_steps_all_run(self):
        """独立步骤全部执行。"""
        steps = [_step("s1", "A"), _step("s2", "B"), _step("s3", "C")]
        executed = []

        async def execute_step(step):
            executed.append(step["id"])
            return {
                "step_id": step["id"], "success": True,
                "files": [], "output_summary": "",
                "steps_used": 1, "duration_secs": 0.1,
            }

        results = await schedule_steps(steps, execute_step)
        assert len(results) == 3
        assert len(executed) == 3
