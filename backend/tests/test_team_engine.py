"""TeamEngine orchestration regression tests."""

import pytest


class _RecordingPlan:
    def __init__(self):
        self.steps = []
        self.all_done = False
        self.calls: list[tuple[int, list[dict]]] = []

    async def check_progress(self, tick: int, events: list[dict]):
        self.calls.append((tick, events))


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
