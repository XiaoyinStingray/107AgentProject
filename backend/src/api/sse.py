"""
SSE 桥接 — WorldEngine.tick_stream() → Server-Sent Events → 前端实时事件流。

用法（Phase 5 挂载到 FastAPI router）:
    from api.sse import sse_router
    app.include_router(sse_router)

前端:
    const es = new EventSource("/api/worlds/{world_id}/stream")
    es.onmessage = (e) => { const event = JSON.parse(e.data); ... }
"""

import json

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

    async def event_generator():
        # 发送初始连接确认
        yield _sse_event("connected", {"world_id": world_id, "tick": engine.current_tick})

        try:
            async for event in engine.tick_stream():
                yield _sse_event(event.type, _event_to_dict(event))
                # tick_boundary 后等待下一个 tick
                if event.type == "tick_boundary":
                    continue
        except Exception as e:
            logger.error(f"SSE stream error for world {world_id}: {e}")
            yield _sse_event("error", {"message": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# 辅助函数
# =============================================================================


def _sse_event(event_type: str, data: dict) -> str:
    """构建一条 SSE 格式的消息。

    格式:
        event: {type}
        data: {json}

        （空行表示一条消息结束）
    """
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event_type}\ndata: {payload}\n\n"


def _event_to_dict(event: SimEvent) -> dict:
    """将 SimEvent 序列化为前端可消费的字典。"""
    return {
        "id": event.id,
        "world_id": event.world_id,
        "tick": event.tick,
        "type": event.type,
        "source_agent_id": event.source_agent_id,
        "target_agent_ids": event.target_agent_ids,
        "description": event.description,
        "data": event.data,
        "created_at": event.created_at,
    }
