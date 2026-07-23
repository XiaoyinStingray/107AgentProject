"""
Agent 路由 — CRUD API for LifeAgent（SQLite 持久化版）。

路由:
    POST   /api/agents        创建 Agent（自然语言描述）
    GET    /api/agents        列出所有 Agent
    GET    /api/agents/{id}   获取 Agent 详情
    DELETE /api/agents/{id}   删除 Agent
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from engines.agent_factory.factory import AgentFactory, LifeAgent
from models.agent import AgentCreate, AgentResponse, Persona, Background, Goal, EmotionalState
from models.agent_orm import AgentRow

router = APIRouter(prefix="/api/agents", tags=["agents"])


# =============================================================================
# FastAPI 依赖
# =============================================================================

_agent_factory: AgentFactory | None = None


def get_agent_factory() -> AgentFactory:
    """创建 AgentFactory（module-level singleton，避免重复建立 HTTP 连接池）。"""
    global _agent_factory
    if _agent_factory is None:
        from llm.client import create_model_client
        _agent_factory = AgentFactory(create_model_client())
    return _agent_factory


# =============================================================================
# 辅助函数
# =============================================================================

async def _rebuild_agent_from_row(row: AgentRow) -> LifeAgent:
    """从数据库行重建 LifeAgent 实例（不调用 LLM）。"""
    factory = get_agent_factory()
    persona = Persona(**row.to_dict()["persona"])
    background = Background(**row.to_dict()["background"])
    goals = [Goal(**g) for g in row.to_dict()["goals"]]
    agent = factory.create_from_persona(
        agent_id=row.id,
        persona=persona,
        background=background,
        goals=goals,
    )
    agent.emotional_state = EmotionalState(**row.to_dict()["emotional_state"])
    agent.energy = row.energy
    agent.created_at = row.created_at
    agent.updated_at = row.updated_at
    return agent


# =============================================================================
# 路由
# =============================================================================


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(
    req: AgentCreate,
    factory: AgentFactory = Depends(get_agent_factory),
    db: AsyncSession = Depends(get_db),
):
    """自然语言描述 → 完整 Agent，持久化到 SQLite。"""
    try:
        agent = await factory.create_from_description(req.description)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 持久化到 SQLite
    row = AgentRow.from_response(agent.to_response().model_dump())
    db.add(row)
    await db.commit()

    return agent.to_response()


@router.get("", response_model=list[AgentResponse])
async def list_agents(db: AsyncSession = Depends(get_db)):
    """从 SQLite 列出所有 Agent。"""
    result = await db.execute(select(AgentRow).order_by(AgentRow.created_at))
    rows = result.scalars().all()
    return [AgentResponse(**row.to_dict()) for row in rows]


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
):
    """从 SQLite 获取 Agent 详情。"""
    result = await db.execute(select(AgentRow).where(AgentRow.id == agent_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id!r} not found")
    return AgentResponse(**row.to_dict())


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
):
    """从 SQLite 删除 Agent。"""
    result = await db.execute(select(AgentRow).where(AgentRow.id == agent_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id!r} not found")
    await db.execute(delete(AgentRow).where(AgentRow.id == agent_id))
    await db.commit()
    return {"ok": True}
