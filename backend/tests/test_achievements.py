"""
成就系统 API 单元测试。

覆盖:
- GET /api/achievements 返回 10 个成就 + 4 项统计
- 成就解锁条件验证
- 全能选手 ach-10 进度计算
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

from api.achievements import router
from models.agent_orm import AgentRow
from models.world_orm import WorldRow


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
        current_tick=0,
        status="finished",
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
# BT-01: GET /api/achievements 返回 10 个成就 + 4 项统计
# =============================================================================

class TestAchievementsBasic:
    def test_returns_10_achievements(self, client):
        """BT-01: 返回 10 个成就"""
        resp = client.get("/api/achievements")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["achievements"]) == 10

    def test_returns_4_summary_stats(self, client):
        """BT-01: 返回 4 项统计"""
        resp = client.get("/api/achievements")
        data = resp.json()
        assert "summary" in data
        summary = data["summary"]
        assert "total_agents" in summary
        assert "total_simulations" in summary
        assert "total_ticks" in summary
        assert "total_narratives" in summary


# =============================================================================
# BT-02/03: 成就解锁条件 — ach-1 造物主
# =============================================================================

class TestAchievementUnlockConditions:
    def test_ach1_locked_with_0_agents(self, client):
        """BT-02: 0 Agent 时 ach-1 未解锁"""
        resp = client.get("/api/achievements")
        data = resp.json()
        ach1 = next(a for a in data["achievements"] if a["id"] == "ach-1")
        assert ach1["unlocked"] is False
        assert ach1["progress"] == 0

    def test_ach1_unlocked_with_1_agent(self, client):
        """BT-03: 1+ Agent 时 ach-1 已解锁"""
        _insert_agent_sync("agent-1", "测试Agent")
        resp = client.get("/api/achievements")
        data = resp.json()
        ach1 = next(a for a in data["achievements"] if a["id"] == "ach-1")
        assert ach1["unlocked"] is True
        assert ach1["progress"] == 1


# =============================================================================
# BT-04: 成就解锁条件 — ach-2 三人成众
# =============================================================================

class TestAchievementAch2:
    def test_ach2_unlocked_with_3_agent_world(self, client):
        """BT-04: 3+ Agent World 时 ach-2 解锁"""
        _insert_agent_sync("agent-1")
        _insert_agent_sync("agent-2")
        _insert_agent_sync("agent-3")
        _insert_world_sync("world-1", ["agent-1", "agent-2", "agent-3"])
        
        resp = client.get("/api/achievements")
        data = resp.json()
        ach2 = next(a for a in data["achievements"] if a["id"] == "ach-2")
        assert ach2["unlocked"] is True
        assert ach2["progress"] == 1


# =============================================================================
# BT-05: 全能选手 ach-10 进度计算
# =============================================================================

class TestAchievementAch10:
    def test_ach10_progress_partial(self, client):
        """BT-05: 部分成就解锁时 ach-10 进度"""
        _insert_agent_sync("agent-1")  # 解锁 ach-1
        
        resp = client.get("/api/achievements")
        data = resp.json()
        ach10 = next(a for a in data["achievements"] if a["id"] == "ach-10")
        # ach-10 依赖其他 9 个成就全部解锁
        assert ach10["unlocked"] is False
        # 进度应该是已解锁成就数 / 9
        assert 0 < ach10["progress"] < 1


# =============================================================================
# 统计摘要验证
# =============================================================================

class TestAchievementsSummary:
    def test_summary_counts_agents(self, client):
        """统计摘要正确计算 Agent 数"""
        _insert_agent_sync("agent-1")
        _insert_agent_sync("agent-2")
        
        resp = client.get("/api/achievements")
        data = resp.json()
        assert data["summary"]["total_agents"] == 2

    def test_summary_counts_simulations(self, client):
        """统计摘要正确计算模拟数"""
        from models.simulation_orm import SimulationRow
        
        engine = create_engine(_SYNC_DB_URL)
        with Session(engine) as session:
            sim = SimulationRow(
                id="sim-1",
                world_id="world-1",
                started_at=datetime.now(timezone.utc).isoformat(),
                ended_at=None,
                total_ticks=10,
                status="finished",
            )
            session.add(sim)
            session.commit()
        engine.dispose()
        
        resp = client.get("/api/achievements")
        data = resp.json()
        assert data["summary"]["total_simulations"] == 1
