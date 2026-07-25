"""
SSE 桥接 — WorldEngine.tick_stream() → Server-Sent Events → 前端实时事件流。

用法（Phase 5 挂载到 FastAPI router）:
    from api.sse import sse_router
    app.include_router(sse_router)

前端:
    const es = new EventSource("/api/worlds/{world_id}/stream")
    es.onmessage = (e) => { const event = JSON.parse(e.data); ... }
"""

import asyncio
import json
from collections.abc import AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from loguru import logger

from engines.world.engine import WorldEngine
from models.event import SimEvent

sse_router = APIRouter(prefix="/api/worlds", tags=["sse"])

# =============================================================================
# 内存 World 注册表（Phase 5 替换为 DB-backed）
# =============================================================================

_active_worlds: dict[str, WorldEngine] = {}
_active_connection_ids: dict[str, str] = {}  # 跟踪最新 SSE 连接 ID，防重复 generator


def register_world(world_id: str, engine: WorldEngine):
    """注册活跃的 World。"""
    _active_worlds[world_id] = engine


def unregister_world(world_id: str):
    """移除 World。"""
    _active_worlds.pop(world_id, None)


def reset_world(world_id: str):
    """重置 World——取消注册引擎 + 标记状态为 idle。

    由 worlds.py 的 POST /{id}/reset 端点调用。
    """
    engine = _active_worlds.pop(world_id, None)
    if engine:
        engine.world.status = "idle"
        logger.info(f"World {world_id} reset (engine unregistered)")


def get_world_engine(world_id: str) -> WorldEngine:
    """按 ID 获取 WorldEngine 实例。"""
    engine = _active_worlds.get(world_id)
    if not engine:
        raise HTTPException(status_code=404, detail=f"World {world_id!r} not active")
    return engine


# =============================================================================
# SSE 端点
# =============================================================================


@sse_router.get("/{world_id}/stream")
async def stream_world(world_id: str):
    """SSE 端点——前端 EventSource 连接此 URL，实时接收模拟事件。

    每轮 Agent 发言作为一个 SSE 事件推送。tick 结束时发送 tick_boundary。
    连接断开后 EventSource 自动重连。
    新连接到达时旧 generator 检测到 conn_id 不匹配后自动退出。
    服务重启后自动从 DB 重建 engine。
    """
    import uuid as _uuid

    try:
        engine = get_world_engine(world_id)
    except HTTPException:
        # 服务重启后 _active_worlds 为空——从 DB 自动重建 engine
        from api.worlds import _build_world_engine  # lazy import 防循环依赖
        from db import async_session as _async_session
        from models.world_orm import WorldRow
        from models.world import WorldResponse
        from sqlalchemy import select as _select

        async with _async_session() as session:
            result = await session.execute(
                _select(WorldRow).where(WorldRow.id == world_id)
            )
            row = result.scalar_one_or_none()
            if not row:
                raise
            world_data = WorldResponse(**row.to_dict())

        engine = await _build_world_engine(world_data)
        engine.current_tick = world_data.current_tick
        # 恢复 simulation_id——服务器重启后引擎重建，需从 DB 找回活跃的 simulation 记录
        try:
            from models.simulation_orm import SimulationRow
            async with _async_session() as s:
                sim_result = await s.execute(
                    _select(SimulationRow)
                    .where(SimulationRow.world_id == world_id)
                    .where(SimulationRow.status == "running")
                    .order_by(SimulationRow.started_at.desc())
                    .limit(1)
                )
                sim_row = sim_result.scalar_one_or_none()
                if sim_row:
                    engine.simulation_id = sim_row.id
        except Exception:
            pass  # 没有找到也不阻塞 SSE 连接
        register_world(world_id, engine)
        logger.info(
            f"SSE: engine auto-rebuilt for world {world_id} "
            f"(status={world_data.status}, tick={world_data.current_tick})"
        )

    conn_id = str(_uuid.uuid4())
    _active_connection_ids[world_id] = conn_id
    logger.info(f"SSE: new connection {conn_id[:8]} for world {world_id}")

    return StreamingResponse(
        _world_event_generator(world_id, engine, conn_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _world_event_generator(
    world_id: str,
    engine: WorldEngine,
    conn_id: str = "",
) -> AsyncGenerator[str, None]:
    """Yield a continuous SSE stream until the World becomes idle or finished.

    每次循环前检查 conn_id 是否仍为活跃连接——若不是则退出，
    防止 EventSource 重连后多个 generator 同时运行。
    connected 事件中包含 world.status，前端可用于校准暂停状态。
    """
    name_map = {agent_id: agent.persona.name for agent_id, agent in engine.agents.items()}
    yield _sse_event({
        "type": "connected",
        "world_id": world_id,
        "tick": engine.current_tick,
        "status": engine.world.status,  # 前端重连时校验 isPaused
    })
    max_ticks = 8 if len(engine.agents) == 1 else 0
    tick_count = 0
    try:
        while engine.world.status not in ("finished", "idle"):
            if _active_connection_ids.get(world_id) != conn_id:
                logger.info(f"SSE: generator {conn_id[:8]} superseded for world {world_id}")
                break
            if max_ticks and tick_count >= max_ticks:
                engine.world.status = "finished"
                await _finish_engine_simulation(engine)
                yield _sse_event({
                    "type": "session_end",
                    "world_id": world_id,
                    "tick": engine.current_tick,
                })
                break
            if engine.world.status == "running":
                async for event in engine.tick_stream():
                    # 若中途被暂停，不再向前端推送事件（tick 在后台静默完成）
                    if engine.world.status != "running":
                        continue
                    yield _sse_event(_event_to_dict(event, name_map))
                tick_count += 1
            elif engine.world.status == "paused":
                yield _sse_event({
                    "type": "paused",
                    "world_id": world_id,
                    "tick": engine.current_tick,
                })
                await asyncio.sleep(1)
    except Exception as error:
        logger.error(f"SSE stream error for world {world_id}: {error}")
        yield _sse_event({
            "type": "error",
            "message": str(error),
            "tick": engine.current_tick,
        })
    finally:
        # 仅当本连接仍为活跃连接时才清理
        if _active_connection_ids.get(world_id) == conn_id:
            _active_connection_ids.pop(world_id, None)


# =============================================================================
# 辅助函数
# =============================================================================


def _sse_event(data: dict) -> str:
    """构建一条 SSE 格式的消息。

    统一走默认 message 通道（无 event: 前缀），type 包含在 JSON data 中。
    前端 EventSource.onmessage 可以直接接收所有事件。

    格式:
        data: {json}

        （空行表示一条消息结束）
    """
    payload = json.dumps(data, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _event_to_dict(event: SimEvent, name_map: dict | None = None) -> dict:
    """将 SimEvent 序列化为前端 SSEEvent 格式。

    字段映射（后端 → 前端）:
        source_agent_id → agent_id
        description → content（全类型统一）
        name_map 按 agent_id 查 → agent_name
    """
    name_map = name_map or {}
    agent_id = event.source_agent_id or ""

    base = {
        "id": event.id,
        "world_id": event.world_id,
        "tick": event.tick,
        "type": event.type,
        "agent_id": agent_id,
        "agent_name": name_map.get(agent_id, agent_id),
        "content": event.description,
        "data": event.data,
    }

    # 按事件类型平铺业务字段
    if event.type == "agent_message":
        base["message"] = event.data.get("message", event.description) if event.data else event.description
        base["subtext"] = event.data.get("subtext", "") if event.data else ""
        base["tone"] = event.data.get("tone", "neutral") if event.data else "neutral"
    elif event.type == "agent_action":
        base["action"] = event.data.get("action", "") if event.data else ""
        base["target"] = event.data.get("target", "") if event.data else ""

    return base


async def _finish_engine_simulation(engine: WorldEngine) -> None:
    """Finish the simulation record associated with an exhausted stream."""
    if not engine.simulation_id:
        return
    from api.simulations import finish_simulation

    await finish_simulation(engine.simulation_id, engine.current_tick)
    engine.simulation_id = None
