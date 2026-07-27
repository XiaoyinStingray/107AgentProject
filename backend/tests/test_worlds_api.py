"""
World API 路由 单元测试 — SQLite 持久化版。
"""

import json
import tempfile
from types import SimpleNamespace

import pytest
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from api.agents import get_agent_factory, router as agents_router
from api.simulations import router as simulations_router
from api.worlds import router


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
# DB fixtures — 用同步 SQLite 管理测试数据库
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
    import models.intervention_orm  # noqa: F401

    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


def _sync_drop_tables():
    from db import Base
    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
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
    import api.sse as sse_mod

    reset_db_state()
    settings.database_url = _TEST_DB_URL
    _sync_create_tables()
    sse_mod._active_worlds.clear()

    yield

    _sync_drop_tables()
    sse_mod._active_worlds.clear()


@pytest.fixture
def app():
    app = FastAPI(lifespan=_test_lifespan)
    app.include_router(agents_router)
    app.include_router(router)
    app.include_router(simulations_router)
    app.dependency_overrides[get_agent_factory] = _mock_factory
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


def _create_agent(client, description="测试角色"):
    resp = client.post("/api/agents", json={"description": description})
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

    def test_named_builtin_scenario_includes_resource_params(self, client):
        resp = client.post("/api/worlds", json={
            "name": "期末周世界",
            "scenario": {"name": "期末周"},
            "agent_ids": [],
        })
        scenario = resp.json()["scenario"]
        assert scenario["environment_params"]["stress_level"] == "high"
        assert "图书馆座位减少80%" in scenario["initial_events"]

    def test_custom_scenario_is_not_replaced(self, client):
        resp = client.post("/api/worlds", json={
            "name": "自定义世界",
            "scenario": {
                "name": "社团招新",
                "environment_params": {"location": "广场"},
            },
            "agent_ids": [],
        })
        assert resp.json()["scenario"]["name"] == "社团招新"
        assert resp.json()["scenario"]["environment_params"] == {"location": "广场"}


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

    def test_start_and_reset_record_simulation(self, client):
        agent_id = _create_agent(client)
        world = client.post("/api/worlds", json={
            "name": "W",
            "scenario": {"name": "期末周"},
            "agent_ids": [agent_id],
        }).json()

        assert client.post(f"/api/worlds/{world['id']}/start").status_code == 200
        running = client.get(
            f"/api/simulations?world_id={world['id']}"
        ).json()
        assert len(running) == 1
        assert running[0]["status"] == "running"

        assert client.post(f"/api/worlds/{world['id']}/reset").status_code == 200
        finished = client.get(
            f"/api/simulations?world_id={world['id']}"
        ).json()
        assert finished[0]["status"] == "finished"


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


class TestRelationships:
    def test_active_world_returns_typed_snapshot(self, client):
        import api.sse as sse_mod

        sse_mod._active_worlds["world-rel"] = SimpleNamespace(
            agents={
                "a1": SimpleNamespace(id="a1", persona=SimpleNamespace(name="小明")),
                "a2": SimpleNamespace(id="a2", persona=SimpleNamespace(name="小红")),
            },
            relationships={("a1", "a2"): 0.125},
        )

        response = client.get("/api/worlds/world-rel/relationships")

        assert response.status_code == 200
        assert response.json()["edges"] == [
            {"source": "a1", "target": "a2", "score": 0.12}
        ]


# =============================================================================
# DELETE /api/worlds/{id}
# =============================================================================


class TestDeleteWorld:
    def test_delete_existing(self, client):
        resp = client.post("/api/worlds/", json={
            "name": "W", "scenario": {}, "agent_ids": [],
        })
        wid = resp.json()["id"]
        resp = client.delete(f"/api/worlds/{wid}")
        assert resp.status_code == 204

        resp = client.get(f"/api/worlds/{wid}")
        assert resp.status_code == 404

    def test_delete_missing_returns_404(self, client):
        resp = client.delete("/api/worlds/nonexistent")
        assert resp.status_code == 404


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

    @pytest.mark.parametrize(
        "payload",
        [
            {"description": ""},
            {"description": "测试", "type": "unsupported"},
            {"description": "测试", "target_agent_id": ["not-a-string"]},
        ],
    )
    def test_inject_rejects_invalid_payload(self, client, payload):
        import api.sse as sse_mod

        world = client.post("/api/worlds", json={
            "name": "干预边界测试",
            "scenario": {"name": "期末周"},
            "agent_ids": [],
        }).json()
        world_id = world["id"]
        sse_mod._active_worlds[world_id] = SimpleNamespace(
            world=SimpleNamespace(status="running"),
            inject_event=lambda *args, **kwargs: None,
        )

        response = client.post(f"/api/worlds/{world_id}/inject", json=payload)

        assert response.status_code == 400

    def test_inject_persists_runtime_event_and_history(self, client):
        """注入类型、目标和描述应同时进入运行时队列与 SQLite。"""
        import api.sse as sse_mod

        agent_id = _create_agent(client)
        world = client.post("/api/worlds", json={
            "name": "干预链路测试",
            "scenario": {"name": "期末周"},
            "agent_ids": [agent_id],
        }).json()
        world_id = world["id"]
        assert client.post(f"/api/worlds/{world_id}/start").status_code == 200

        response = client.post(f"/api/worlds/{world_id}/inject", json={
            "type": "agent_action",
            "target_agent_id": agent_id,
            "description": "请立即离开图书馆",
        })

        assert response.status_code == 200
        intervention = response.json()["intervention"]
        assert intervention["type"] == "agent_action"
        assert intervention["target_agent_id"] == agent_id

        engine = sse_mod.get_world_engine(world_id)
        pending = engine._pending_injects[-1]
        assert pending.type == "agent_action"
        assert pending.target_agent_ids == [agent_id]
        assert pending.description == "请立即离开图书馆"

        history = client.get(f"/api/worlds/{world_id}/interventions").json()
        assert history[0]["id"] == intervention["id"]
        assert history[0]["type"] == "agent_action"

        persisted = client.get(f"/api/worlds/{world_id}/events").json()
        injected = next(
            event
            for event in persisted
            if event["description"] == "请立即离开图书馆"
        )
        assert injected["type"] == "agent_action"
        assert injected["target_agent_ids"] == [agent_id]
