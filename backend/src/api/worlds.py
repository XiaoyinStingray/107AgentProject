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

from api.agents import AgentStore, get_agent_store
from api.sse import register_world as sse_register
from engines.world.engine import WorldEngine
from engines.world.scenarios import get_scenario_by_name
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


@router.post("/", response_model=WorldResponse, status_code=201)
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


@router.get("/", response_model=list[WorldResponse])
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
