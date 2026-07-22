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
    """
    engine = get_world_engine(world_id)
    return StreamingResponse(
        _world_event_generator(world_id, engine),
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
) -> AsyncGenerator[str, None]:
    """Yield a continuous SSE stream until the World becomes idle or finished."""
    name_map = {agent_id: agent.persona.name for agent_id, agent in engine.agents.items()}
    yield _sse_event({"type": "connected", "world_id": world_id, "tick": engine.current_tick})
    max_ticks = 8 if len(engine.agents) == 1 else 0
    tick_count = 0
    try:
        while engine.world.status not in ("finished", "idle"):
            if max_ticks and tick_count >= max_ticks:
                engine.world.status = "finished"
                _finish_engine_simulation(engine)
                yield _sse_event({
                    "type": "session_end",
                    "world_id": world_id,
                    "tick": engine.current_tick,
                })
                break
            if engine.world.status == "running":
                async for event in engine.tick_stream():
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


def _event_to_dict(event: SimEvent, name_map: dict = None) -> dict:
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


def _finish_engine_simulation(engine: WorldEngine) -> None:
    """Finish the simulation record associated with an exhausted stream."""
    if not engine.simulation_id:
        return
    from api.simulations import finish_simulation

    finish_simulation(engine.simulation_id, engine.current_tick)
    engine.simulation_id = None
