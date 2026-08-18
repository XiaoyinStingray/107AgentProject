"""
SSE 桥接 — WorldEngine.tick_stream() → Server-Sent Events → 前端实时事件流。

Tick 约束体系（State 8 M3 重构）:
  - 解析 scenario.time_range 提取 tick 上限（如 "1-30" → 30）
  - 软约束（100%）：达到上限后注入收束上下文，催促 Agent 结束对话
  - 硬约束（200%）：达到 2x 上限后强制结束，发送 session_end
  - 软硬上限以 World.current_tick 为准，刷新或 SSE 重连不会重置
  - 空 tick 检测：连续 3 个无有意义事件的 tick 提前结束
  - 连续空 tick 上限：连续 3 个空 tick 视为对话枯竭，提前结束

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
# Tick 约束常量
# =============================================================================

# 有意义的事件类型——用于判定一个 tick 是否"空"
_MEANINGFUL_EVENT_TYPES = frozenset({
    "agent_message",
    "agent_action",
    "thought_stream",
    "relationship_change",
    "goal_update",
    "conflict_detected",
    "world_event",  # LLM 错误/超时也算产出——不算空 tick
})

# 软约束 = 场景 time_range 上限 × 1.0（100%）
# 硬约束 = 场景 time_range 上限 × 2.0（200%）
HARD_LIMIT_MULTIPLIER = 2.0

# 连续空 tick 上限——超过此数视为对话枯竭，提前结束
MAX_CONSECUTIVE_EMPTY_TICKS = 3

# 单人剧场固定 tick 数（无 time_range 时回退）
SOLO_DEFAULT_MAX_TICKS = 8


def _parse_tick_limit(time_range: str) -> int:
    """解析 time_range 字符串中的 tick 上限。

    Args:
        time_range: 如 "1-30"、"1-20"、"1-12"

    Returns:
        tick 上限（整数），解析失败返回 0
    """
    if not time_range or not isinstance(time_range, str):
        return 0
    try:
        parts = time_range.split("-")
        if len(parts) == 2:
            upper = int(parts[1].strip())
            if upper > 0:
                return upper
    except (ValueError, IndexError, AttributeError):
        pass
    return 0


def _has_meaningful_events(events: list[SimEvent]) -> bool:
    """判断一个 tick 是否包含有意义的事件。

    排除纯基础设施事件（tick_boundary/connected/paused/error/world_event 等）。
    """
    primary_events = [
        event
        for event in events
        if event.type in {
            "agent_message",
            "agent_action",
            "thought_stream",
            "world_event",
        }
    ]
    if primary_events:
        return any(
            not bool(event.data.get("dialogue_repeated"))
            for event in primary_events
        )
    return any(e.type in _MEANINGFUL_EVENT_TYPES for e in events)


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

    Tick 约束（State 8）:
      - 软约束：World.current_tick >= soft_limit → 注入 wind-down pressure
      - 硬约束：World.current_tick >= hard_limit → 强制结束
      - 全局 tick 来自持久化 World，SSE 重连不会重置上限
      - 连续空 tick：≥ MAX_CONSECUTIVE_EMPTY_TICKS → 对话枯竭，提前结束
    """
    name_map = {agent_id: agent.persona.name for agent_id, agent in engine.agents.items()}

    # ── 解析 tick 约束 ──
    # 单人模式：固定 8 tick（与旧行为一致），忽略 time_range
    if len(engine.agents) == 1:
        soft_limit = SOLO_DEFAULT_MAX_TICKS
        hard_limit = SOLO_DEFAULT_MAX_TICKS
    else:
        # 多人模式：从 time_range 解析上限，fallback 30/60
        scenario = getattr(engine.world, "scenario", None)
        time_range = getattr(scenario, "time_range", "") if scenario else ""
        parsed_limit = _parse_tick_limit(time_range)
        if parsed_limit > 0:
            soft_limit = parsed_limit
            hard_limit = max(soft_limit + 5, int(soft_limit * HARD_LIMIT_MULTIPLIER))
        else:
            soft_limit = 30
            hard_limit = 60

    logger.info(
        f"SSE tick constraints: world={world_id}, "
        f"soft={soft_limit}, hard={hard_limit}, agents={len(engine.agents)}"
    )

    yield _sse_event({
        "type": "connected",
        "world_id": world_id,
        "tick": engine.current_tick,
        "status": engine.world.status,
    })

    meaningful_ticks = 0     # 本次连接内的有效 tick，仅用于诊断日志
    total_ticks = 0          # 总 tick 数（含空 tick，用于日志）
    consecutive_empty = 0    # 连续空 tick 计数

    try:
        while engine.world.status not in ("finished", "idle"):
            # 连接去重检查
            if _active_connection_ids.get(world_id) != conn_id:
                logger.info(f"SSE: generator {conn_id[:8]} superseded for world {world_id}")
                break

            # 硬约束：强制结束
            if engine.current_tick >= hard_limit:
                logger.info(
                    f"SSE: hard limit reached for world {world_id} "
                    f"(world_tick={engine.current_tick}, hard_limit={hard_limit})"
                )
                engine.world.status = "finished"
                await _finish_engine_simulation(engine)
                from api.worlds import _sync_world_to_db
                await _sync_world_to_db(engine.world)
                yield _sse_event({
                    "type": "session_end",
                    "world_id": world_id,
                    "tick": engine.current_tick,
                    "reason": "hard_limit",
                })
                break

            # 连续空 tick 检查（仅多人剧场——单人模式有固定 8 tick 上限）
            if len(engine.agents) > 1 and consecutive_empty >= MAX_CONSECUTIVE_EMPTY_TICKS:
                logger.info(
                    f"SSE: conversation stalled for world {world_id} "
                    f"(consecutive_empty={consecutive_empty})"
                )
                engine.world.status = "finished"
                await _finish_engine_simulation(engine)
                from api.worlds import _sync_world_to_db
                await _sync_world_to_db(engine.world)
                yield _sse_event({
                    "type": "session_end",
                    "world_id": world_id,
                    "tick": engine.current_tick,
                    "reason": "conversation_stalled",
                })
                break

            # 暂停等待
            if engine.world.status == "paused":
                yield _sse_event({
                    "type": "paused",
                    "world_id": world_id,
                    "tick": engine.current_tick,
                })
                # 使用 Event 等待而非轮询 sleep
                pause_event = getattr(engine, "_pause_event", None)
                if pause_event is None:
                    engine._pause_event = asyncio.Event()
                    pause_event = engine._pause_event
                if pause_event is not None:
                    try:
                        await asyncio.wait_for(pause_event.wait(), timeout=1.0)
                    except asyncio.TimeoutError:
                        pass  # 每秒检查一次连接状态
                continue

            if engine.world.status == "running":
                # ── 设置 tick 压力级别 ──
                if engine.current_tick >= soft_limit:
                    engine.tick_pressure = 1  # 软约束：催促收束
                if engine.current_tick >= hard_limit - 3:
                    engine.tick_pressure = 2  # 硬约束临近：强制收束

                # ── 执行一个 tick ──
                tick_events: list[SimEvent] = []
                async for event in engine.tick_stream():
                    tick_events.append(event)
                    # 暂停时：tick_stream 内部已完成收尾（post_process + persist），
                    # 已生成的事件照常推送到前端，状态变更后的事件静默丢弃
                    if engine.world.status == "running":
                        d = _event_to_dict(event, name_map)
                        yield _sse_event(d)

                total_ticks += 1

                # ── 通用对话推进保护 ──
                # 重复表达先获得一轮重新规划机会；连续重复或连续自然告别则结束。
                assessment = None
                assess_progress = getattr(engine, "assess_dialogue_progress", None)
                if len(engine.agents) > 1 and callable(assess_progress):
                    assessment = assess_progress(tick_events)
                if assessment is not None and assessment.should_finish:
                    logger.info(
                        f"SSE: dialogue guard finished world {world_id} "
                        f"(reason={assessment.reason}, tick={engine.current_tick})"
                    )
                    engine.world.status = "finished"
                    await _finish_engine_simulation(engine)
                    from api.worlds import _sync_world_to_db
                    await _sync_world_to_db(engine.world)
                    yield _sse_event({
                        "type": "session_end",
                        "world_id": world_id,
                        "tick": engine.current_tick,
                        "reason": assessment.reason,
                    })
                    break

                # ── 空 tick 检测 ──
                # 单人模式：无事件也计数（固定上限控制节奏）
                # 多人模式：空 tick 不计入软/硬约束配额，但追踪连续空tick
                if len(engine.agents) == 1:
                    meaningful_ticks += 1
                    consecutive_empty = 0
                elif _has_meaningful_events(tick_events):
                    meaningful_ticks += 1
                    consecutive_empty = 0
                else:
                    consecutive_empty += 1
                    logger.debug(
                        f"SSE: empty tick for world {world_id} "
                        f"(total={total_ticks}, meaningful={meaningful_ticks}, "
                        f"consecutive_empty={consecutive_empty})"
                    )
                # 同步空 tick 计数到 engine——供 context builder 注入破冰提示
                engine.consecutive_empty_ticks = consecutive_empty

    except Exception as error:
        logger.exception(f"SSE stream error for world {world_id}: {error}")
        if engine.world.status == "running":
            engine.world.status = "paused"
            pause_event = getattr(engine, "_pause_event", None)
            if pause_event is not None:
                pause_event.clear()
            try:
                from api.worlds import _sync_world_to_db
                await _sync_world_to_db(engine.world)
            except Exception as sync_error:
                logger.error(
                    f"Failed to persist automatic pause for {world_id}: {sync_error}"
                )
        yield _sse_event({
            "type": "error",
            "message": f"运行异常，实验已自动暂停：{error}",
            "tick": engine.current_tick,
            "status": "paused",
        })
    finally:
        # 仅当本连接仍为活跃连接时才清理
        if _active_connection_ids.get(world_id) == conn_id:
            _active_connection_ids.pop(world_id, None)
        # 清理 pause Event——唤醒任何等待者
        _pe = getattr(engine, "_pause_event", None)
        if _pe is not None:
            _pe.set()
        logger.info(
            f"SSE: generator {conn_id[:8]} ended for world {world_id} "
            f"(meaningful_ticks={meaningful_ticks}, total_ticks={total_ticks})"
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


def _event_to_dict(event: SimEvent, name_map: dict | None = None) -> dict:
    """将 SimEvent 序列化为前端 SSEEvent 格式。

    字段映射（后端 → 前端）:
        source_agent_id → agent_id
        description → content（全类型统一）
        name_map 按 agent_id 查 → agent_name
    """
    name_map = name_map or {}
    agent_id = event.source_agent_id or ""

    # 注入事件（导演干预台）：来源显示为"world"
    is_injected = bool(event.data.get("injected")) if event.data else False
    display_name = "world" if is_injected else name_map.get(agent_id, agent_id)

    base = {
        "id": event.id,
        "world_id": event.world_id,
        "tick": event.tick,
        "type": event.type,
        "agent_id": agent_id,
        "agent_name": display_name,
        "content": event.description,
        "data": event.data,
    }

    # 按事件类型平铺业务字段
    if event.type == "agent_message":
        base["message"] = event.data.get("message", event.description) if event.data else event.description
        base["subtext"] = event.data.get("subtext", "") if event.data else ""
        base["tone"] = event.data.get("tone", "neutral") if event.data else "neutral"
        # 目标 Agent（用于前端显示）
        # 优先从 data.target_names 取（注入消息），否则从 target_agent_ids + name_map 取
        target_names = event.data.get("target_names", []) if event.data else []
        if target_names:
            base["target"] = target_names[0]
        elif event.target_agent_ids:
            # 非注入消息：从 name_map 获取目标 Agent 名称
            target_id = event.target_agent_ids[0]
            base["target"] = name_map.get(target_id, "")
        else:
            base["target"] = ""
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
