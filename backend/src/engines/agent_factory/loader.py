"""Shared execution-time Agent restoration for M9, M12 and Pipeline.

Real Agent IDs are always rebuilt from their persisted identity snapshot.  The
only ID allowed to resolve to a generic worker is ``worker-default``.  Memory is
intentionally not restored here: execution modules currently share identity,
not World memory/context.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import async_session
from engines.agent_factory.factory import AgentFactory, LifeAgent
from models.agent import Background, EmotionalState, Goal, Persona
from models.agent_orm import AgentRow


DEFAULT_WORKER_AGENT_ID = "worker-default"


class AgentResolutionError(ValueError):
    """Base error for an Agent ID that cannot be resolved for execution."""


class AgentNotFoundError(AgentResolutionError):
    """Raised when a real Agent ID no longer exists in persistent storage."""


class AgentRestoreError(AgentResolutionError):
    """Raised when a stored Agent snapshot is present but invalid."""


def _get_model_client(model_client=None):
    if model_client is not None:
        return model_client
    from llm.client import create_model_client

    return create_model_client()


def build_agent_from_row(row: AgentRow, *, model_client=None) -> LifeAgent:
    """Rebuild one LifeAgent from a persisted identity snapshot.

    This restores Persona, Background, Goals and basic dynamic state.  It does
    not query or inject Memory, so World memory remains isolated until the
    dedicated cross-module Memory integration is implemented.
    """
    try:
        data = row.to_dict()
        persona = Persona(**data["persona"])
        background = Background(**data["background"])
        goals = [Goal(**goal) for goal in data.get("goals", [])]
        emotional_state = EmotionalState(**(data.get("emotional_state") or {}))
    except Exception as exc:
        raise AgentRestoreError(
            f"Agent {row.id!r} 的持久化身份数据无效，无法恢复"
        ) from exc

    factory = AgentFactory(_get_model_client(model_client))
    agent = factory.create_from_persona(
        agent_id=row.id,
        persona=persona,
        background=background,
        goals=goals,
    )
    agent.emotional_state = emotional_state
    agent.energy = row.energy
    agent.created_at = row.created_at
    agent.updated_at = row.updated_at
    return agent


def build_default_worker(*, model_client=None) -> LifeAgent:
    """Build the one explicit generic Worker supported by execution modules."""
    factory = AgentFactory(_get_model_client(model_client))
    return factory.create_from_persona(
        agent_id=DEFAULT_WORKER_AGENT_ID,
        persona=Persona(
            name="Worker Agent",
            mbti="ISTJ",
            values=["效率", "准确", "交付"],
            narrative="内置的通用任务执行者，重视步骤、证据和可交付结果。",
        ),
        background=Background(
            education="通用任务执行训练",
            key_events=["作为未指定真实 Agent 时的显式默认执行者"],
        ),
        goals=[],
    )


async def _find_agent_row(agent_id: str, db: AsyncSession | None) -> AgentRow | None:
    statement = select(AgentRow).where(AgentRow.id == agent_id)
    if db is not None:
        result = await db.execute(statement)
        return result.scalar_one_or_none()

    async with async_session() as own_db:
        result = await own_db.execute(statement)
        return result.scalar_one_or_none()


async def validate_execution_agent_id(
    agent_id: str,
    *,
    db: AsyncSession | None = None,
) -> None:
    """Validate an execution Agent ID without constructing a model client."""
    normalized = (agent_id or "").strip()
    if not normalized:
        raise AgentNotFoundError("未指定 Agent ID")
    if normalized == DEFAULT_WORKER_AGENT_ID:
        return
    if await _find_agent_row(normalized, db) is None:
        raise AgentNotFoundError(f"Agent {normalized!r} 不存在或已被删除")


async def load_agent_for_execution(
    agent_id: str,
    *,
    db: AsyncSession | None = None,
    model_client=None,
) -> LifeAgent:
    """Resolve an Agent for M9/M12/Pipeline without silent degradation."""
    normalized = (agent_id or "").strip()
    if not normalized:
        raise AgentNotFoundError("未指定 Agent ID")
    if normalized == DEFAULT_WORKER_AGENT_ID:
        return build_default_worker(model_client=model_client)

    row = await _find_agent_row(normalized, db)
    if row is None:
        raise AgentNotFoundError(f"Agent {normalized!r} 不存在或已被删除")
    return build_agent_from_row(row, model_client=model_client)
