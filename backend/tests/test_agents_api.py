"""
Agent API 路由 单元测试 — 用 Mock LLM + TestClient。
"""

import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.agents import get_agent_factory, get_agent_store, router


# =============================================================================
# Mock 版本覆盖 FastAPI 依赖（不用真 LLM）
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
# Test app
# =============================================================================

@pytest.fixture(autouse=True)
def _reset_store():
    """每个测试前清空 Agent 存储。"""
    from api.agents import AgentStore, get_agent_store
    import api.agents as mod
    mod._agent_store = AgentStore()


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_agent_factory] = _mock_factory
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


# =============================================================================
# POST /api/agents
# =============================================================================

class TestCreateAgent:
    def test_create_returns_201(self, client):
        resp = client.post("/api/agents/", json={"description": "内向的程序员"})
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["persona"]["mbti"] == "INTJ-T"

    def test_create_empty_description_returns_422(self, client):
        resp = client.post("/api/agents/", json={"description": ""})
        assert resp.status_code == 422  # Pydantic min_length=3

    def test_create_too_short_description(self, client):
        resp = client.post("/api/agents/", json={"description": "ab"})
        assert resp.status_code == 422


# =============================================================================
# GET /api/agents
# =============================================================================

class TestListAgents:
    def test_list_empty(self, client):
        resp = client.get("/api/agents/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_after_create(self, client):
        client.post("/api/agents/", json={"description": "内向的程序员"})
        resp = client.get("/api/agents/")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


# =============================================================================
# GET /api/agents/{id}
# =============================================================================

class TestGetAgent:
    def test_get_existing(self, client):
        create_resp = client.post("/api/agents/", json={"description": "测试角色"})
        agent_id = create_resp.json()["id"]

        resp = client.get(f"/api/agents/{agent_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == agent_id

    def test_get_missing_returns_404(self, client):
        resp = client.get("/api/agents/nonexistent")
        assert resp.status_code == 404


# =============================================================================
# DELETE /api/agents/{id}
# =============================================================================

class TestDeleteAgent:
    def test_delete_existing(self, client):
        create_resp = client.post("/api/agents/", json={"description": "要删除的角色"})
        agent_id = create_resp.json()["id"]

        resp = client.delete(f"/api/agents/{agent_id}")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

        # 确认已删除
        get_resp = client.get(f"/api/agents/{agent_id}")
        assert get_resp.status_code == 404

    def test_delete_missing_returns_404(self, client):
        resp = client.delete("/api/agents/nonexistent")
        assert resp.status_code == 404
