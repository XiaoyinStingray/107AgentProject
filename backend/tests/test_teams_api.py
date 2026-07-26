"""
Team API 路由 单元测试 — Step 51。
"""

import json
import tempfile

import pytest
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from api.agents import get_agent_factory, router as agents_router
from api.teams import router as teams_router


# =============================================================================
# Mock agent factory（与 test_agents_api.py 相同策略）
# =============================================================================

class _FakeCreateResult:
    def __init__(self, c): self.content = c


class MockModelClient:
    model_info = {"function_calling": True, "vision": False, "json_output": True}

    async def create(self, messages, **kw):
        from engines.persona.builder import MOCK_PERSONA_JSON
        return _FakeCreateResult(json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False))


def _mock_factory():
    from engines.agent_factory.factory import AgentFactory
    return AgentFactory(MockModelClient())


# =============================================================================
# DB fixtures
# =============================================================================

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
_TEST_DB_URL = f"sqlite+aiosqlite:///{_tmp_db.name}"
_SYNC_DB_URL = f"sqlite:///{_tmp_db.name}"


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


@asynccontextmanager
async def _test_lifespan(app):
    from db import init_db
    await init_db()
    yield


@pytest.fixture(autouse=True)
def _setup_db():
    from db import reset_db_state
    from config import settings

    reset_db_state()
    settings.database_url = _TEST_DB_URL
    _sync_create_tables()

    yield


# =============================================================================
# App fixture（dependency_overrides 覆盖 get_agent_factory）
# =============================================================================

@pytest.fixture
def app():
    app = FastAPI(lifespan=_test_lifespan)
    app.include_router(agents_router)
    app.include_router(teams_router)
    app.dependency_overrides[get_agent_factory] = _mock_factory
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


# =============================================================================
# Helper: 创建 Agent
# =============================================================================

def _create_agent(client: TestClient, description: str = "测试角色") -> str:
    """创建一个 Agent 并返回其 id。"""
    resp = client.post("/api/agents", json={"description": description})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# =============================================================================
# Tests
# =============================================================================


class TestCreateTeam:

    def test_create_minimal(self, client):
        """最少字段创建 Team：name + agent_ids。"""
        aid = _create_agent(client)
        resp = client.post("/api/teams", json={
            "name": "测试团队",
            "description": "用于测试的团队",
            "agent_ids": [aid],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "测试团队"
        assert data["agent_ids"] == [aid]
        assert data["status"] == "idle"
        assert "id" in data
        assert "created_at" in data

    def test_create_with_roles(self, client):
        """创建时带角色分配。"""
        aid = _create_agent(client)
        resp = client.post("/api/teams", json={
            "name": "角色团队",
            "description": "测试角色",
            "agent_ids": [aid],
            "roles": [{"agent_id": aid, "role": "产品经理", "reason": "测试"}],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert len(data["roles"]) == 1
        assert data["roles"][0]["role"] == "产品经理"

    def test_create_empty_name_rejected(self, client):
        """空名称拒绝。"""
        resp = client.post("/api/teams", json={
            "name": "",
            "agent_ids": ["fake-id"],
        })
        assert resp.status_code == 400

    def test_create_no_agents_rejected(self, client):
        """无 Agent 拒绝。"""
        resp = client.post("/api/teams", json={
            "name": "空团队",
            "agent_ids": [],
        })
        assert resp.status_code == 400

    def test_create_nonexistent_agent_rejected(self, client):
        """不存在的 Agent ID 拒绝。"""
        resp = client.post("/api/teams", json={
            "name": "坏团队",
            "agent_ids": ["nonexistent-12345"],
        })
        assert resp.status_code == 400

    def test_create_multiple_agents(self, client):
        """多 Agent Team。"""
        a1 = _create_agent(client, "角色A")
        a2 = _create_agent(client, "角色B")
        a3 = _create_agent(client, "角色C")
        resp = client.post("/api/teams", json={
            "name": "三人团队",
            "description": "产品、开发、测试",
            "agent_ids": [a1, a2, a3],
        })
        assert resp.status_code == 201
        data = resp.json()
        assert len(data["agent_ids"]) == 3


class TestListTeams:

    def test_list_empty(self, client):
        """空列表。"""
        resp = client.get("/api/teams")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_multiple(self, client):
        """多 Team 列表。"""
        aid = _create_agent(client)
        client.post("/api/teams", json={"name": "B团队", "agent_ids": [aid]})
        client.post("/api/teams", json={"name": "A团队", "agent_ids": [aid]})
        resp = client.get("/api/teams")
        assert resp.status_code == 200
        teams = resp.json()
        assert len(teams) == 2
        names = {t["name"] for t in teams}
        assert names == {"A团队", "B团队"}


class TestGetTeam:

    def test_get_existing(self, client):
        """获取存在的 Team 详情（含 Agent 摘要）。"""
        aid = _create_agent(client)
        create_resp = client.post("/api/teams", json={
            "name": "详情团队",
            "description": "测试详情",
            "agent_ids": [aid],
        })
        tid = create_resp.json()["id"]

        resp = client.get(f"/api/teams/{tid}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "详情团队"
        assert "agents" in data
        assert len(data["agents"]) == 1
        assert data["agents"][0]["id"] == aid

    def test_get_nonexistent(self, client):
        """不存在的 Team 返回 404。"""
        resp = client.get("/api/teams/nonexistent-12345")
        assert resp.status_code == 404


class TestDeleteTeam:

    def test_delete_existing(self, client):
        """删除 Team。"""
        aid = _create_agent(client)
        create_resp = client.post("/api/teams", json={
            "name": "待删除",
            "agent_ids": [aid],
        })
        tid = create_resp.json()["id"]

        resp = client.delete(f"/api/teams/{tid}")
        assert resp.status_code == 204

        # 确认已删除
        get_resp = client.get(f"/api/teams/{tid}")
        assert get_resp.status_code == 404

    def test_delete_nonexistent(self, client):
        """删除不存在的 Team 返回 404。"""
        resp = client.delete("/api/teams/nonexistent-12345")
        assert resp.status_code == 404

    def test_delete_does_not_delete_agents(self, client):
        """删除 Team 不删除 Agent。"""
        aid = _create_agent(client)
        create_resp = client.post("/api/teams", json={
            "name": "临时团队",
            "agent_ids": [aid],
        })
        tid = create_resp.json()["id"]

        client.delete(f"/api/teams/{tid}")

        # Agent 仍在
        agent_resp = client.get(f"/api/agents/{aid}")
        assert agent_resp.status_code == 200


class TestSuggestRoles:

    def test_suggest_roles_with_mock_llm(self, client):
        """角色推荐——LLM 不可用时用 MBTI 规则兜底。"""
        aid = _create_agent(client)
        resp = client.post("/api/teams/suggest-roles", json={
            "agent_ids": [aid],
        })
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) >= 1
        assert "role" in data[0]
        assert "reason" in data[0]
        assert isinstance(data[0]["agent_id"], str)

    def test_suggest_roles_empty_ids_rejected(self, client):
        """空 agent_ids 拒绝。"""
        resp = client.post("/api/teams/suggest-roles", json={
            "agent_ids": [],
        })
        assert resp.status_code == 400

    def test_suggest_roles_nonexistent_agent_rejected(self, client):
        """不存在的 Agent 拒绝。"""
        resp = client.post("/api/teams/suggest-roles", json={
            "agent_ids": ["fake-12345"],
        })
        assert resp.status_code == 400


class TestExecuteTeam:

    def test_execute_creates_plan(self, client):
        """执行 Team 应创建 Plan 并返回 steps。"""
        aid = _create_agent(client)
        create_resp = client.post("/api/teams", json={
            "name": "执行测试团队",
            "description": "测试任务分解",
            "agent_ids": [aid],
        })
        tid = create_resp.json()["id"]

        resp = client.post(f"/api/teams/{tid}/execute")
        assert resp.status_code == 200
        data = resp.json()
        assert "id" in data
        assert "steps" in data
        assert len(data["steps"]) >= 1
        assert "world_id" in data

    def test_execute_nonexistent_team(self, client):
        """不存在的 Team 返回 404。"""
        resp = client.post("/api/teams/nonexistent-99/execute")
        assert resp.status_code == 404

    def test_get_plan_after_execute(self, client):
        """执行后可查询 Plan。"""
        aid = _create_agent(client)
        create_resp = client.post("/api/teams", json={
            "name": "计划查询团队",
            "description": "测试",
            "agent_ids": [aid],
        })
        tid = create_resp.json()["id"]
        client.post(f"/api/teams/{tid}/execute")

        resp = client.get(f"/api/teams/{tid}/plan")
        assert resp.status_code == 200
        data = resp.json()
        assert data["team_id"] == tid
        assert len(data["steps"]) >= 1

    def test_get_plan_nonexistent(self, client):
        """还没执行过的 Team 查 Plan 返回 404。"""
        resp = client.get("/api/teams/nonexistent-99/plan")
        assert resp.status_code == 404

    def test_execute_idempotent(self, client):
        """重复执行返回已有 Plan（不重复创建）。"""
        aid = _create_agent(client)
        create_resp = client.post("/api/teams", json={
            "name": "幂等团队",
            "description": "测试",
            "agent_ids": [aid],
        })
        tid = create_resp.json()["id"]

        first = client.post(f"/api/teams/{tid}/execute")
        assert first.status_code == 200
        plan_id_1 = first.json()["id"]

        second = client.post(f"/api/teams/{tid}/execute")
        assert second.status_code == 200
        plan_id_2 = second.json()["id"]

        assert plan_id_1 == plan_id_2  # 同一个 Plan
