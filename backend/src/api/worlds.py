"""
World 路由 — CRUD + 控制 API（SQLite 持久化版）。

路由:
    POST   /api/worlds             创建 World
    GET    /api/worlds             列出所有 World
    GET    /api/worlds/{id}        获取 World 详情
    POST   /api/worlds/{id}/start  启动模拟（后台）
    POST   /api/worlds/{id}/pause  暂停模拟
    POST   /api/worlds/{id}/inject 注入事件（M7 干预台）
    POST   /api/worlds/{id}/reset  重置模拟
    DELETE /api/worlds/{id}        删除 World
    GET    /api/worlds/{id}/events       查询历史事件
    GET    /api/worlds/{id}/relationships 关系网络快照
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import async_session, get_db
from api.sse import register_world as sse_register, reset_world as sse_reset, _active_worlds
from api.simulations import create_simulation, finish_simulation
from api.world_helpers import resolve_world_scenario
from engines.world.engine import WorldEngine
from models.agent import Persona, Background, Goal, EmotionalState
from models.agent_orm import AgentRow
from models.event import Event, SimEvent
from models.relationship import RelationshipSnapshotResponse
from models.world import WorldCreate, WorldResponse, Scenario
from models.world_control import WorldControlResponse
from models.world_orm import WorldRow

router = APIRouter(prefix="/api/worlds", tags=["worlds"])


# =============================================================================
# 辅助：从 DB 重建 LifeAgent（不调用 LLM）
# =============================================================================

async def _rebuild_agents_from_db(agent_ids: list[str]) -> list:
    """从 SQLite 加载 Agent 数据并重建 LifeAgent 实例列表。"""
    from api.agents import get_agent_factory

    factory = get_agent_factory()
    agents = []
    for aid in agent_ids:
        async with async_session() as session:
            result = await session.execute(select(AgentRow).where(AgentRow.id == aid))
            row = result.scalar_one_or_none()
        if not row:
            raise HTTPException(
                status_code=400,
                detail=f"Agent {aid!r} not found. Create agents first.",
            )
        data = row.to_dict()
        persona = Persona(**data["persona"])
        background = Background(**data["background"])
        goals = [Goal(**g) for g in data["goals"]]
        agent = factory.create_from_persona(
            agent_id=row.id, persona=persona, background=background, goals=goals,
        )
        agent.emotional_state = EmotionalState(**data["emotional_state"])
        agent.energy = row.energy
        agent.created_at = row.created_at
        agent.updated_at = row.updated_at
        agents.append(agent)

    if not agents:
        raise HTTPException(status_code=400, detail="World must have at least 1 agent")
    return agents


async def _build_world_engine(world: WorldResponse) -> WorldEngine:
    """从 DB 获取 Agent 实例，构建 WorldEngine。"""
    agents = await _rebuild_agents_from_db(world.agent_ids)
    session = async_session()
    return WorldEngine(world, agents, session)


async def _sync_world_to_db(world: WorldResponse) -> None:
    """将 WorldResponse 的当前状态同步回 SQLite。"""
    async with async_session() as session:
        result = await session.execute(select(WorldRow).where(WorldRow.id == world.id))
        row = result.scalar_one_or_none()
        if row:
            row.status = world.status
            row.current_tick = world.current_tick
            row.scenario_json = json.dumps(
                world.scenario.model_dump(), ensure_ascii=False
            )
            await session.commit()


# =============================================================================
# 路由
# =============================================================================


@router.post("", response_model=WorldResponse, status_code=201)
async def create_world(
    req: WorldCreate,
    db: AsyncSession = Depends(get_db),
):
    """创建 World，持久化到 SQLite。"""
    # 数量上限检查
    count_result = await db.execute(select(func.count()).select_from(WorldRow))
    existing = count_result.scalar()
    if existing >= settings.max_worlds:
        raise HTTPException(
            status_code=400,
            detail=f"World 数量已达上限 ({existing}/{settings.max_worlds})",
        )

    scenario = resolve_world_scenario(req.scenario)

    world = WorldResponse(
        id=str(uuid.uuid4()),
        name=req.name,
        scenario=scenario,
        agent_ids=req.agent_ids,
        current_tick=0,
        status="idle",
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    row = WorldRow.from_response(world.model_dump())
    db.add(row)
    await db.commit()
    return world


@router.get("", response_model=list[WorldResponse])
async def list_worlds(db: AsyncSession = Depends(get_db)):
    """从 SQLite 列出所有 World。"""
    result = await db.execute(select(WorldRow).order_by(WorldRow.created_at.desc()))
    rows = result.scalars().all()
    return [WorldResponse(**row.to_dict()) for row in rows]


@router.get("/{world_id}", response_model=WorldResponse)
async def get_world(
    world_id: str,
    db: AsyncSession = Depends(get_db),
):
    """从 SQLite 获取 World 详情。"""
    result = await db.execute(select(WorldRow).where(WorldRow.id == world_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")
    return WorldResponse(**row.to_dict())


@router.post("/{world_id}/start", response_model=WorldControlResponse)
async def start_world(
    world_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """启动模拟——在后台运行 WorldEngine.tick_stream()。"""
    result = await db.execute(select(WorldRow).where(WorldRow.id == world_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    world = WorldResponse(**row.to_dict())

    if world.status == "running":
        raise HTTPException(status_code=409, detail="World is already running")

    # paused → running（恢复）
    if world.status == "paused":
        world.status = "running"
        await _sync_world_to_db(world)
        return {"status": "resumed", "world_id": world_id}

    engine = await _build_world_engine(world)
    simulation = create_simulation(world_id)
    engine.simulation_id = simulation.id
    world.status = "running"
    await _sync_world_to_db(world)

    # 注册到 SSE 端点可见
    sse_register(world_id, engine)

    return {"status": "started", "world_id": world_id}


@router.post("/{world_id}/pause", response_model=WorldControlResponse)
async def pause_world(
    world_id: str,
    db: AsyncSession = Depends(get_db),
):
    """暂停模拟，同步状态到 SQLite。"""
    result = await db.execute(select(WorldRow).where(WorldRow.id == world_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    world = WorldResponse(**row.to_dict())
    world.status = "paused"
    await _sync_world_to_db(world)
    return {"status": "paused", "world_id": world_id}


@router.post("/{world_id}/inject")
async def inject_event(
    world_id: str,
    event: dict,
    db: AsyncSession = Depends(get_db),
):
    """注入事件（M7 干预台）——用户可随时向运行中的世界插入事件。"""
    from api.sse import get_world_engine

    result = await db.execute(select(WorldRow).where(WorldRow.id == world_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    try:
        engine = get_world_engine(world_id)
    except HTTPException:
        raise HTTPException(
            status_code=400,
            detail=f"World {world_id!r} is not running. Start it first.",
        )

    engine.inject_event(event.get("description", str(event)))
    return {"status": "injected"}


@router.delete("/{world_id}", status_code=204)
async def delete_world(
    world_id: str,
    db: AsyncSession = Depends(get_db),
):
    """删除 World——清理活跃引擎、结束 simulation、从 SQLite 移除。"""
    result = await db.execute(select(WorldRow).where(WorldRow.id == world_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    # 清理 SSE 引擎
    engine = _active_worlds.get(world_id)
    if engine:
        if engine.simulation_id:
            finish_simulation(engine.simulation_id, engine.current_tick)
        sse_reset(world_id)

    # 从 SQLite 移除
    await db.execute(delete(WorldRow).where(WorldRow.id == world_id))
    await db.commit()
    return None


@router.post("/{world_id}/reset", response_model=WorldControlResponse)
async def reset_world_endpoint(
    world_id: str,
    db: AsyncSession = Depends(get_db),
):
    """重置模拟——停止引擎、标记 idle，同步到 SQLite。"""
    result = await db.execute(select(WorldRow).where(WorldRow.id == world_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    world = WorldResponse(**row.to_dict())

    engine = _active_worlds.get(world_id)
    if engine and engine.simulation_id:
        finish_simulation(engine.simulation_id, engine.current_tick)

    # 取消注册引擎 + 标记 idle
    sse_reset(world_id)
    world.status = "idle"
    world.current_tick = 0
    await _sync_world_to_db(world)
    return {"status": "reset", "world_id": world_id}


# =============================================================================
# 事件查询 + 关系快照
# =============================================================================


@router.get("/{world_id}/events", response_model=list[SimEvent])
async def get_world_events(
    world_id: str,
    tick_from: int = 0,
    tick_to: int | None = None,
    type: str | None = None,
):
    """查询指定世界的历史事件（从 SQLite events 表）。"""
    stmt = (
        select(Event)
        .where(Event.world_id == world_id)
        .where(Event.tick >= tick_from)
        .order_by(Event.tick, Event.created_at)
    )
    if tick_to is not None:
        stmt = stmt.where(Event.tick <= tick_to)
    if type is not None:
        stmt = stmt.where(Event.type == type)

    async with async_session() as session:
        result = await session.execute(stmt)
        orm_events = result.scalars().all()

    return [e.to_response() for e in orm_events]


@router.get(
    "/{world_id}/relationships",
    response_model=RelationshipSnapshotResponse,
)
async def get_world_relationships(world_id: str):
    """获取当前世界的关系网络快照——供前端 RelationshipGraph 首次加载。"""
    engine = _active_worlds.get(world_id)
    if engine is None:
        return {"nodes": [], "edges": []}

    relationships = getattr(engine, "relationships", {})
    agent_names: dict[str, str] = {}
    for agent in engine.agents.values():
        agent_names[agent.id] = agent.persona.name or agent.id

    nodes = [{"id": aid, "name": name} for aid, name in agent_names.items()]
    edges = [
        {"source": src, "target": dst, "score": round(score, 2)}
        for (src, dst), score in relationships.items()
    ]

    return {"nodes": nodes, "edges": edges}
