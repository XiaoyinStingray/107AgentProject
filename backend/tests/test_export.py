"""
报告导出 API 单元测试。

覆盖:
- build_report_markdown() 纯函数测试
- GET /api/export/report/{world_id} Markdown 端点
- GET /api/export/report/{world_id}/json JSON 端点
- 404 场景（世界不存在 / 无事件）
"""

import json
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.agents import AgentStore, get_agent_store
from api.export import build_report_markdown, router
from api.sse import _active_worlds
from api.worlds import WorldStore, get_world_store
from models.event import SimEvent
from models.world import Scenario, WorldResponse


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture(autouse=True)
def _reset_stores():
    """每个测试前重置内存存储。"""
    import api.agents as agents_mod
    import api.worlds as worlds_mod

    agents_mod._agent_store = AgentStore()
    worlds_mod._world_store = WorldStore()
    _active_worlds.clear()
    yield
    _active_worlds.clear()


@pytest.fixture
def app():
    app = FastAPI()
    app.include_router(router)
    # 同时挂载 worlds + agents 用于依赖注入
    from api.worlds import router as worlds_router
    from api.agents import router as agents_router
    app.include_router(worlds_router)
    app.include_router(agents_router)
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


def _make_events(world_id: str, n: int = 5) -> list[SimEvent]:
    """生成 n 条测试事件。"""
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


def _make_world(world_id: str = "w-1", name: str = "测试世界") -> WorldResponse:
    return WorldResponse(
        id=world_id,
        name=name,
        scenario=Scenario(name="新生报到", description="测试场景"),
        agent_ids=["agent-1"],
        current_tick=3,
        status="finished",
        created_at=datetime.now(timezone.utc).isoformat(),
    )


# =============================================================================
# build_report_markdown() 纯函数测试
# =============================================================================

class TestBuildReportMarkdown:
    def test_returns_markdown_string(self):
        """返回非空 Markdown 字符串。"""
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
        """报告标题包含世界名称。"""
        result = build_report_markdown(
            world_id="w-1",
            world_name="我的实验",
            events=_make_events("w-1", 2),
            agent_names={"agent-1": "小明"},
        )
        assert "我的实验" in result

    def test_contains_agent_names(self):
        """报告包含 Agent 名称。"""
        result = build_report_markdown(
            world_id="w-1",
            world_name="W",
            events=_make_events("w-1", 3),
            agent_names={"agent-1": "小红"},
        )
        assert "小红" in result

    def test_contains_event_summary(self):
        """报告摘要包含事件总数。"""
        events = _make_events("w-1", 7)
        result = build_report_markdown(
            world_id="w-1",
            world_name="W",
            events=events,
            agent_names={"agent-1": "A"},
        )
        assert "7" in result

    def test_empty_events_still_works(self):
        """空事件列表也能生成报告。"""
        result = build_report_markdown(
            world_id="w-1",
            world_name="W",
            events=[],
            agent_names={},
        )
        assert "实验报告" in result

    def test_scenario_name_included(self):
        """场景名称出现在报告中。"""
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
        """世界存在但无事件时返回 404。"""
        # 先创建世界
        from api.worlds import _world_store
        world = _make_world("w-1")
        _world_store.save(world)

        resp = client.get("/api/export/report/w-1")
        assert resp.status_code == 404
        assert "no events" in resp.json()["detail"].lower() or "No events" in resp.json()["detail"]

    def test_with_events_returns_markdown(self, client):
        """有事件时返回 Markdown 文件。"""
        from api.worlds import _world_store
        world = _make_world("w-1")
        _world_store.save(world)

        # 注入事件到活跃世界（通过 mock engine）
        events = _make_events("w-1", 5)

        class FakeEngine:
            def __init__(self, events):
                self.events = events
                self.agents = {}

        _active_worlds["w-1"] = FakeEngine(events)  # type: ignore[assignment]

        resp = client.get("/api/export/report/w-1")
        assert resp.status_code == 200
        assert "text/markdown" in resp.headers["content-type"]
        assert "attachment" in resp.headers["content-disposition"]
        assert "实验报告" in resp.text

    def test_filename_includes_world_name(self, client):
        """下载文件名包含世界名称的 ASCII slug。"""
        from api.worlds import _world_store
        world = _make_world("w-1", name="TestWorld")
        _world_store.save(world)

        class FakeEngine:
            def __init__(self):
                self.events = _make_events("w-1", 2)
                self.agents = {}

        _active_worlds["w-1"] = FakeEngine()  # type: ignore[assignment]

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
        """返回 JSON 格式报告。"""
        from api.worlds import _world_store
        world = _make_world("w-1")
        _world_store.save(world)

        events = _make_events("w-1", 3)

        class FakeEngine:
            def __init__(self):
                self.events = events
                self.agents = {}

        _active_worlds["w-1"] = FakeEngine()  # type: ignore[assignment]

        resp = client.get("/api/export/report/w-1/json")
        assert resp.status_code == 200
        assert "application/json" in resp.headers["content-type"]

        data = json.loads(resp.text)
        assert data["world_id"] == "w-1"
        assert data["world_name"] == "测试世界"
        assert data["total_events"] == 3
        assert len(data["events"]) == 3
