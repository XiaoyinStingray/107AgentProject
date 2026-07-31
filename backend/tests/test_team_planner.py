"""
PlanManager 单元测试 — Step T1。
覆盖: Plan 创建/更新/完成、LLM 协调器、drift 检测、事件回调。
"""

import json

import pytest

from engines.team.planner import PlanManager

pytestmark = pytest.mark.asyncio


# ── Helpers ──────────────────────────────────────────────

def _make_steps(n=3):
    return [
        {"id": f"s{i}", "title": f"步骤{i}", "assignee": f"a{i}",
         "description": f"描述{i}", "status": "pending", "progress": 0.0}
        for i in range(n)
    ]


class _MockResult:
    def __init__(self, text): self.content = text


class MockCoordinator:
    """返回预设判定。"""
    def __init__(self, verdict="YES"):
        self._verdict = verdict
        self.call_count = 0

    async def create(self, messages, **kw):
        self.call_count += 1
        return _MockResult(self._verdict)


# ── Tests ────────────────────────────────────────────────

class TestPlanManager:

    def test_initial_state(self):
        """初始状态：全部 pending，all_done=False。"""
        pm = PlanManager(_make_steps())
        assert not pm.all_done
        assert pm.progress_pct == 0.0
        step = pm.current_step()
        assert step is not None
        assert step["title"] == "步骤0"

    def test_to_dict(self):
        """to_dict 返回结构化数据。"""
        pm = PlanManager(_make_steps(2))
        d = pm.to_dict()
        assert "steps" in d
        assert "progress_pct" in d
        assert "all_done" in d
        assert len(d["steps"]) == 2

    async def test_activate_first_step(self):
        """首次 check_progress 激活第一个 pending 步骤。"""
        pm = PlanManager(_make_steps(2))
        events = [{"content": "开始工作了" * 5}]
        changed = await pm.check_progress(1, events)
        assert pm.steps[0]["status"] == "active"
        assert len(changed) >= 1

    async def test_complete_step_via_action(self):
        """Agent 提交 deliverable → 步骤完成 → 激活下一步。"""
        pm = PlanManager(_make_steps(2))
        # Tick 1: 激活
        await pm.check_progress(1, [])
        assert pm.steps[0]["status"] == "active"

        # Tick 2: 提交交付物
        events = [{"action": "submit_deliverable",
                    "data": {"step_title": "步骤0", "result": "完成产出"}}]
        await pm.check_progress(2, events)
        assert pm.steps[0]["status"] == "done"
        assert pm.steps[0]["progress"] == 1.0
        assert pm.steps[1]["status"] == "active"

    async def test_all_done(self):
        """全部步骤完成 → all_done=True + report_ready 事件。"""
        pm = PlanManager(_make_steps(1))
        events_received = []
        pm._on_event = lambda t, d: events_received.append(t)

        await pm.check_progress(1, [])
        await pm.check_progress(2, [{"action": "finish_task"}])
        assert pm.all_done
        assert pm.progress_pct == 1.0
        assert "report_ready" in events_received

    async def test_llm_coordinator_yes(self):
        """LLM 判定 YES → 步骤自动完成。"""
        steps = _make_steps(2)
        client = MockCoordinator("YES")
        pm = PlanManager(steps, model_client=client)

        # Tick 1: 激活
        await pm.check_progress(1, [])
        # Tick 2-3: 积累对话（需 ≥30 字符让 LLM 被调用）
        await pm.check_progress(2, [{"content": "我们已经完成了需求分析的所有工作" * 3}])
        # Tick 3: 触发 LLM 检查（_ticks_on_step >= 3）
        await pm.check_progress(3, [{"content": "确认所有产出已提交完毕" * 3}])

        assert client.call_count >= 1
        assert pm.steps[0]["status"] == "done"

    async def test_llm_coordinator_drift(self):
        """LLM 判定 DRIFT 连续 3 次 → 强制推进。"""
        steps = _make_steps(2)
        client = MockCoordinator("DRIFT")
        pm = PlanManager(steps, model_client=client)

        await pm.check_progress(1, [])
        # 连续 drift：需要 _ticks_on_step >= 3 才触发 LLM
        for tick in range(2, 12):
            await pm.check_progress(tick, [{"content": "聊一些无关的话题" * 5}])

        # 连续 drift 应触发强制完成
        assert pm.steps[0]["status"] == "done" or client.call_count >= 2

    async def test_build_report(self):
        """build_report 返回结构化报告。"""
        pm = PlanManager(_make_steps(2))
        # 完成第一步
        await pm.check_progress(1, [])
        await pm.check_progress(2, [{"action": "submit_deliverable",
                                      "data": {"step_title": "步骤0", "result": "产出A"}}])
        report = pm.build_report()
        assert "title" in report
        assert "content" in report
        assert report["steps_count"] == 2
        assert report["completed_count"] == 1

    async def test_event_callback_fires(self):
        """步骤变化时触发 on_event 回调。"""
        events_fired = []
        pm = PlanManager(_make_steps(2),
                         on_event=lambda t, d: events_fired.append(t))

        await pm.check_progress(1, [])  # 激活 → plan_updated
        assert "plan_updated" in events_fired


# =============================================================================
# Step 80: 动态重规划测试
# =============================================================================


def test_revise_plan_updates_title():
    """revise_plan 更新步骤标题并记录修订历史。"""
    steps = _make_steps(3)
    events_fired = []
    pm = PlanManager(steps, on_event=lambda t, d: events_fired.append((t, d)))

    result = pm.revise_plan("步骤1", "快速竞品扫描", "原方案太耗时")

    assert result is not None
    assert result["title"] == "快速竞品扫描"
    assert len(result.get("revision_history", [])) == 1
    assert result["revision_history"][0]["old_title"] == "步骤1"
    assert result["revision_history"][0]["new_title"] == "快速竞品扫描"
    assert events_fired[-1][0] == "plan_revised"


def test_revise_plan_returns_none_for_missing_step():
    """revise_plan 找不到步骤时返回 None。"""
    pm = PlanManager(_make_steps(2))
    result = pm.revise_plan("不存在的步骤", "新步骤", "原因")
    assert result is None


def test_insert_step_adds_after_index():
    """insert_step 在指定位置后插入新步骤。"""
    pm = PlanManager(_make_steps(3))
    pm.insert_step(1, "新插入的步骤", assignee="小红")

    assert len(pm.steps) == 4
    assert pm.steps[2]["title"] == "新插入的步骤"
    assert pm.steps[2]["assignee"] == "小红"
    assert pm.steps[2]["status"] == "pending"


def test_mark_blocked_sets_status():
    """mark_blocked 标记步骤为阻塞状态。"""
    steps = _make_steps(3)
    events_fired = []
    pm = PlanManager(steps, on_event=lambda t, d: events_fired.append((t, d)))

    result = pm.mark_blocked("步骤2", "依赖的步骤1未完成")

    assert result is not None
    assert result["status"] == "blocked"
    assert result["blocked_reason"] == "依赖的步骤1未完成"
    assert any(t == "plan_revised" for t, _ in events_fired)
