"""
WorldEngine 单元测试 — 内存 SQLite + Mock LLM。
Solo/Group tick 使用可控的 Mock 客户端。
"""

import json

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from db import Base
from models.event import Event  # noqa: F401
from models.memory import Memory  # noqa: F401


# =============================================================================
# Mock LLM 客户端（模拟对话输出）
# =============================================================================


class _FakeMessage:
    """模拟 AutoGen ChatMessage，兼容 on_messages 返回。"""

    def __init__(self, content: str, source: str = "agent"):
        self.content = content
        self.source = source


class MockModelClient:
    """模拟 LLM 客户端——返回 CreateResult 兼容 AutoGen 0.7 的 _call_llm。"""

    model_info = {"function_calling": True, "vision": False, "json_output": True}

    def __init__(self, fixed_response: str | None = None):
        self._fixed = fixed_response
        self.call_count = 0

    async def create(self, messages, **kwargs):
        from autogen_core.models import CreateResult, RequestUsage

        self.call_count += 1
        content = self._fixed or "这是一个模拟的 LLM 响应。"
        return CreateResult(
            finish_reason="stop",
            content=content,
            usage=RequestUsage(prompt_tokens=10, completion_tokens=5),
            cached=False,
        )


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
# Agent & World fixtures
# =============================================================================


def make_world():
    """创建一个 WorldResponse 用于测试。"""
    from models.world import Scenario, WorldResponse

    return WorldResponse(
        id="world-1",
        name="测试世界",
        scenario=Scenario(
            name="新生报到",
            description="大学开学第一天",
            time_range="1-5",
            initial_events=["宿舍分配完成"],
            environment_params={"location": "大学宿舍", "weather": "晴"},
        ),
        agent_ids=["agent-1", "agent-2"],
        current_tick=0,
        status="idle",
        created_at="2026-07-17T00:00:00",
    )


def make_agent(agent_id: str, name: str, mbti: str = "INTJ-T"):
    """创建一个 LifeAgent 用于测试。"""
    from models.agent import (
        Background,
        BigFive,
        DecisionStyle,
        Goal,
        Persona,
    )
    from engines.agent_factory.factory import LifeAgent

    persona = Persona(
        name=name,
        mbti=mbti,
        big_five=BigFive(),
        values=["成就", "独立"],
        decision_style=DecisionStyle(),
        narrative=f"{name}是一个虚构角色，用于测试。",
    )

    return LifeAgent(
        id=agent_id,
        persona=persona,
        background=Background(hometown="测试镇"),
        goals=[Goal(id="g1", description="测试目标", priority=1)],
        model_client=MockModelClient(),
    )


# =============================================================================
# WorldEngine 基础
# =============================================================================


class TestWorldEngineInit:
    def test_init_stores_world_and_agents(self, db_session):
        from engines.world.engine import WorldEngine

        world = make_world()
        agent = make_agent("agent-1", "小明")
        engine = WorldEngine(world, [agent], db_session)

        assert engine.world.name == "测试世界"
        assert len(engine.agents) == 1
        assert "agent-1" in engine.agents
        assert engine.current_tick == 0

    def test_init_with_multiple_agents(self, db_session):
        from engines.world.engine import WorldEngine

        world = make_world()
        agents = [make_agent(f"a{i}", f"角色{i}") for i in range(4)]
        engine = WorldEngine(world, agents, db_session)
        assert len(engine.agents) == 4


# =============================================================================
# _build_world_context
# =============================================================================


class TestBuildWorldContext:
    def test_contains_location_and_weather(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [make_agent("a1", "小明")], db_session)
        ctx = engine._build_world_context()

        assert "大学宿舍" in ctx
        assert "晴" in ctx
        assert "小明" in ctx

    def test_contains_tick_number(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [make_agent("a1", "小明")], db_session)
        engine.current_tick = 5
        ctx = engine._build_world_context()

        assert "第 5 个时间段" in ctx

    def test_recent_events_in_context(self, db_session):
        from engines.world.engine import WorldEngine
        from models.event import SimEvent

        engine = WorldEngine(make_world(), [make_agent("a1", "小明")], db_session)
        engine.events = [
            SimEvent(
                id="e1", world_id="w1", tick=0, type="agent_message",
                source_agent_id="a1", description="小明打了个招呼",
                created_at="2026-01-01",
            ),
        ]
        ctx = engine._build_world_context()

        assert "打了个招呼" in ctx


# =============================================================================
# 事件转换 & 错误事件
# =============================================================================


class TestEventConversion:
    def test_make_error_event(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        evt = engine._make_error_event("agent-1", "连接超时")

        assert evt.type == "world_event"
        assert "连接超时" in evt.description
        assert evt.source_agent_id is None

    def test_convert_message_to_event(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        msg = _FakeMessage("你好，世界！", source="agent-1")
        evt = engine._convert_message_to_event(msg)

        assert evt is not None
        assert evt.type == "agent_message"
        assert evt.source_agent_id == "agent-1"
        assert "你好" in evt.description


# =============================================================================
# inject_event
# =============================================================================


class TestInjectEvent:
    def test_inject_adds_world_event(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        assert len(engine.events) == 0

        engine.inject_event("天降暴雨")
        assert len(engine.events) == 1
        assert engine.events[0].type == "world_event"
        assert "暴雨" in engine.events[0].description


# =============================================================================
# _persist_events
# =============================================================================


class TestPersistEvents:
    @pytest.mark.asyncio
    async def test_persist_writes_to_db(self, db_session):
        from engines.world.engine import WorldEngine
        from models.event import SimEvent

        engine = WorldEngine(make_world(), [], db_session)
        events = [
            SimEvent(
                id="evt-1", world_id="world-1", tick=0,
                type="agent_message", source_agent_id="a1",
                description="测试事件", created_at="2026-01-01",
            ),
        ]

        await engine._persist_events(events)

        # 验证写入
        result = await db_session.execute(
            __import__("sqlalchemy").text("SELECT * FROM events WHERE id = 'evt-1'")
        )
        row = result.fetchone()
        assert row is not None
        assert row.description == "测试事件"

    @pytest.mark.asyncio
    async def test_persist_empty_list_noop(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        await engine._persist_events([])  # 不抛异常


# =============================================================================
# Solo tick（Mock LLM）
# =============================================================================


class TestSoloTick:
    @pytest.mark.asyncio
    async def test_solo_tick_returns_events(self, db_session):
        from engines.world.engine import WorldEngine

        model_client = MockModelClient("我想去图书馆看看有没有位置。")
        agent = make_agent("agent-1", "小明")
        # 替换 model_client 为可控的 mock
        setattr(agent._agent, "_model_client", model_client)

        engine = WorldEngine(make_world(), [agent], db_session)
        events = await engine._run_solo_tick(agent)

        assert len(events) >= 1
        # solo 模式产出的第一个事件可能是 agent_message 或 thought_stream
        assert events[0].type in ("thought_stream", "agent_message")
        assert events[0].source_agent_id == "agent-1"

    @pytest.mark.asyncio
    async def test_solo_tick_error_handling(self, db_session):
        """Agent 崩溃时返回错误事件而非异常穿透。"""
        from engines.world.engine import WorldEngine

        # 模拟一个会崩溃的 agent
        class _BrokenClient:
            model_info = {"function_calling": True, "vision": False, "json_output": True}

            async def create(self, messages, **kwargs):
                raise RuntimeError("模拟的网络故障")

        agent = make_agent("agent-1", "小明")
        setattr(agent._agent, "_model_client", _BrokenClient())

        engine = WorldEngine(make_world(), [agent], db_session)
        events = await engine._run_solo_tick(agent)

        # 应返回错误事件而非抛异常
        assert len(events) == 1
        assert events[0].type == "world_event"
        assert "网络故障" in events[0].description


# =============================================================================
# tick() 集成
# =============================================================================


class TestTickIntegration:
    @pytest.mark.asyncio
    async def test_tick_increments_counter(self, db_session):
        from engines.world.engine import WorldEngine

        model_client = MockModelClient("嗯，今天天气不错。")
        agent = make_agent("agent-1", "小明")
        setattr(agent._agent, "_model_client", model_client)

        engine = WorldEngine(make_world(), [agent], db_session)
        assert engine.current_tick == 0

        await engine.tick()
        assert engine.current_tick == 1

    @pytest.mark.asyncio
    async def test_tick_appends_to_events(self, db_session):
        from engines.world.engine import WorldEngine

        model_client = MockModelClient("思考中...")
        agent = make_agent("agent-1", "小明")
        setattr(agent._agent, "_model_client", model_client)

        engine = WorldEngine(make_world(), [agent], db_session)
        await engine.tick()

        assert len(engine.events) >= 1


# =============================================================================
# run()
# =============================================================================


class TestRun:
    @pytest.mark.asyncio
    async def test_run_respects_max_ticks(self, db_session):
        from engines.world.engine import WorldEngine

        model_client = MockModelClient("tick tick...")
        agent = make_agent("agent-1", "小明")
        setattr(agent._agent, "_model_client", model_client)

        engine = WorldEngine(make_world(), [agent], db_session)
        all_events = await engine.run(max_ticks=3)

        assert engine.current_tick == 3
        assert len(all_events) >= 3

    @pytest.mark.asyncio
    async def test_run_stops_when_paused(self, db_session):
        from engines.world.engine import WorldEngine

        model_client = MockModelClient("继续...")
        agent = make_agent("agent-1", "小明")
        setattr(agent._agent, "_model_client", model_client)

        engine = WorldEngine(make_world(), [agent], db_session)

        # 在 3 个 tick 后暂停
        original_tick = engine.tick
        call_count = [0]

        async def tick_with_pause():
            call_count[0] += 1
            if call_count[0] == 2:
                engine.world.status = "paused"
            return await original_tick()

        engine.tick = tick_with_pause  # type: ignore[method-assign]
        all_events = await engine.run(max_ticks=10)

        # 应在第 2 个 tick 后暂停
        assert call_count[0] == 2
        assert engine.world.status == "paused"


# =============================================================================
# stub 方法
# =============================================================================


class TestStubs:
    def test_apply_action_is_noop(self, db_session):
        from engines.world.engine import WorldEngine
        from models.event import SimEvent

        engine = WorldEngine(make_world(), [], db_session)
        evt = SimEvent(
            id="e1", world_id="w1", tick=0, type="agent_action",
            source_agent_id="a1", description="send_message",
            created_at="2026-01-01",
        )
        engine._apply_action(evt)  # 不抛异常

    def test_update_relationships_is_noop(self, db_session):
        from engines.world.engine import WorldEngine

        engine = WorldEngine(make_world(), [], db_session)
        engine._update_relationships([])  # 不抛异常
