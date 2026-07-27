"""WorldEngine construction, context, and event conversion tests."""

import pytest

from tests.world_engine_fixtures import (
    FakeMessage,
    db_session,
    engine,  # noqa: F401 - dependency fixture used by db_session
    make_agent,
    make_world,
)


class TestWorldEngineInit:
    def test_init_stores_world_and_agents(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [make_agent("agent-1", "小明")], db_session)
        assert engine.world.name == "测试世界"
        assert len(engine.agents) == 1
        assert "agent-1" in engine.agents
        assert engine.current_tick == 0

    def test_init_with_multiple_agents(self, db_session):
        from engines.world.engine import WorldEngine

        agents = [make_agent(f"a{i}", f"角色{i}") for i in range(4)]
        assert len(WorldEngine(make_world(), agents, db_session).agents) == 4


class TestBuildWorldContext:
    def test_contains_location_weather_and_agent(self, db_session):
        from engines.world.engine import WorldEngine

        context = WorldEngine(
            make_world(), [make_agent("a1", "小明")], db_session
        )._build_world_context()
        assert "大学宿舍" in context
        assert "晴" in context
        assert "小明" in context

    def test_contains_tick_number(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [make_agent("a1", "小明")], db_session)
        engine.current_tick = 5
        assert "第 5 个时间段" in engine._build_world_context()

    def test_recent_events_in_context(self, db_session):
        from engines.world.engine import WorldEngine
        from models.event import SimEvent

        engine = WorldEngine(make_world(), [make_agent("a1", "小明")], db_session)
        engine.events = [SimEvent(
            id="e1",
            world_id="w1",
            tick=0,
            type="agent_message",
            source_agent_id="a1",
            description="小明打了个招呼",
            created_at="2026-01-01",
        )]
        assert "打了个招呼" in engine._build_world_context()

    def test_exam_week_contains_decreasing_seat_resource(self, db_session):
        from engines.world.engine import WorldEngine

        world = make_world()
        world.scenario.environment_params["stress_level"] = "high"
        engine = WorldEngine(world, [make_agent("a1", "小明")], db_session)
        engine.current_tick = 5
        assert "图书馆剩余座位 85 个" in engine._build_world_context()

    def test_resource_count_never_becomes_negative(self, db_session):
        from engines.world.engine import WorldEngine

        world = make_world()
        world.scenario.environment_params["stress_level"] = "high"
        engine = WorldEngine(world, [make_agent("a1", "小明")], db_session)
        engine.current_tick = 100
        assert "图书馆剩余座位 0 个" in engine._build_world_context()


class TestEventConversion:
    def test_make_error_event(self, db_session):
        from engines.world.engine import WorldEngine

        event = WorldEngine(make_world(), [], db_session)._make_error_event(
            "agent-1", "连接超时"
        )
        assert event.type == "world_event"
        assert "连接超时" in event.description
        assert event.source_agent_id is None

    def test_convert_message_to_event(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        event = engine._convert_message_to_event(
            FakeMessage("你好，世界！", source="agent-1")
        )
        assert event is not None
        assert event.type == "agent_message"
        assert event.source_agent_id == "agent-1"


class TestInjectEvent:
    def test_inject_adds_world_event(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        event = engine.inject_event("天降暴雨")
        assert len(engine.events) == 1
        assert event is engine.events[0]
        assert engine.events[0].type == "world_event"
        assert "暴雨" in engine.events[0].description

    def test_inject_preserves_type_and_target(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        event = engine.inject_event(
            "请陈默立即离开图书馆",
            event_type="agent_action",
            target_agent_ids=["agent-1"],
        )

        assert event.type == "agent_action"
        assert event.target_agent_ids == ["agent-1"]
        assert event.data == {
            "action": "导演干预",
            "description": "请陈默立即离开图书馆",
        }

    @pytest.mark.asyncio
    async def test_pending_injection_is_first_streamed_event(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        injected = engine.inject_event("天降暴雨")

        streamed = [event async for event in engine.tick_stream()]

        assert streamed[0] is injected
        assert sum(event.id == injected.id for event in streamed) == 1
        assert sum(event.id == injected.id for event in engine.events) == 1
