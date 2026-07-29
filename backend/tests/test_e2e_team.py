"""
Phase 14 E2E 全链路测试 — Step T1。
使用真实 LLM API 验证 Team 创建 → 执行 → Plan → 报告 的完整链路。

运行方式:
    cd backend && PYTHONPATH=src python -m pytest tests/test_e2e_team.py -v -s
"""

import json
import tempfile
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from db import Base, reset_db_state
from config import settings
from api.agents import router as agents_router, get_agent_factory
from api.teams import router as teams_router


# ── DB Setup ─────────────────────────────────────────────

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
_TEST_DB_URL = f"sqlite+aiosqlite:///{_tmp.name}"
_SYNC_DB_URL = f"sqlite:///{_tmp.name}"


def _sync_create_tables():
    from db import Base
    import models.agent_orm   # noqa: F401
    import models.world_orm   # noqa: F401
    import models.event       # noqa: F401
    import models.memory      # noqa: F401
    import models.team_orm    # noqa: F401
    import models.plan_orm    # noqa: F401

    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


@pytest.fixture(scope="module")
def client():
    """模块级 fixture：启动一次 FastAPI app，所有测试共享。"""
    reset_db_state()
    settings.database_url = _TEST_DB_URL
    _sync_create_tables()

    app = FastAPI()
    app.include_router(agents_router)
    app.include_router(teams_router)

    with TestClient(app) as c:
        yield c


# ── Helpers ──────────────────────────────────────────────

def _create_agent(client, desc):
    resp = client.post("/api/agents", json={"description": desc})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# =====================================================================
# E2E: Team 全链路（真实 LLM）
# =====================================================================


@pytest.mark.skipif(
    not settings.llm_api_key,
    reason="需要真实 LLM API Key，跳过 E2E 测试"
)
class TestTeamFullChain:

    def test_full_chain(self, client):
        """真实 LLM 链路：创建 Agent → 组队 → 执行 → 验证 Plan。"""

        # 1. 创建 3 个 Agent（不同人格）
        a1 = _create_agent(client, "你是一个产品经理，MBTI 是 ENFP，善于沟通和创意发散")
        a2 = _create_agent(client, "你是一个后端工程师，MBTI 是 ISTJ，严谨务实注重细节")
        a3 = _create_agent(client, "你是一个技术架构师，MBTI 是 INTJ，擅长系统设计和长远规划")

        # 2. 创建 Team
        resp = client.post("/api/teams", json={
            "name": "校园社交App产品团队",
            "description": "设计一款面向大学生的校园社交App，包含课程表共享、二手交易、组队学习功能",
            "agent_ids": [a1, a2, a3],
        })
        assert resp.status_code == 201
        team = resp.json()
        team_id = team["id"]
        assert team["status"] == "idle"

        # 3. 角色推荐（使用真实 LLM）
        resp = client.post("/api/teams/suggest-roles", json={
            "agent_ids": [a1, a2, a3],
        })
        assert resp.status_code == 200
        roles = resp.json()
        assert len(roles) == 3
        for r in roles:
            assert "role" in r
            assert "reason" in r

        # 4. 执行 Team → 触发任务分解（真实 LLM）
        resp = client.post(f"/api/teams/{team_id}/execute")
        assert resp.status_code == 200
        plan = resp.json()
        assert "id" in plan
        assert "steps" in plan
        assert "world_id" in plan

        # 5. 验证任务分解结果
        steps = plan["steps"]
        assert len(steps) >= 3, f"任务分解应产生 ≥3 个子任务，实际: {len(steps)}"
        for s in steps:
            assert "title" in s
            assert "status" in s
            assert s["status"] == "pending"

        # 6. 查询 Plan
        resp = client.get(f"/api/teams/{team_id}/plan")
        assert resp.status_code == 200
        stored_plan = resp.json()
        assert stored_plan["team_id"] == team_id
        assert len(stored_plan["steps"]) >= 3

        # 7. 验证 Team 状态变为 executing
        resp = client.get(f"/api/teams/{team_id}")
        assert resp.status_code == 200
        team_data = resp.json()
        assert team_data["status"] == "executing"

        # 8. 获取 Team 列表
        resp = client.get("/api/teams")
        assert resp.status_code == 200
        teams_list = resp.json()
        assert len(teams_list) >= 1
        assert any(t["id"] == team_id for t in teams_list)


# =====================================================================
# E2E: Team 完成闭环（Mock LLM / Mock World）
# =====================================================================


class _CompletingPlan:
    """Deterministic PlanManager stand-in that completes on the first tick."""

    def __init__(self):
        self.all_done = False
        self._ticks_on_step = 0
        self.steps = [{"title": "输出方案", "status": "active", "progress": 0.1}]

    async def check_progress(self, _tick, _events):
        self.steps[0].update(status="done", progress=1.0)
        self.all_done = True

    def to_dict(self):
        return {"steps": self.steps, "progress_pct": 1.0, "all_done": True}

    def current_step(self):
        return None

    def build_report(self):
        return {
            "title": "团队任务完成报告",
            "content": "已完成全部步骤",
            "steps_count": 1,
            "completed_count": 1,
        }


class _RecordingTeamEngine:
    def __init__(self):
        self.sync_count = 0
        self.saved_reports = []

    async def _sync_plan_to_db(self):
        self.sync_count += 1

    async def _save_report(self, report):
        self.saved_reports.append(report)


class _OneTickWorld:
    def __init__(self, plan, team_engine):
        self.agents = {}
        self.world = SimpleNamespace(status="running")
        self.current_tick = 0
        self.team_plan = plan
        self.team_engine = team_engine

    async def tick_stream(self):
        from models.event import SimEvent

        self.current_tick = 1
        yield SimEvent(
            id="event-1",
            world_id="world-team",
            tick=1,
            type="agent_action",
            source_agent_id="agent-1",
            description="提交最终方案",
            data={"action": "submit_deliverable"},
            created_at="2026-07-29T00:00:00+00:00",
        )


@pytest.mark.asyncio
async def test_mock_runtime_emits_and_persists_completion(monkeypatch):
    """Mock runtime must emit progress/report events and persist the report."""
    import api.sse as sse_api

    plan = _CompletingPlan()
    team_engine = _RecordingTeamEngine()
    world_engine = _OneTickWorld(plan, team_engine)

    async def _skip_simulation_finish(_engine):
        return None

    monkeypatch.setattr(
        sse_api,
        "_finish_engine_simulation",
        _skip_simulation_finish,
    )
    sse_api._active_connection_ids["world-team"] = "conn-team"

    payloads = []
    async for chunk in sse_api._world_event_generator(
        "world-team",
        world_engine,
        "conn-team",
    ):
        payloads.append(json.loads(chunk.removeprefix("data: ").strip()))

    event_types = [payload["type"] for payload in payloads]
    assert event_types == [
        "connected",
        "agent_action",
        "plan_updated",
        "session_end",
        "report_ready",
    ]
    assert payloads[2]["data"]["progress_pct"] == 1.0
    assert payloads[-1]["data"]["completed_count"] == 1
    assert world_engine.world.status == "finished"
    assert team_engine.sync_count == 1
    assert team_engine.saved_reports == [payloads[-1]["data"]]
