"""
E2E Team 全链路测试 — State 8 / T15。

Part 1: 真实 LLM（需 API Key，默认 skip）。
Part 2: Mock LLM — 验证 engine SSE 事件流端到端。

运行方式:
    cd backend && PYTHONPATH=src python -m pytest tests/test_e2e_team.py -v -s
"""

import json
import tempfile

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
            "description": "设计一款面向大学生的校园社交App",
            "agent_ids": [a1, a2, a3],
        })
        assert resp.status_code == 201
        team = resp.json()
        team_id = team["id"]
        assert team["status"] == "idle"

        # 3. 执行 Team
        resp = client.post(f"/api/teams/{team_id}/execute")
        assert resp.status_code == 200
        data = resp.json()
        assert "plan_id" in data
        assert data["status"] == "executing"

        # 4. 查询 Plan
        resp = client.get(f"/api/teams/{team_id}/plan")
        assert resp.status_code == 200
        stored_plan = resp.json()
        assert stored_plan["team_id"] == team_id
        assert len(stored_plan["steps"]) >= 1

        # 5. Team 列表
        resp = client.get("/api/teams")
        assert resp.status_code == 200
        teams_list = resp.json()
        assert any(t["id"] == team_id for t in teams_list)


# =====================================================================
# E2E: Engine SSE 事件流（Mock LLM — 不需要真实 API）
# =====================================================================


class _MockResult:
    def __init__(self, content: str):
        self.content = content


class _MockModelClient:
    """Mock LLM——返回有效 JSON 或失败。"""

    def __init__(self, decompose_response=None, fail=False):
        self._decompose = decompose_response or [
            {"title": "调研", "assignee": None, "description": "用户调研"},
        ]
        self._fail = fail
        self.call_count = 0

    async def create(self, messages, **kw):
        self.call_count += 1
        if self._fail:
            raise RuntimeError("LLM unavailable")
        # decomposer 调用
        return _MockResult(json.dumps(self._decompose, ensure_ascii=False))


@pytest.mark.asyncio
async def test_engine_sse_flow_with_mock_db():
    """TeamEngine.execute() 端到端 SSE 流验证（使用 Mock LLM + 真实 SQLite DB）。"""
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from db import Base as TestBase
    from models.team_orm import TeamRow
    from models.plan_orm import PlanRow
    from models.agent_orm import AgentRow
    from engines.team.engine import TeamEngine

    # 创建临时 DB
    import tempfile as _tf
    tmp = _tf.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    db_url = f"sqlite+aiosqlite:///{tmp.name}"
    sync_url = f"sqlite:///{tmp.name}"

    # 同步建表
    sync_engine = create_engine(sync_url)
    TestBase.metadata.drop_all(sync_engine)
    TestBase.metadata.create_all(sync_engine)
    sync_engine.dispose()

    # 异步 session
    async_engine = create_async_engine(db_url)
    async_session = async_sessionmaker(async_engine, expire_on_commit=False)

    async with async_session() as db:
        # 创建 Agent
        agent_row = AgentRow(
            id="agent-e2e-1",
            name="测试Agent",
            persona_json=json.dumps({"name": "小红", "mbti": "ENFP"}),
            background_json=json.dumps({"decision_style": "analytical"}),
            goals_json=json.dumps([]),
        )
        db.add(agent_row)

        # 创建 Team
        team_row = TeamRow.from_create(
            team_id="team-e2e-1", name="E2E团队",
            description="测试任务", agent_ids=["agent-e2e-1"], roles=[],
        )
        db.add(team_row)
        await db.commit()

        team_dict = team_row.to_dict()
        engine = TeamEngine(team_dict, db)

        # 使用 FailingClient 触发规则兜底（不依赖 LLM 返回格式）
        class _FailClient:
            async def create(self, messages, **kw):
                raise RuntimeError("No LLM")

        events = []
        async for sse_str in engine.execute(_FailClient()):
            if sse_str.startswith("data: "):
                try:
                    obj = json.loads(sse_str[6:].strip())
                    events.append(obj)
                except Exception:
                    pass

        # 验证事件序列
        event_types = [e["type"] for e in events]

        # 必须包含 plan_created
        assert "plan_created" in event_types, f"Missing plan_created in {event_types}"

        # 必须包含 team_done 或 team.error
        has_terminal = "team_done" in event_types or "team.error" in event_types
        assert has_terminal, f"Missing terminal event in {event_types}"

        # 如果有 step 事件，验证其结构
        step_events = [e for e in events if e.get("type", "").startswith("step.")]
        for se in step_events:
            assert "step_id" in se, f"Step event missing step_id: {se}"

        # 验证 PlanRow 已持久化
        from sqlalchemy import select
        result = await db.execute(
            select(PlanRow).where(PlanRow.team_id == "team-e2e-1")
        )
        plan_row = result.scalar_one_or_none()
        assert plan_row is not None
        assert plan_row.status == "finished"

        # 验证 TeamRow 状态
        result = await db.execute(
            select(TeamRow).where(TeamRow.id == "team-e2e-1")
        )
        team = result.scalar_one_or_none()
        assert team is not None, "TeamRow not found"
        assert team.status == "finished"

    await async_engine.dispose()
