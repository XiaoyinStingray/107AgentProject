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

    async def event_generator():
        # 发送初始连接确认
        yield _sse_event({"type": "connected", "world_id": world_id, "tick": engine.current_tick})

        try:
            # 连续推流：while 循环驱动多个 tick，直到 World 暂停/结束或客户端断开
            while engine.world.status == "running":
                async for event in engine.tick_stream():
                    yield _sse_event(_event_to_dict(event))
                # tick_stream 结束一个 tick → 自动进入下一个 tick
        except Exception as e:
            logger.error(f"SSE stream error for world {world_id}: {e}")
            yield _sse_event({"type": "error", "message": str(e)})

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


def _event_to_dict(event: SimEvent) -> dict:
    """将 SimEvent 序列化为前端 SSEEvent 格式。

    字段映射（后端 → 前端）:
        source_agent_id → agent_id
        description → content（thought_stream）/ 保留 description（其他类型）
        data 中的业务字段平铺到顶层（phase, message, action 等）
    """
    base = {
        "id": event.id,
        "world_id": event.world_id,
        "tick": event.tick,
        "type": event.type,
        "agent_id": event.source_agent_id,
        "description": event.description,
        "data": event.data,
    }

    # 按事件类型平铺业务字段
    if event.type == "thought_stream":
        base["content"] = event.description
        base["phase"] = event.data.get("phase", "") if event.data else ""
    elif event.type == "agent_message":
        base["message"] = event.data.get("message", event.description) if event.data else event.description
        base["subtext"] = event.data.get("subtext", "") if event.data else ""
        base["tone"] = event.data.get("tone", "neutral") if event.data else "neutral"
    elif event.type == "agent_action":
        base["action"] = event.data.get("action", "") if event.data else ""
        base["target"] = event.data.get("target", "") if event.data else ""
        base["result"] = event.data.get("result", "") if event.data else ""

    return base
