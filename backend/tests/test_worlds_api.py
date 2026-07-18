"""
World API 路由 单元测试。
"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.agents import get_agent_store, AgentStore
from api.worlds import get_world_store, WorldStore, router


# =============================================================================
# Mock agent factory (same as test_agents_api)
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
# Fixtures
# =============================================================================

@pytest.fixture(autouse=True)
def _reset_stores():
    import api.agents as agents_mod
    import api.worlds as worlds_mod
    agents_mod._agent_store = AgentStore()
    worlds_mod._world_store = WorldStore()


@pytest.fixture
def app():
    from api.agents import get_agent_factory

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_agent_factory] = _mock_factory
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


def _create_agent(client, description="测试角色"):
    resp = client.post("/api/agents/", json={"description": description})
    return resp.json()["id"]


# =============================================================================
# POST /api/worlds
# =============================================================================

class TestCreateWorld:
    def test_create_returns_201(self, client):
        resp = client.post("/api/worlds/", json={
            "name": "测试世界",
            "scenario": {"name": "期末周"},
            "agent_ids": [],
        })
        assert resp.status_code == 201
        assert resp.json()["name"] == "测试世界"

    def test_create_defaults_scenario_when_empty(self, client):
        resp = client.post("/api/worlds/", json={
            "name": "默认场景世界",
            "scenario": {},
            "agent_ids": [],
        })
        assert resp.status_code == 201
        assert resp.json()["scenario"]["name"] == "新生报到"


# =============================================================================
# GET /api/worlds
# =============================================================================

class TestListWorlds:
    def test_list_empty(self, client):
        resp = client.get("/api/worlds/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_after_create(self, client):
        client.post("/api/worlds/", json={
            "name": "W1", "scenario": {}, "agent_ids": [],
        })
        resp = client.get("/api/worlds/")
        assert len(resp.json()) == 1


# =============================================================================
# GET /api/worlds/{id}
# =============================================================================

class TestGetWorld:
    def test_get_existing(self, client):
        resp = client.post("/api/worlds/", json={
            "name": "W", "scenario": {}, "agent_ids": [],
        })
        wid = resp.json()["id"]
        resp = client.get(f"/api/worlds/{wid}")
        assert resp.status_code == 200

    def test_get_missing_returns_404(self, client):
        resp = client.get("/api/worlds/nonexistent")
        assert resp.status_code == 404


# =============================================================================
# POST /api/worlds/{id}/start
# =============================================================================

class TestStartWorld:
    def test_start_without_agents_returns_400(self, client):
        resp = client.post("/api/worlds/", json={
            "name": "W", "scenario": {}, "agent_ids": [],
        })
        wid = resp.json()["id"]
        resp = client.post(f"/api/worlds/{wid}/start")
        assert resp.status_code == 400
        assert "agent" in resp.json()["detail"].lower()

    def test_start_missing_returns_404(self, client):
        resp = client.post("/api/worlds/nonexistent/start")
        assert resp.status_code == 404


# =============================================================================
# POST /api/worlds/{id}/pause
# =============================================================================

class TestPauseWorld:
    def test_pause_idle_world(self, client):
        resp = client.post("/api/worlds/", json={
            "name": "W", "scenario": {}, "agent_ids": [],
        })
        wid = resp.json()["id"]
        resp = client.post(f"/api/worlds/{wid}/pause")
        assert resp.status_code == 200
        assert resp.json()["status"] == "paused"


# =============================================================================
# POST /api/worlds/{id}/inject
# =============================================================================

class TestInjectEvent:
    def test_inject_not_running_returns_400(self, client):
        resp = client.post("/api/worlds/", json={
            "name": "W", "scenario": {}, "agent_ids": [],
        })
        wid = resp.json()["id"]
        resp = client.post(f"/api/worlds/{wid}/inject", json={
            "description": "天降暴雨",
        })
        assert resp.status_code == 400
