"""
SSE 桥接 单元测试。
"""

import json
from types import SimpleNamespace

import pytest
import pytest_asyncio
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from db import Base
from models.event import Event  # noqa: F401
from models.memory import Memory  # noqa: F401
from models.world_orm import WorldRow  # noqa: F401


# =============================================================================
# DB fixtures
# =============================================================================

@pytest_asyncio.fixture
async def engine():
    eng = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        yield s


# =============================================================================
# 世界注册表
# =============================================================================


class TestWorldRegistry:
    def test_register_and_get(self, db_session):
        from api.sse import register_world, get_world_engine
        from engines.world.engine import WorldEngine
        from models.world import Scenario, WorldResponse

        world = WorldResponse(
            id="w1", name="test", scenario=Scenario(name="test"),
            agent_ids=[], created_at="2026-01-01",
        )
        engine = WorldEngine(world, [], db_session)
        register_world("w1", engine)

        got = get_world_engine("w1")
        assert got is engine

    def test_get_missing_raises(self):
        from api.sse import get_world_engine
        from fastapi import HTTPException

        with pytest.raises(HTTPException, match="not active"):
            get_world_engine("nonexistent")

    def test_unregister(self, db_session):
        from api.sse import register_world, unregister_world, get_world_engine
        from engines.world.engine import WorldEngine
        from models.world import Scenario, WorldResponse
        from fastapi import HTTPException

        world = WorldResponse(
            id="w2", name="test", scenario=Scenario(name="test"),
            agent_ids=[], created_at="2026-01-01",
        )
        engine = WorldEngine(world, [], db_session)
        register_world("w2", engine)
        unregister_world("w2")

        with pytest.raises(HTTPException):
            get_world_engine("w2")


# =============================================================================
# SSE 消息格式
# =============================================================================


class TestSSEFormatting:
    def test_sse_event_format(self):
        from api.sse import _sse_event

        result = _sse_event({"type": "agent_message", "content": "你好"})
        assert "data:" in result
        assert "你好" in result
        assert "agent_message" in result
        assert result.endswith("\n\n")

    def test_event_to_dict_all_fields(self):
        from api.sse import _event_to_dict
        from models.event import SimEvent

        evt = SimEvent(
            id="e1", world_id="w1", tick=0, type="agent_message",
            source_agent_id="a1", target_agent_ids=["a2"],
            description="测试", data={"key": "val"},
            created_at="2026-01-01",
        )
        d = _event_to_dict(evt)
        assert d["id"] == "e1"
        assert d["type"] == "agent_message"
        assert d["data"] == {"key": "val"}


# =============================================================================
# SSE 端点
# =============================================================================


class TestSSEEndpoint:
    @pytest.fixture
    def app_with_sse(self, db_session, engine, monkeypatch):
        """创建包含 SSE 路由的测试应用。"""
        import db as db_module
        from api.sse import sse_router, register_world
        from engines.world.engine import WorldEngine
        from models.world import Scenario, WorldResponse

        test_session_factory = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )
        monkeypatch.setattr(db_module, "async_session", test_session_factory)

        app = FastAPI()
        app.include_router(sse_router)

        # 注册一个测试 World
        world = WorldResponse(
            id="w-sse", name="SSE测试", scenario=Scenario(name="测试场景"),
            agent_ids=[], created_at="2026-01-01",
        )
        world_engine = WorldEngine(world, [], db_session)
        register_world("w-sse", world_engine)

        return app

    @pytest.fixture
    def client(self, app_with_sse):
        return TestClient(app_with_sse)

    def test_stream_returns_200(self, client):
        """SSE 端点返回 200 + text/event-stream。"""
        with client.stream("GET", "/api/worlds/w-sse/stream") as r:
            assert r.status_code == 200
            assert "text/event-stream" in r.headers["content-type"]

    def test_stream_contains_connected_event(self, client):
        """第一条消息是 connected 事件。"""
        with client.stream("GET", "/api/worlds/w-sse/stream") as r:
            chunk = next(r.iter_text())
            assert "connected" in chunk

    def test_missing_world_returns_404(self, client):
        response = client.get("/api/worlds/nonexistent/stream")
        assert response.status_code == 404


# =============================================================================
# tick_stream 基础
# =============================================================================


class TestTickStream:
    @pytest.mark.asyncio
    async def test_solo_stream_yields_tick_boundary(self, db_session):
        """单人模式流式 tick 产生至少一个 tick_boundary 事件。"""
        from engines.world.engine import WorldEngine
        from models.world import Scenario, WorldResponse
        from models.agent import (
            Background, BigFive, DecisionStyle, Goal, Persona,
        )
        from engines.agent_factory.factory import LifeAgent

        # Mock client
        class MC:
            model_info = {"function_calling": True, "vision": False, "json_output": True}
            async def create(self, messages, **kw):
                from autogen_core.models import CreateResult, RequestUsage
                return CreateResult(
                    finish_reason="stop", content="嗯，今天想出去走走。",
                    usage=RequestUsage(prompt_tokens=1, completion_tokens=1),
                    cached=False,
                )

        agent = LifeAgent(
            id="a1",
            persona=Persona(name="小明", mbti="INTJ-T", big_five=BigFive(),
                            decision_style=DecisionStyle(), narrative="测试"),
            background=Background(),
            goals=[Goal(id="g1", description="测试", priority=1)],
            model_client=MC(),
        )

        world = WorldResponse(
            id="w-stream", name="stream test",
            scenario=Scenario(name="测试"), agent_ids=["a1"],
            created_at="2026-01-01",
        )
        engine = WorldEngine(world, [agent], db_session)

        events = []
        async for evt in engine.tick_stream():
            events.append(evt)

        # 至少应该有 tick_boundary
        types = [e.type for e in events]
        assert "tick_boundary" in types

    @pytest.mark.asyncio
    async def test_group_stream_yields_relationship_changes(self, db_session):
        """Derived relationship events must reach SSE before tick_boundary."""
        from engines.world.engine import WorldEngine
        from models.event import SimEvent
        from models.world import Scenario, WorldResponse

        agents = [
            SimpleNamespace(
                id=agent_id,
                persona=SimpleNamespace(name=name),
                autogen_agent=SimpleNamespace(name=f"agent_{agent_id}"),
            )
            for agent_id, name in (("a1", "小明"), ("a2", "小红"))
        ]
        world = WorldResponse(
            id="w-group",
            name="group stream",
            scenario=Scenario(name="期末周"),
            agent_ids=["a1", "a2"],
            created_at="2026-01-01",
        )
        engine = WorldEngine(world, agents, db_session)

        async def skip_context():
            return None

        async def fake_group_stream():
            yield SimEvent(
                id="message-1",
                world_id=world.id,
                tick=0,
                type="agent_message",
                source_agent_id="a1",
                target_agent_ids=["a2"],
                description="我要先去图书馆占座",
                created_at="2026-01-01",
            )

        engine._inject_world_context = skip_context
        engine._stream_group_tick = fake_group_stream
        events = [event async for event in engine.tick_stream()]

        event_types = [event.type for event in events]
        assert "relationship_change" in event_types
        assert event_types[-1] == "tick_boundary"
