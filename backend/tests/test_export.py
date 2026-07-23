"""
报告导出 API 单元测试。

覆盖:
- build_report_markdown() 纯函数测试
- GET /api/export/report/{world_id} Markdown 端点
- GET /api/export/report/{world_id}/json JSON 端点
- 404 场景（世界不存在 / 无事件）
"""

import json
import tempfile
from datetime import datetime, timezone
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from api.export import build_report_markdown, router
from api.sse import _active_worlds
from models.event import SimEvent


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

    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


def _sync_drop_tables():
    from db import Base
    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    engine.dispose()


def _insert_world_sync(world_id: str, name: str = "测试世界", scenario_name: str = "新生报到"):
    """用同步 SQLite 插入 world 测试数据。"""
    from models.world_orm import WorldRow

    scenario = {"name": scenario_name, "description": "测试场景"}
    row = WorldRow(
        id=world_id,
        name=name,
        scenario_json=json.dumps(scenario, ensure_ascii=False),
        agent_ids_json=json.dumps(["agent-1"]),
        current_tick=3,
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
    _active_worlds.clear()

    yield

    _sync_drop_tables()
    _active_worlds.clear()


@pytest.fixture
def app():
    app = FastAPI(lifespan=_test_lifespan)
    app.include_router(router)
    from api.worlds import router as worlds_router
    from api.agents import router as agents_router
    app.include_router(worlds_router)
    app.include_router(agents_router)
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


def _make_events(world_id: str, n: int = 5) -> list[SimEvent]:
    events = []
    for i in range(n):
        events.append(SimEvent(
            id=f"evt-{i}",
            world_id=world_id,
            tick=i // 2,
            type=["agent_message", "thought_stream", "agent_action", "world_event", "relationship_change"][i % 5],
            source_agent_id="agent-1" if i % 2 == 0 else None,
            description=f"测试事件 {i}",
            created_at=datetime.now(timezone.utc).isoformat(),
        ))
    return events


# =============================================================================
# build_report_markdown() 纯函数测试
# =============================================================================

class TestBuildReportMarkdown:
    def test_returns_markdown_string(self):
        events = _make_events("w-1", 5)
        result = build_report_markdown(
            world_id="w-1",
            world_name="测试世界",
            events=events,
            agent_names={"agent-1": "小明"},
            scenario_name="新生报到",
        )
        assert isinstance(result, str)
        assert len(result) > 100

    def test_contains_world_name(self):
        result = build_report_markdown(
            world_id="w-1",
            world_name="我的实验",
            events=_make_events("w-1", 2),
            agent_names={"agent-1": "小明"},
        )
        assert "我的实验" in result

    def test_contains_agent_names(self):
        result = build_report_markdown(
            world_id="w-1",
            world_name="W",
            events=_make_events("w-1", 3),
            agent_names={"agent-1": "小红"},
        )
        assert "小红" in result

    def test_contains_event_summary(self):
        events = _make_events("w-1", 7)
        result = build_report_markdown(
            world_id="w-1",
            world_name="W",
            events=events,
            agent_names={"agent-1": "A"},
        )
        assert "7" in result

    def test_empty_events_still_works(self):
        result = build_report_markdown(
            world_id="w-1",
            world_name="W",
            events=[],
            agent_names={},
        )
        assert "实验报告" in result

    def test_scenario_name_included(self):
        result = build_report_markdown(
            world_id="w-1",
            world_name="W",
            events=_make_events("w-1", 1),
            agent_names={"agent-1": "A"},
            scenario_name="期末周",
        )
        assert "期末周" in result


# =============================================================================
# GET /api/export/report/{world_id} — Markdown 端点
# =============================================================================

class TestExportMarkdownEndpoint:
    def test_world_not_found_returns_404(self, client):
        resp = client.get("/api/export/report/nonexistent")
        assert resp.status_code == 404

    def test_no_events_returns_404(self, client):
        _insert_world_sync("w-1")
        resp = client.get("/api/export/report/w-1")
        assert resp.status_code == 404
        detail = resp.json()["detail"].lower()
        assert "no events" in detail

    def test_with_events_returns_markdown(self, client):
        _insert_world_sync("w-1")
        events = _make_events("w-1", 5)

        class FakeEngine:
            def __init__(self, evts):
                self.events = evts
                self.agents = {}

        _active_worlds["w-1"] = FakeEngine(events)  # type: ignore

        resp = client.get("/api/export/report/w-1")
        assert resp.status_code == 200
        assert "text/markdown" in resp.headers["content-type"]
        assert "attachment" in resp.headers["content-disposition"]
        assert "实验报告" in resp.text

    def test_filename_includes_world_name(self, client):
        _insert_world_sync("w-1", name="TestWorld")

        class FakeEngine:
            def __init__(self):
                self.events = _make_events("w-1", 2)
                self.agents = {}

        _active_worlds["w-1"] = FakeEngine()  # type: ignore

        resp = client.get("/api/export/report/w-1")
        assert "TestWorld" in resp.headers["content-disposition"]


# =============================================================================
# GET /api/export/report/{world_id}/json — JSON 端点
# =============================================================================

class TestExportJsonEndpoint:
    def test_world_not_found_returns_404(self, client):
        resp = client.get("/api/export/report/nonexistent/json")
        assert resp.status_code == 404

    def test_returns_json_report(self, client):
        _insert_world_sync("w-1")
        events = _make_events("w-1", 3)

        class FakeEngine:
            def __init__(self):
                self.events = events
                self.agents = {}

        _active_worlds["w-1"] = FakeEngine()  # type: ignore

        resp = client.get("/api/export/report/w-1/json")
        assert resp.status_code == 200
        assert "application/json" in resp.headers["content-type"]

        data = json.loads(resp.text)
        assert data["world_id"] == "w-1"
        assert data["world_name"] == "测试世界"
        assert data["total_events"] == 3
        assert len(data["events"]) == 3
