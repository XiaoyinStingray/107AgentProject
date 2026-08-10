"""
SSE 桥接 单元测试。
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from fastapi import FastAPI
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
        # ensure_ascii=True escapes CJK to \uXXXX; verify via JSON parse
        import json
        parsed = json.loads(result.lstrip("data: ").rstrip("\n"))
        assert parsed["content"] == "你好"
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
# SSE 连接隔离
# =============================================================================


class TestSSEConnectionIsolation:
    @pytest.mark.asyncio
    async def test_superseding_one_world_does_not_stop_another_world(self):
        """同 World 新连接只淘汰旧连接，不影响其他 World。"""
        from api.sse import (
            _active_connection_ids,
            _world_event_generator,
        )

        def paused_engine():
            return SimpleNamespace(
                agents={},
                current_tick=0,
                world=SimpleNamespace(status="paused"),
            )

        _active_connection_ids.clear()
        _active_connection_ids.update({
            "world-a": "new-a",
            "world-b": "conn-b",
        })
        old_a = _world_event_generator("world-a", paused_engine(), "old-a")  # type: ignore[arg-type]
        active_b = _world_event_generator("world-b", paused_engine(), "conn-b")  # type: ignore[arg-type]

        connected_a = json.loads(
            (await anext(old_a)).removeprefix("data: ").strip()
        )
        connected_b = json.loads(
            (await anext(active_b)).removeprefix("data: ").strip()
        )

        assert connected_a["world_id"] == "world-a"
        assert connected_b["world_id"] == "world-b"
        with pytest.raises(StopAsyncIteration):
            await anext(old_a)

        # 当前协议在暂停时保持连接但静默，不再周期性发送 paused 事件。
        # world-a 的旧连接退出后，world-b 的连接注册仍应保持不变。
        assert _active_connection_ids["world-b"] == "conn-b"

        await active_b.aclose()
        _active_connection_ids.clear()

    @pytest.mark.asyncio
    async def test_solo_auto_finish_persists_runtime_tick(self, monkeypatch):
        """Eight-tick solo sessions persist their final status before SSE closes."""
        import api.worlds as worlds_mod
        from api.sse import _active_connection_ids, _world_event_generator

        class SoloEngine:
            def __init__(self):
                self.agents = {
                    "agent-1": SimpleNamespace(
                        persona=SimpleNamespace(name="测试 Agent"),
                    ),
                }
                self.current_tick = 0
                self.simulation_id = None
                self.world = SimpleNamespace(
                    id="solo-auto",
                    status="running",
                    current_tick=0,
                )

            async def tick_stream(self):
                self.current_tick += 1
                self.world.current_tick = self.current_tick
                if False:
                    yield None

        engine = SoloEngine()
        sync_world = AsyncMock()
        monkeypatch.setattr(worlds_mod, "_sync_world_to_db", sync_world)
        _active_connection_ids["solo-auto"] = "conn-auto"

        chunks = [
            chunk
            async for chunk in _world_event_generator(
                "solo-auto",
                engine,  # type: ignore[arg-type]
                "conn-auto",
            )
        ]

        assert engine.current_tick == 8
        assert engine.world.current_tick == 8
        assert engine.world.status == "finished"
        assert any("session_end" in chunk for chunk in chunks)
        sync_world.assert_awaited_once_with(engine.world)


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

    @pytest.mark.asyncio
    async def test_stream_returns_200(self, app_with_sse):
        """SSE 端点返回 text/event-stream，且不依赖会挂起的同步流客户端。"""
        from api.sse import stream_world

        response = await stream_world("w-sse")  # type: ignore[misc]

        assert response.status_code == 200
        assert response.media_type == "text/event-stream"
        await response.body_iterator.aclose()  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    async def test_stream_contains_connected_event(self, app_with_sse):
        """第一条消息是 connected 事件。"""
        from api.sse import stream_world

        response = await stream_world("w-sse")  # type: ignore[misc]
        chunk = await anext(response.body_iterator)  # type: ignore[arg-type]

        assert "connected" in chunk
        await response.body_iterator.aclose()  # type: ignore[attr-defined]

    @pytest.mark.asyncio
    async def test_missing_world_returns_404(self, app_with_sse):
        from fastapi import HTTPException
        from api.sse import stream_world

        with pytest.raises(HTTPException) as error:
            await stream_world("nonexistent")

        assert error.value.status_code == 404


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
        engine = WorldEngine(world, agents, db_session)  # type: ignore[arg-type]

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


# =============================================================================
# Step 80/81: plan_revised 事件格式 + 场景 tool description
# =============================================================================


class TestPlanRevisedEventFormat:
    """Step 80: plan_revised SSE 事件格式验证。"""

    def test_plan_revised_sse_event_serialization(self):
        """plan_revised 事件通过 _sse_event 序列化后包含必要字段。"""
        from api.sse import _sse_event

        payload = {
            "type": "plan_revised",
            "world_id": "w1",
            "tick": 5,
            "data": {
                "step_index": 1,
                "old_title": "竞品分析",
                "new_title": "快速竞品扫描",
                "reason": "原方案太耗时",
                "steps": [],
            },
        }
        result = _sse_event(payload)

        assert "data:" in result
        assert "plan_revised" in result
        # ensure_ascii=True escapes CJK to \uXXXX; verify via JSON parse
        import json
        parsed = json.loads(result.lstrip("data: ").rstrip("\n"))
        assert parsed["data"]["new_title"] == "快速竞品扫描"
        assert result.endswith("\n\n")

    def test_plan_revised_event_to_dict(self):
        """plan_revised SimEvent 通过 _event_to_dict 序列化后保留 data 字段。"""
        from api.sse import _event_to_dict
        from models.event import SimEvent

        evt = SimEvent(
            id="e-pr", world_id="w1", tick=3, type="plan_revised",
            source_agent_id="a1", target_agent_ids=[],
            description="计划修订",
            data={"old_title": "旧步骤", "new_title": "新步骤", "reason": "原因"},
            created_at="2026-01-01",
        )
        d = _event_to_dict(evt)
        assert d["type"] == "plan_revised"
        assert d["data"]["old_title"] == "旧步骤"
        assert d["data"]["new_title"] == "新步骤"


class TestSceneToolDescriptions:
    """Step 81: 场景 tool 的 action description 生成。"""

    def test_move_to_description(self):
        """move_to tool call 生成通用 description。"""
        from engines.world.messages import _build_action_description

        desc = _build_action_description("move_to", {"tile_x": 4, "tile_y": 3})
        assert "move_to" in desc

    def test_interact_with_description(self):
        """interact_with tool call 生成通用 description。"""
        from engines.world.messages import _build_action_description

        desc = _build_action_description(
            "interact_with", {"target_name": "小红", "action": "talk"},
        )
        assert "interact_with" in desc

    def test_revise_plan_description(self):
        """revise_plan tool call 生成通用 description。"""
        from engines.world.messages import _build_action_description

        desc = _build_action_description(
            "revise_plan",
            {"step_title": "竞品分析", "new_title": "快速扫描", "reason": "太耗时"},
        )
        assert "revise_plan" in desc
