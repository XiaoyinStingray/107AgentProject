"""
World 路由 — CRUD + 控制 API。

路由:
    POST   /api/worlds             创建 World
    GET    /api/worlds             列出所有 World
    GET    /api/worlds/{id}        获取 World 详情
    POST   /api/worlds/{id}/start  启动模拟（后台）
    POST   /api/worlds/{id}/pause  暂停模拟
    POST   /api/worlds/{id}/inject 注入事件（M7 干预台）
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from sqlalchemy import select

from db import async_session
from api.agents import AgentStore, get_agent_store
from api.sse import register_world as sse_register, reset_world as sse_reset, _active_worlds
from engines.world.engine import WorldEngine
from engines.world.scenarios import get_scenario_by_name
from models.event import Event, SimEvent
from models.world import Scenario, WorldCreate, WorldResponse

router = APIRouter(prefix="/api/worlds", tags=["worlds"])


# =============================================================================
# 内存 World 存储（P0）
# =============================================================================

class WorldStore:
    def __init__(self):
        self._worlds: dict[str, WorldResponse] = {}

    def save(self, world: WorldResponse):
        self._worlds[world.id] = world

    def list_all(self) -> list[WorldResponse]:
        return list(self._worlds.values())

    def get(self, world_id: str) -> WorldResponse | None:
        return self._worlds.get(world_id)


_world_store = WorldStore()


def get_world_store() -> WorldStore:
    return _world_store


# =============================================================================
# 辅助：从 WorldCreate + AgentStore → WorldEngine
# =============================================================================

async def _build_world_engine(
    world: WorldResponse,
    agent_store: AgentStore,
) -> WorldEngine:
    """从存储中获取 Agent 实例，构建 WorldEngine。"""
    from engines.agent_factory.factory import LifeAgent
    from db import async_session

    # 从 AgentStore 中查找所有引用的 Agent
    agents: list[LifeAgent] = []
    for aid in world.agent_ids:
        agent = agent_store.get(aid)
        if not agent:
            raise HTTPException(
                status_code=400,
                detail=f"Agent {aid!r} not found. Create agents first.",
            )
        agents.append(agent)

    if not agents:
        raise HTTPException(status_code=400, detail="World must have at least 1 agent")

    # 获取 DB session（WorldEngine 持有 session，生命周期由 engine 管理）
    session = async_session()
    return WorldEngine(world, agents, session)


# =============================================================================
# 路由
# =============================================================================


@router.post("", response_model=WorldResponse, status_code=201)
async def create_world(
    req: WorldCreate,
    store: WorldStore = Depends(get_world_store),
    agent_store: AgentStore = Depends(get_agent_store),
):
    """创建 World。如果 scenario 为空，使用第一个内置场景。"""
    scenario = req.scenario
    if not scenario.name:
        scenario = get_scenario_by_name("新生报到") or Scenario(name="默认场景")

    world = WorldResponse(
        id=str(uuid.uuid4()),
        name=req.name,
        scenario=scenario,
        agent_ids=req.agent_ids,
        current_tick=0,
        status="idle",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    store.save(world)
    return world


@router.get("", response_model=list[WorldResponse])
async def list_worlds(store: WorldStore = Depends(get_world_store)):
    return store.list_all()


@router.get("/{world_id}", response_model=WorldResponse)
async def get_world(
    world_id: str,
    store: WorldStore = Depends(get_world_store),
):
    world = store.get(world_id)
    if not world:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")
    return world


@router.post("/{world_id}/start")
async def start_world(
    world_id: str,
    background_tasks: BackgroundTasks,
    store: WorldStore = Depends(get_world_store),
    agent_store: AgentStore = Depends(get_agent_store),
):
    """启动模拟——在后台运行 WorldEngine.tick_stream()。"""
    world = store.get(world_id)
    if not world:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    if world.status == "running":
        raise HTTPException(status_code=409, detail="World is already running")

    # paused → running（恢复），直接改状态让 SSE 循环继续
    if world.status == "paused":
        world.status = "running"
        return {"status": "resumed", "world_id": world_id}

    engine = await _build_world_engine(world, agent_store)
    world.status = "running"

    # 注册到 SSE 端点可见
    sse_register(world_id, engine)

    # 后台启动——第一个 tick 由 SSE 流驱动（前端连接时触发）
    # background_tasks 仅用于非流式的 batch 模式
    return {"status": "started", "world_id": world_id}


@router.post("/{world_id}/pause")
async def pause_world(
    world_id: str,
    store: WorldStore = Depends(get_world_store),
):
    world = store.get(world_id)
    if not world:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    world.status = "paused"
    return {"status": "paused"}


@router.post("/{world_id}/inject")
async def inject_event(
    world_id: str,
    event: dict,
    store: WorldStore = Depends(get_world_store),
):
    """注入事件（M7 干预台）——用户可随时向运行中的世界插入事件。"""
    from api.sse import get_world_engine

    world = store.get(world_id)
    if not world:
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


@router.post("/{world_id}/reset")
async def reset_world_endpoint(
    world_id: str,
    store: WorldStore = Depends(get_world_store),
):
    """重置模拟——停止引擎、标记 idle，前端可重新开始。"""
    world = store.get(world_id)
    if not world:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not found")

    # 取消注册引擎 + 标记 idle
    sse_reset(world_id)
    world.status = "idle"
    world.current_tick = 0
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


@router.get("/{world_id}/relationships")
async def get_world_relationships(world_id: str):
    """获取当前世界的关系网络快照——供前端 RelationshipGraph 首次加载。"""
    engine = _active_worlds.get(world_id)
    if engine is None:
        return {"nodes": [], "edges": []}

    relationships = getattr(engine, "relationships", {})
    # relationships: dict[tuple[str, str], float] → nodes + edges
    agent_names: dict[str, str] = {}
    for agent in engine.agents.values():
        agent_names[agent.id] = agent.persona.name or agent.id

    nodes = [{"id": aid, "name": name} for aid, name in agent_names.items()]
    edges = [
        {"source": src, "target": dst, "score": round(score, 2)}
        for (src, dst), score in relationships.items()
    ]

    return {"nodes": nodes, "edges": edges}
