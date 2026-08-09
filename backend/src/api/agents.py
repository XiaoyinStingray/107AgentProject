"""
Agent 路由 — CRUD API for LifeAgent（SQLite 持久化版）。

路由:
    POST   /api/agents        创建 Agent（自然语言描述）
    GET    /api/agents        列出所有 Agent
    GET    /api/agents/{id}   获取 Agent 详情
    DELETE /api/agents/{id}   删除 Agent
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from loguru import logger

from config import settings
from db import get_db
from engines.agent_factory.factory import AgentFactory, LifeAgent
from engines.persona.remixer import (
    PersonaRemixer,
    RemixGenerationError,
    RemixNoChangesError,
)
from models.agent import AgentCreate, AgentResponse, Persona, Background, Goal, EmotionalState
from models.agent_orm import AgentRow
from models.remix import RemixDraft, RemixRequest, RemixResponse
from models.world_orm import WorldRow

router = APIRouter(prefix="/api/agents", tags=["agents"])


# =============================================================================
# FastAPI 依赖
# =============================================================================

_agent_factory: AgentFactory | None = None
_persona_remixer: PersonaRemixer | None = None


def get_agent_factory() -> AgentFactory:
    """创建 AgentFactory（module-level singleton，避免重复建立 HTTP 连接池）。"""
    global _agent_factory
    if _agent_factory is None:
        from llm.client import create_model_client
        _agent_factory = AgentFactory(create_model_client())
    return _agent_factory


def get_persona_remixer() -> PersonaRemixer:
    """复用 AgentFactory 的模型客户端创建 Remix 引擎。"""
    global _persona_remixer
    if _persona_remixer is None:
        _persona_remixer = PersonaRemixer(get_agent_factory().model_client)
    return _persona_remixer


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


def _draft_from_row(row: AgentRow) -> RemixDraft:
    """从持久化快照提取 Remix 所需的静态设定。"""
    data = row.to_dict()
    return RemixDraft(
        persona=Persona(**data["persona"]),
        background=Background(**data["background"]),
        goals=[Goal(**goal) for goal in data["goals"]],
    )


async def _ensure_agent_capacity(db: AsyncSession) -> None:
    """所有会创建 Agent 的入口共用数量上限检查。"""
    count_result = await db.execute(select(func.count()).select_from(AgentRow))
    existing = count_result.scalar() or 0
    if existing >= settings.max_agents:
        raise HTTPException(
            status_code=400,
            detail=f"Agent 数量已达上限 ({existing}/{settings.max_agents})",
        )


async def _ensure_unique_name(db: AsyncSession, name: str, factory) -> str:
    """BUG-M1-004 修复：检查并重名 Agent 重新取名。

    查询数据库中已有的 Agent 名称集合，若 name 已存在则
    调用 LLM 重新生成一个完全不同的名字。
    """
    result = await db.execute(select(AgentRow.name))
    existing_names = set(result.scalars().all())
    if name not in existing_names:
        return name
    # 重名——让 LLM 重新取名
    logger.info(f"Agent 重名检测: {name!r} 已存在，正在重新取名...")
    try:
        new_name = await factory.persona_builder.regenerate_name(list(existing_names))
        logger.info(f"Agent 重名检测: {name!r} → {new_name!r}")
        return new_name
    except Exception as e:
        logger.warning(f"重新取名失败，回退到序号模式: {e}")
        # 回退方案：追加序号
        suffix = 2
        while f"{name} ({suffix})" in existing_names:
            suffix += 1
        return f"{name} ({suffix})"


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
    await _ensure_agent_capacity(db)

    try:
        agent = await factory.create_from_description(req.description)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # BUG-M1-004：重名检测——让 LLM 重新取名
    unique_name = await _ensure_unique_name(db, agent.persona.name, factory)
    if unique_name != agent.persona.name:
        agent.persona.name = unique_name

    # 持久化到 SQLite
    response = agent.to_response()
    row = AgentRow.from_response(response.model_dump())
    db.add(row)
    await db.commit()

    return response


@router.post("/{agent_id}/remix", response_model=RemixResponse)
async def remix_agent(
    agent_id: str,
    req: RemixRequest,
    factory: AgentFactory = Depends(get_agent_factory),
    remixer: PersonaRemixer = Depends(get_persona_remixer),
    db: AsyncSession = Depends(get_db),
):
    """预览 Remix，或将已确认的草稿保存为全新 Agent。"""
    result = await db.execute(select(AgentRow).where(AgentRow.id == agent_id))
    source_row = result.scalar_one_or_none()
    if not source_row:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id!r} not found")

    source = _draft_from_row(source_row)
    if req.action == "preview":
        try:
            draft, changes, summary = await remixer.preview(source, req.spec)
        except RemixNoChangesError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        except RemixGenerationError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        return RemixResponse(
            status="preview",
            source_agent_id=agent_id,
            spec=req.spec,
            draft=draft,
            changes=changes,
            summary=summary,
        )

    await _ensure_agent_capacity(db)
    if req.draft is None:
        raise HTTPException(status_code=400, detail="finalize 操作需要提供 draft")
    try:
        draft, changes = remixer.finalize(source, req.draft, req.spec)
    except RemixNoChangesError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    agent = factory.create_from_persona(
        agent_id=str(uuid.uuid4()),
        persona=draft.persona,
        background=draft.background,
        goals=draft.goals,
    )
    # BUG-M1-004：Remix 创建同样需要重名检测
    unique_name = await _ensure_unique_name(db, agent.persona.name, factory)
    if unique_name != agent.persona.name:
        agent.persona.name = unique_name
    response = agent.to_response()
    db.add(AgentRow.from_response(response.model_dump()))
    await db.commit()
    return RemixResponse(
        status="created",
        source_agent_id=agent_id,
        spec=req.spec,
        draft=draft,
        changes=changes,
        summary="已按预览内容创建 Remix Agent",
        agent=response,
    )


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
    """从 SQLite 删除 Agent。被任何 World 引用时拒绝删除（409）。"""
    result = await db.execute(select(AgentRow).where(AgentRow.id == agent_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id!r} not found")

    # 引用检查：查询所有 agent_ids_json 包含此 ID 的 World
    ref_result = await db.execute(
        select(WorldRow).where(WorldRow.agent_ids_json.contains(agent_id))
    )
    refs = ref_result.scalars().all()
    if refs:
        names = [w.name for w in refs]
        raise HTTPException(
            status_code=409,
            detail=f"Agent 被 {len(refs)} 个 World 使用: {', '.join(names)}",
        )

    await db.execute(delete(AgentRow).where(AgentRow.id == agent_id))
    await db.commit()
    return {"ok": True}
