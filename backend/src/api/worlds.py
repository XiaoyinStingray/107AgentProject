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
from loguru import logger
from sqlalchemy import func, or_, select, delete
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
    """从 SQLite 批量加载 Agent 数据并重建 LifeAgent 实例列表。"""
    from api.agents import get_agent_factory

    factory = get_agent_factory()

    # 批量查询所有 Agent（单次 SQL 代替 N 次单独查询）
    async with async_session() as session:
        result = await session.execute(
            select(AgentRow).where(AgentRow.id.in_(agent_ids))
        )
        rows = result.scalars().all()

    row_map = {row.id: row for row in rows}
    missing_ids = [aid for aid in agent_ids if aid not in row_map]
    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Agents not found: {missing_ids}. Create agents first.",
        )

    agents = []
    for aid in agent_ids:
        row = row_map[aid]
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
        # State 4 Step 78: 恢复私有笔记
        notes_raw = data.get("notes_json", "[]")
        if isinstance(notes_raw, str):
            try:
                agent._notes = json.loads(notes_raw)
            except (json.JSONDecodeError, TypeError):
                agent._notes = []
        elif isinstance(notes_raw, list):
            agent._notes = notes_raw
        agents.append(agent)

    if not agents:
        raise HTTPException(status_code=400, detail="World must have at least 1 agent")
    return agents


async def _build_world_engine(world: WorldResponse) -> WorldEngine:
    """从 DB 获取 Agent 实例，构建 WorldEngine。"""
    from llm.client import create_model_client

    agents = await _rebuild_agents_from_db(world.agent_ids)
    session = async_session()
    try:
        return WorldEngine(
            world,
            agents,
            session,
            act_model_client=create_model_client("act"),
        )
    except Exception:
        await session.close()
        raise


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


async def _restore_simulation_id(
    engine, world_id: str, db: AsyncSession
) -> None:
    """引擎重建后从 DB 找回活跃的 simulation_id，使 finish 能正确写记录。"""
    if engine.simulation_id:
        return
    from models.simulation_orm import SimulationRow
    result = await db.execute(
        select(SimulationRow)
        .where(SimulationRow.world_id == world_id)
        .where(SimulationRow.status == "running")
        .order_by(SimulationRow.started_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row:
        engine.simulation_id = row.id


async def _sync_agent_goals_to_db(world_id: str) -> None:
    """将 WorldEngine 中 Agent 的 goal 状态回写到 agents 表。"""
    from api.sse import get_world_engine
    from models.agent_orm import AgentRow

    try:
        engine = get_world_engine(world_id)
    except Exception:
        return  # 引擎不存在或已销毁，无需同步

    async with async_session() as session:
        # 批量查询所有 Agent（单次 SQL 代替 N 次单独查询）
        result = await session.execute(
            select(AgentRow).where(AgentRow.id.in_(list(engine.agents.keys())))
        )
        rows_by_id = {row.id: row for row in result.scalars().all()}
        for aid, agent in engine.agents.items():
            row = rows_by_id.get(aid)
            if not row:
                continue
            goals = []
            if hasattr(agent, "goals"):
                for g in agent.goals:
                    goals.append({
                        "id": g.id,
                        "description": g.description,
                        "priority": g.priority,
                        "deadline": g.deadline,
                        "status": g.status,
                        "progress": g.progress,
                    })
            row.goals_json = json.dumps(goals, ensure_ascii=False)
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
    existing = count_result.scalar() or 0
    if existing >= settings.max_worlds:
        raise HTTPException(
            status_code=400,
            detail=f"World 数量已达上限 ({existing}/{settings.max_worlds})",
        )

    scenario = resolve_world_scenario(req.scenario)

    world = WorldResponse(
        id=str(uuid.uuid4()),
        name=req.name,
        world_type=req.world_type,
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
        if world_id not in _active_worlds:
            engine = await _build_world_engine(world)
            engine.world.status = "running"
            engine.current_tick = world.current_tick
            await _restore_simulation_id(engine, world_id, db)
            sse_register(world_id, engine)
            logger.info(f"World {world_id} engine rebuilt (was running in DB, tick={world.current_tick})")
        # 已经在跑——确认即可，不报错
        return {"status": "running", "world_id": world_id}

    # paused → running（恢复）
    if world.status == "paused":
        engine = _active_worlds.get(world_id)
        if engine:
            engine.world.status = "running"
            # 唤醒 SSE generator 的 pause 等待
            _pe = getattr(engine, "_pause_event", None)
            if _pe is not None:
                _pe.set()
        else:
            engine = await _build_world_engine(world)
            engine.world.status = "running"
            engine.current_tick = world.current_tick
            await _restore_simulation_id(engine, world_id, db)
            sse_register(world_id, engine)
            logger.info(f"World {world_id} engine rebuilt after restart (was paused, tick={world.current_tick})")
        world.status = "running"
        await _sync_world_to_db(world)
        return {"status": "resumed", "world_id": world_id}

    engine = await _build_world_engine(world)
    simulation = await create_simulation(world_id)
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
    engine = _active_worlds.get(world_id)
    if engine:
        engine.world.status = "paused"
        # 同步运行时 tick 到 DB（运行时 engine 持有权威时钟）
        world.current_tick = engine.current_tick
        # 清除 pause Event——SSE generator 检查 status 后会进入等待
        if hasattr(engine, "_pause_event") and engine._pause_event is not None:
            engine._pause_event.clear()
        # 取消群组 LLM token 使暂停即时生效（不等 LLM 跑完）
        token = getattr(engine, "_group_cancel_token", None)
        if token:
            token.cancel()
    world.status = "paused"
    await _sync_world_to_db(world)
    return {"status": "paused", "world_id": world_id}


@router.post("/{world_id}/finish", response_model=WorldControlResponse)
async def finish_world(
    world_id: str,
    db: AsyncSession = Depends(get_db),
):
    """结束模拟——停止引擎、标记 finished、结束 simulation 记录。
    与 reset 的区别：保留 tick 和事件数据，不清零。"""
    result = await db.execute(select(WorldRow).where(WorldRow.id == world_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    world = WorldResponse(**row.to_dict())
    engine = _active_worlds.get(world_id)

    if engine:
        # Do not overwrite the final runtime tick with the stale value loaded
        # from WorldRow.  The engine clock advances in memory during SSE.
        world.current_tick = engine.current_tick
        engine.world.current_tick = engine.current_tick
        if engine.simulation_id:
            await finish_simulation(engine.simulation_id, engine.current_tick)

    # 同步 goal 状态
    await _sync_agent_goals_to_db(world_id)

    # 停止 SSE 引擎
    sse_reset(world_id)
    # 关闭引擎持有的 DB session，防止泄漏
    if engine is not None:
        _db_session = getattr(engine, "_db", None)
        if _db_session is not None:
            try:
                await _db_session.close()
            except Exception:
                pass

    world.status = "finished"
    await _sync_world_to_db(world)
    return {"status": "finished", "world_id": world_id}


async def _resolve_agent_name(db: AsyncSession, agent_id: str) -> str | None:
    """查询 Agent 的显示名称（人格名 > 数据库名 > ID 前缀）。"""
    from models.agent_orm import AgentRow as _AgentRow
    result = await db.execute(
        select(_AgentRow).where(_AgentRow.id == agent_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        return None
    try:
        persona = json.loads(row.persona_json)
        return persona.get("name", "") or row.name or agent_id[:8]
    except Exception:
        return row.name or agent_id[:8]


@router.post("/{world_id}/inject")
async def inject_event(
    world_id: str,
    event: dict,
    db: AsyncSession = Depends(get_db),
):
    """注入事件（M7 干预台）——用户可随时向运行中的世界插入事件。
    同时持久化到 interventions 表，供干预历史查询。"""
    from api.sse import get_world_engine
    from models.intervention_orm import InterventionRow

    result = await db.execute(select(WorldRow).where(WorldRow.id == world_id))
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    world = WorldResponse(**row.to_dict())

    try:
        engine = get_world_engine(world_id)
    except HTTPException:
        # 服务重启后 _active_worlds 为空——若 DB 状态为 paused/running 则重建
        if world.status in ("running", "paused"):
            engine = await _build_world_engine(world)
            engine.world.status = world.status
            engine.current_tick = world.current_tick
            sse_register(world_id, engine)
            logger.info(f"Inject: engine rebuilt after restart for world {world_id}")
        else:
            raise HTTPException(
                status_code=400,
                detail=f"World {world_id!r} is {world.status}. Start it first.",
            )

    if engine.world.status not in ("running", "paused"):
        raise HTTPException(
            status_code=400,
            detail=f"World {world_id!r} is {engine.world.status}. "
                   f"只能在运行中或暂停的 World 中注入事件。",
        )

    description = event.get("description")
    injection_type = event.get("type", "world_event")
    target_agent_id = event.get("target_agent_id", None)
    target_agent_id_2 = event.get("target_agent_id_2", None)
    if not isinstance(description, str) or not description.strip():
        raise HTTPException(
            status_code=400,
            detail="Intervention description cannot be empty",
        )
    description = description.strip()
    allowed_types = {
        "world_event",
        "agent_message",
        "agent_action",
        "relationship_change",
    }
    if not isinstance(injection_type, str) or injection_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported intervention type: {injection_type!r}",
        )
    if target_agent_id is not None and not isinstance(target_agent_id, str):
        raise HTTPException(
            status_code=400,
            detail="target_agent_id must be a string or null",
        )
    if target_agent_id_2 is not None and not isinstance(target_agent_id_2, str):
        raise HTTPException(
            status_code=400,
            detail="target_agent_id_2 must be a string or null",
        )

    # 构建目标列表：relationship_change 包含两个 Agent
    target_ids = []
    if target_agent_id:
        target_ids.append(target_agent_id)
    if injection_type == "relationship_change" and target_agent_id_2:
        target_ids.append(target_agent_id_2)

    injected_event = engine.inject_event(
        description,
        event_type=injection_type,
        target_agent_ids=target_ids,
    )

    # 查询 target agent name(s)
    target_agent_name = None
    if target_agent_id:
        target_agent_name = await _resolve_agent_name(db, target_agent_id)
    if target_agent_id_2 and target_agent_name:
        name2 = await _resolve_agent_name(db, target_agent_id_2)
        if name2:
            target_agent_name = f"{target_agent_name} → {name2}"

    # 持久化干预记录
    intervention = InterventionRow(
        id=str(uuid.uuid4()),
        world_id=world_id,
        type=injection_type,
        target_agent_id=target_agent_id,
        description=description,
    )
    db.add(Event.from_sim_event(injected_event))
    db.add(intervention)
    await db.commit()

    return {
        "status": "injected",
        "intervention": {
            "id": intervention.id,
            "world_id": intervention.world_id,
            "type": intervention.type,
            "target_agent_id": intervention.target_agent_id,
            "target_agent_name": target_agent_name,
            "description": intervention.description,
            "created_at": intervention.created_at,
        },
    }


@router.get("/{world_id}/interventions")
async def get_world_interventions(
    world_id: str,
    db: AsyncSession = Depends(get_db),
):
    """查询指定世界的历史干预记录（M7 干预台）。"""
    from models.intervention_orm import InterventionRow
    from models.agent_orm import AgentRow

    result = await db.execute(
        select(InterventionRow)
        .where(InterventionRow.world_id == world_id)
        .order_by(InterventionRow.created_at.desc())
    )
    rows = result.scalars().all()

    # 批量查询 Agent 名称
    agent_names: dict[str, str] = {}
    unique_agent_ids = {r.target_agent_id for r in rows if r.target_agent_id}
    if unique_agent_ids:
        agent_result = await db.execute(
            select(AgentRow.id, AgentRow.name, AgentRow.persona_json)
            .where(AgentRow.id.in_(unique_agent_ids))
        )
        for agent_row in agent_result.all():
            try:
                persona = json.loads(agent_row.persona_json)
                agent_names[agent_row.id] = persona.get("name", "") or agent_row.name or agent_row.id[:8]
            except Exception:
                agent_names[agent_row.id] = agent_row.name or agent_row.id[:8]

    interventions = []
    for r in rows:
        d = r.to_dict()
        d["target_agent_name"] = agent_names.get(r.target_agent_id) if r.target_agent_id else None
        interventions.append(d)

    return interventions


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
            await finish_simulation(engine.simulation_id, engine.current_tick)
        sse_reset(world_id)
        # 关闭引擎持有的 DB session，防止泄漏
        _db_session = getattr(engine, "_db", None)
        if _db_session is not None:
            try:
                await _db_session.close()
            except Exception:
                pass

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
    if engine:
        await _restore_simulation_id(engine, world_id, db)
    if engine and engine.simulation_id:
        await finish_simulation(engine.simulation_id, engine.current_tick)

    # 先同步 goal 状态（引擎还在），再注销引擎
    await _sync_agent_goals_to_db(world_id)
    engine = _active_worlds.get(world_id)
    sse_reset(world_id)
    # 关闭引擎持有的 DB session，防止泄漏
    if engine is not None:
        _db_session = getattr(engine, "_db", None)
        if _db_session is not None:
            try:
                await _db_session.close()
            except Exception:
                pass
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
    event_type: str | None = None,
    agent_id: str | None = None,
):
    """查询指定世界的历史事件（从 SQLite events 表）。每个事件附带 agent_name。"""
    stmt = (
        select(Event)
        .where(Event.world_id == world_id)
        .where(Event.tick >= tick_from)
        .order_by(Event.tick, Event.created_at)
    )
    if tick_to is not None:
        stmt = stmt.where(Event.tick <= tick_to)
    if event_type is not None:
        stmt = stmt.where(Event.type == event_type)
    if agent_id is not None:
        stmt = stmt.where(Event.source_agent_id == agent_id)

    async with async_session() as session:
        result = await session.execute(stmt)
        orm_events = result.scalars().all()

    # 批量查询 Agent 名称映射
    agent_names: dict[str, str] = {}
    unique_agent_ids = {e.source_agent_id for e in orm_events if e.source_agent_id}
    if unique_agent_ids:
        from models.agent_orm import AgentRow
        async with async_session() as session:
            agent_result = await session.execute(
                select(AgentRow.id, AgentRow.name, AgentRow.persona_json)
                .where(AgentRow.id.in_(unique_agent_ids))
            )
            for row in agent_result.all():
                try:
                    persona = json.loads(row.persona_json)
                    agent_names[row.id] = persona.get("name", "") or row.name or row.id[:8]
                except Exception:
                    agent_names[row.id] = row.name or row.id[:8]

    events = [e.to_response() for e in orm_events]
    # 注入 agent_name 到 data 中（不破坏 SimEvent 结构）
    for e in events:
        if e.source_agent_id and e.source_agent_id in agent_names:
            e.data["agent_name"] = agent_names[e.source_agent_id]
    return events


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
