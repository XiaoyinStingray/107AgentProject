"""
Market API 路由测试 — Step T3 / Layer 1。
覆盖: 发布/列表/详情/下载/评分 + 重复发布拒绝 + 不存在 Team 拒绝。
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
from api.market import router as market_router


# =============================================================================
# Mock（与 test_teams_api.py 相同策略）
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
    import models.agent_orm    # noqa: F401
    import models.world_orm    # noqa: F401
    import models.event        # noqa: F401
    import models.memory       # noqa: F401
    import models.team_orm     # noqa: F401
    import models.plan_orm     # noqa: F401
    import models.market_orm   # noqa: F401

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


@pytest.fixture
def app(monkeypatch):
    import api.agents

    monkeypatch.setattr(api.agents, "get_agent_factory", _mock_factory)
    app = FastAPI(lifespan=_test_lifespan)
    app.include_router(agents_router)
    app.include_router(teams_router)
    app.include_router(market_router)
    app.dependency_overrides[get_agent_factory] = _mock_factory
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


# =============================================================================
# Helpers
# =============================================================================

def _create_agent(client: TestClient) -> str:
    resp = client.post("/api/agents", json={"description": "测试角色"})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _create_team(client: TestClient, agent_id: str) -> str:
    resp = client.post("/api/teams", json={
        "name": "测试团队", "agent_ids": [agent_id],
    })
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# =============================================================================
# Tests — 发布
# =============================================================================

class TestPublishTeam:

    def test_publish_success(self, client):
        """发布 Team 到市场。"""
        aid = _create_agent(client)
        tid = _create_team(client, aid)

        resp = client.post("/api/market", json={
            "team_id": tid, "name": "模板A", "description": "测试模板",
            "tags": ["产品", "设计"], "author": "测试员",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "模板A"
        assert data["team_id"] == tid
        assert data["author"] == "测试员"
        assert data["downloads"] == 0
        assert "id" in data

    def test_publish_duplicate_rejected(self, client):
        """同一 Team 重复发布拒绝（409）。"""
        aid = _create_agent(client)
        tid = _create_team(client, aid)

        client.post("/api/market", json={"team_id": tid, "name": "第一次"})
        resp = client.post("/api/market", json={"team_id": tid, "name": "第二次"})
        assert resp.status_code == 409

    def test_publish_nonexistent_team(self, client):
        """不存在的 Team 发布拒绝（404）。"""
        resp = client.post("/api/market", json={
            "team_id": "fake-team-id", "name": "坏模板",
        })
        assert resp.status_code == 404

    def test_publish_empty_team_id(self, client):
        """空 team_id 拒绝（400）。"""
        resp = client.post("/api/market", json={"team_id": "", "name": "空"})
        assert resp.status_code == 400


# =============================================================================
# Tests — 列表 & 详情
# =============================================================================

class TestListMarket:

    def test_list_empty(self, client):
        """空市场列表。"""
        resp = client.get("/api/market")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_after_publish(self, client):
        """发布后可列出。"""
        aid = _create_agent(client)
        tid = _create_team(client, aid)
        client.post("/api/market", json={"team_id": tid, "name": "模板X"})

        resp = client.get("/api/market")
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 1
        assert items[0]["name"] == "模板X"

    def test_get_detail(self, client):
        """获取市场条目详情（含 Team 配置）。"""
        aid = _create_agent(client)
        tid = _create_team(client, aid)
        pub = client.post("/api/market", json={"team_id": tid, "name": "详情模板"})
        item_id = pub.json()["id"]

        resp = client.get(f"/api/market/{item_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "详情模板"
        assert "team" in data
        assert data["team"]["id"] == tid

    def test_get_nonexistent(self, client):
        """不存在的条目返回 404。"""
        resp = client.get("/api/market/fake-id")
        assert resp.status_code == 404


# =============================================================================
# Tests — 下载
# =============================================================================

class TestDownload:

    def test_download_increments_count(self, client):
        """下载增加计数。"""
        aid = _create_agent(client)
        tid = _create_team(client, aid)
        pub = client.post("/api/market", json={"team_id": tid, "name": "下载模板"})
        item_id = pub.json()["id"]

        resp = client.post(f"/api/market/{item_id}/download")
        assert resp.status_code == 200
        data = resp.json()
        assert "name" in data
        assert "agent_ids" in data

        # 确认计数增加
        detail = client.get(f"/api/market/{item_id}").json()
        assert detail["downloads"] == 1

    def test_download_nonexistent(self, client):
        """下载不存在的条目返回 404。"""
        resp = client.post("/api/market/fake-id/download")
        assert resp.status_code == 404

    def test_missing_source_team_does_not_increment_downloads(self, client):
        """原 Team 已删除时，失败下载不能污染下载计数。"""
        aid = _create_agent(client)
        tid = _create_team(client, aid)
        published = client.post(
            "/api/market",
            json={"team_id": tid, "name": "失效模板"},
        )
        item_id = published.json()["id"]
        assert client.delete(f"/api/teams/{tid}").status_code == 204

        response = client.post(f"/api/market/{item_id}/download")

        assert response.status_code == 404
        assert response.json()["detail"] == "原始 Team 已被删除"
        detail = client.get(f"/api/market/{item_id}").json()
        assert detail["downloads"] == 0


# =============================================================================
# Tests — 评分
# =============================================================================

class TestRating:

    def test_rate_success(self, client):
        """评分成功。"""
        aid = _create_agent(client)
        tid = _create_team(client, aid)
        pub = client.post("/api/market", json={"team_id": tid, "name": "评分模板"})
        item_id = pub.json()["id"]

        resp = client.post(f"/api/market/{item_id}/rate", json={"score": 4})
        assert resp.status_code == 200
        data = resp.json()
        assert data["rating"] == 4.0
        assert data["rating_count"] == 1

    def test_rate_invalid_score(self, client):
        """无效评分拒绝。"""
        aid = _create_agent(client)
        tid = _create_team(client, aid)
        pub = client.post("/api/market", json={"team_id": tid, "name": "评分模板"})
        item_id = pub.json()["id"]

        resp = client.post(f"/api/market/{item_id}/rate", json={"score": 6})
        assert resp.status_code == 400

        resp = client.post(f"/api/market/{item_id}/rate", json={"score": 0})
        assert resp.status_code == 400

    def test_rate_nonexistent(self, client):
        """评分不存在的条目返回 404。"""
        resp = client.post("/api/market/fake-id/rate", json={"score": 3})
        assert resp.status_code == 404
