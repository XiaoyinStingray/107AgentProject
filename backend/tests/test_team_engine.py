"""TeamEngine orchestration regression tests."""

import json
from types import SimpleNamespace

import pytest


class _RecordingPlan:
    def __init__(self, *, all_done: bool = False):
        self.steps = [
            {
                "title": "整理结论",
                "status": "done" if all_done else "active",
                "progress": 1.0 if all_done else 0.5,
            }
        ]
        self.all_done = all_done
        self.progress_pct = 1.0 if all_done else 0.5
        self.calls: list[tuple[int, list[dict]]] = []

    async def check_progress(self, tick: int, events: list[dict]):
        self.calls.append((tick, events))


class _FakeResult:
    def __init__(self, row):
        self.row = row

    def scalar_one_or_none(self):
        return self.row


class _RecordingDB:
    def __init__(self, team_row=None):
        self.team_row = team_row
        self.added = []
        self.commits = 0

    async def execute(self, _statement):
        return _FakeResult(self.team_row)

    def add(self, row):
        self.added.append(row)

    async def commit(self):
        self.commits += 1


@pytest.mark.asyncio
async def test_on_tick_awaits_plan_progress_check():
    """TeamEngine must finish the async plan check before returning."""
    from engines.team.engine import TeamEngine

    engine = TeamEngine(team={"id": "team-1"}, db=None)
    plan = _RecordingPlan()
    engine.plan = plan
    engine.plan_row = None
    events = [{"type": "agent_message", "content": "提交当前阶段产出"}]

    result = await engine.on_tick(3, events)

    assert plan.calls == [(3, events)]
    assert result == []


@pytest.mark.asyncio
async def test_on_tick_persists_finished_plan_state():
    """A completed plan must be serialized and marked finished in the DB row."""
    from engines.team.engine import TeamEngine

    db = _RecordingDB()
    engine = TeamEngine(team={"id": "team-1"}, db=db)
    engine.plan = _RecordingPlan(all_done=True)
    engine.plan_row = SimpleNamespace(steps="[]", status="executing")

    await engine.on_tick(8, [{"type": "agent_action", "action": "finish_task"}])

    assert engine.plan_row.status == "finished"
    assert json.loads(engine.plan_row.steps)[0]["status"] == "done"
    assert db.added == [engine.plan_row]
    assert db.commits == 1


@pytest.mark.asyncio
async def test_save_report_finishes_plan_and_team():
    """Persisting the final report must finish both PlanRow and TeamRow."""
    from engines.team.engine import TeamEngine

    team_row = SimpleNamespace(status="executing")
    plan_row = SimpleNamespace(report=None, status="executing")
    db = _RecordingDB(team_row=team_row)
    engine = TeamEngine(team={"id": "team-1"}, db=db)
    engine.plan_row = plan_row
    report = {"title": "团队任务完成报告", "content": "全部步骤已完成"}

    await engine._save_report(report)

    assert json.loads(plan_row.report) == report
    assert plan_row.status == "finished"
    assert team_row.status == "finished"
    assert db.added == [plan_row]
    assert db.commits == 1


@pytest.mark.asyncio
async def test_finish_returns_progress_and_persists_statuses():
    """Explicit finish must persist final steps and return the final progress."""
    from engines.team.engine import TeamEngine

    team_row = SimpleNamespace(status="executing")
    plan_row = SimpleNamespace(steps="[]", status="executing")
    db = _RecordingDB(team_row=team_row)
    engine = TeamEngine(team={"id": "team-1"}, db=db)
    engine.plan = _RecordingPlan(all_done=True)
    engine.plan_row = plan_row

    result = await engine.finish()

    assert result["status"] == "finished"
    assert result["progress_pct"] == 1.0
    assert result["steps"][0]["status"] == "done"
    assert plan_row.status == "finished"
    assert json.loads(plan_row.steps)[0]["status"] == "done"
    assert team_row.status == "finished"
    assert db.commits == 1
