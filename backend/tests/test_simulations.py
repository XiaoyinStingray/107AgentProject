"""
模拟记录 API 单元测试。

覆盖:
- GET /api/simulations 返回附带 world_name/agent_count/event_count
- GET /api/simulations world_id 筛选
- GET /api/simulations 跳过已删 World
- GET /api/simulations/{id} 404
"""

import json
import tempfile
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from api.simulations import router
from models.agent_orm import AgentRow
from models.world_orm import WorldRow
from models.simulation_orm import SimulationRow
from models.event import Event


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
    import models.simulation_orm  # noqa: F401

    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


def _sync_drop_tables():
    from db import Base
    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    engine.dispose()


def _insert_agent_sync(agent_id: str, name: str = "测试Agent"):
    """用同步 SQLite 插入 agent 测试数据。"""
    persona = {"name": name, "age": 20, "persona": "测试人格"}
    row = AgentRow(
        id=agent_id,
        name=name,
        persona_json=json.dumps(persona, ensure_ascii=False),
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    engine = create_engine(_SYNC_DB_URL)
    with Session(engine) as session:
        session.add(row)
        session.commit()
    engine.dispose()


def _insert_world_sync(world_id: str, agent_ids: list[str], name: str = "测试世界"):
    """用同步 SQLite 插入 world 测试数据。"""
    scenario = {"name": "测试场景", "description": "测试场景描述"}
    row = WorldRow(
        id=world_id,
        name=name,
        scenario_json=json.dumps(scenario, ensure_ascii=False),
        agent_ids_json=json.dumps(agent_ids),
        current_tick=10,
        status="finished",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    engine = create_engine(_SYNC_DB_URL)
    with Session(engine) as session:
        session.add(row)
        session.commit()
    engine.dispose()


def _delete_world_sync(world_id: str):
    """用同步 SQLite 删除 world 测试数据。"""
    engine = create_engine(_SYNC_DB_URL)
    with Session(engine) as session:
        world = session.query(WorldRow).filter(WorldRow.id == world_id).first()
        if world:
            session.delete(world)
            session.commit()
    engine.dispose()


def _insert_simulation_sync(sim_id: str, world_id: str, total_ticks: int = 10):
    """用同步 SQLite 插入 simulation 测试数据。"""
    row = SimulationRow(
        id=sim_id,
        world_id=world_id,
        started_at=datetime.now(timezone.utc).isoformat(),
        ended_at=datetime.now(timezone.utc).isoformat(),
        total_ticks=total_ticks,
        status="finished",
    )
    engine = create_engine(_SYNC_DB_URL)
    with Session(engine) as session:
        session.add(row)
        session.commit()
    engine.dispose()


def _insert_event_sync(event_id: str, world_id: str, tick: int = 0):
    """用同步 SQLite 插入 event 测试数据。"""
    row = Event(
        id=event_id,
        world_id=world_id,
        tick=tick,
        type="agent_message",
        source_agent_id="agent-1",
        description="测试事件",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    engine = create_engine(_SYNC_DB_URL)
    with Session(engine) as session:
        session.add(row)
        session.commit()
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

    _sync_drop_tables()


@pytest.fixture
def app():
    app = FastAPI(lifespan=_test_lifespan)
    app.include_router(router)
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


# =============================================================================
# BT-06: GET /api/simulations 返回附带 world_name/agent_count/event_count
# =============================================================================

class TestSimulationsList:
    def test_returns_simulations_with_context(self, client):
        """BT-06: 返回附带 world_name/agent_count/event_count"""
        _insert_agent_sync("agent-1")
        _insert_agent_sync("agent-2")
        _insert_world_sync("world-1", ["agent-1", "agent-2"], "测试世界")
        _insert_simulation_sync("sim-1", "world-1", 10)
        _insert_event_sync("evt-1", "world-1", 0)
        _insert_event_sync("evt-2", "world-1", 1)
        
        resp = client.get("/api/simulations")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        
        sim = data[0]
        assert sim["id"] == "sim-1"
        assert sim["world_id"] == "world-1"
        assert sim["world_name"] == "测试世界"
        assert sim["agent_count"] == 2
        assert sim["event_count"] == 2


# =============================================================================
# BT-07: GET /api/simulations world_id 筛选
# =============================================================================

class TestSimulationsFilter:
    def test_filter_by_world_id(self, client):
        """BT-07: world_id 筛选"""
        _insert_world_sync("world-1", ["agent-1"])
        _insert_world_sync("world-2", ["agent-2"])
        _insert_simulation_sync("sim-1", "world-1")
        _insert_simulation_sync("sim-2", "world-2")
        
        resp = client.get("/api/simulations?world_id=world-1")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["world_id"] == "world-1"


# =============================================================================
# BT-08: GET /api/simulations 跳过已删 World
# =============================================================================

class TestSimulationsDeletedWorld:
    def test_skip_deleted_world(self, client):
        """BT-08: 跳过已删 World"""
        _insert_world_sync("world-1", ["agent-1"])
        _insert_simulation_sync("sim-1", "world-1")
        _delete_world_sync("world-1")
        
        resp = client.get("/api/simulations")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 0


# =============================================================================
# BT-09: GET /api/simulations/{id} 404
# =============================================================================

class TestSimulationDetail:
    def test_not_found_returns_404(self, client):
        """BT-09: 不存在的 id 返回 404"""
        resp = client.get("/api/simulations/nonexistent")
        assert resp.status_code == 404
