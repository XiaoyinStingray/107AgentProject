"""Shared fixtures and builders for WorldEngine tests."""

import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from db import Base
from models.event import Event  # noqa: F401
from models.memory import Memory  # noqa: F401


class FakeMessage:
    """Provide the AutoGen message fields consumed by WorldEngine."""

    def __init__(self, content: str, source: str = "agent"):
        self.content = content
        self.source = source


class MockModelClient:
    """Return a deterministic AutoGen CreateResult without a real LLM."""

    model_info = {"function_calling": True, "vision": False, "json_output": True}

    def __init__(self, fixed_response: str | None = None):
        self._fixed = fixed_response
        self.call_count = 0

    async def create(self, messages, **kwargs):
        """Return one deterministic completion result."""
        from autogen_core.models import CreateResult, RequestUsage

        self.call_count += 1
        return CreateResult(
            finish_reason="stop",
            content=self._fixed or "这是一个模拟的 LLM 响应。",
            usage=RequestUsage(prompt_tokens=10, completion_tokens=5),
            cached=False,
        )


@pytest_asyncio.fixture
async def engine():
    """Create an in-memory SQLite engine for one test."""
    database = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with database.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    yield database
    await database.dispose()


@pytest_asyncio.fixture
async def db_session(engine):
    """Yield one async session bound to the in-memory database."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


def make_world():
    """Create a deterministic WorldResponse for tests."""
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
    """Create a LifeAgent with a deterministic Mock model client."""
    from engines.agent_factory.factory import LifeAgent
    from models.agent import Background, BigFive, DecisionStyle, Goal, Persona

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
