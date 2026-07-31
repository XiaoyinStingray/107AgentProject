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
            if engine.world.status == "paused":
                # 暂停：不发送事件（前端已知 paused），静默等待恢复
                await asyncio.sleep(0.5)
                continue

            if engine.world.status == "running":
                tick_events = []  # 收集本 tick 的事件用于 PlanManager
                async for event in engine.tick_stream():
                    if engine.world.status != "running":
                        continue
                    d = _event_to_dict(event, name_map)
                    tick_events.append(d)
                    yield _sse_event(d)
                tick_count += 1
                # Team 模式：收集本 tick 的 AutoGen 消息，存为跨 tick 对话历史
                if hasattr(engine, "team_task") and engine.team_task:
                    from autogen_agentchat.messages import TextMessage
                    history = getattr(engine, "_team_chat_history", None) or []
                    for e in tick_events:
                        role = "assistant"
                        content = e.get("content", "") or e.get("message", "")
                        if content and len(content) > 5:
                            history.append(TextMessage(content=content, source=e.get("agent_name", "agent"), role=role))
                    engine._team_chat_history = history[-20:]  # 保留最近 20 条，防 token 爆炸

                # Team Plan 进度推进（Step 53）——LLM 协调器判定
                if hasattr(engine, "team_plan") and engine.team_plan:
                    plan = engine.team_plan
                    await plan.check_progress(tick_count, tick_events)

                    # 67: 调 team_engine.on_tick（辩论检测 + 角色演化）
                    debate_state = None
                    evolutions: list[dict] = []
                    extra_events: list[dict] = []
                    if hasattr(engine, "team_engine") and engine.team_engine:
                        if hasattr(engine.team_engine, "on_tick"):
                            extra_events = await engine.team_engine.on_tick(
                                tick_count, tick_events,
                            )
                        await engine.team_engine._sync_plan_to_db()
                        # 提取辩论+演化+重规划数据，嵌入 plan_updated
                        for ev in extra_events:
                            if ev.get("type") == "debate_update":
                                debate_state = ev.get("data")
                            elif ev.get("type") == "role_evolved":
                                evolutions = ev.get("data", {}).get("evolutions", [])
                            elif ev.get("type") == "plan_revised":
                                # Step 80: Agent 主动修订计划 → 立即发射 plan_revised 事件
                                yield _sse_event({
                                    "type": "plan_revised",
                                    "world_id": world_id,
                                    "tick": engine.current_tick,
                                    "data": ev.get("data", {}),
                                })

                    # 发射 plan_updated 事件（67: 含辩论+角色数据）
                    plan_data = plan.to_dict()
                    plan_data["debate"] = debate_state
                    plan_data["evolutions"] = evolutions
                    # 角色：优先用演化后的，fallback 到初始分配
                    te = getattr(engine, "team_engine", None)
                    roles_src = getattr(engine, "team_agent_roles", {}) or {}
                    if te and hasattr(te, "_evolved_roles") and te._evolved_roles:
                        roles_src = {**roles_src, **te._evolved_roles}
                    plan_data["agent_roles"] = [
                        {"id": aid, "name": name_map.get(aid, aid), "role": roles_src.get(aid, "成员")}
                        for aid in engine.agents.keys()
                    ]
                    yield _sse_event({
                        "type": "plan_updated",
                        "world_id": world_id,
                        "tick": engine.current_tick,
                        "data": plan_data,
                    })
                    # 协调器催促（连续 8 tick 无进展 → Step 80）
                    step = plan.current_step()
                    if step and plan._ticks_on_step >= 8:
                        drift = getattr(plan, "_drift_count", 0)
                        msg = (
                            f"⚠️ 协调器：当前阶段「{step['title']}」已讨论{plan._ticks_on_step}轮。"
                            + (f" 已检测到{drift}次偏离主题。" if drift else "")
                            + " 请聚焦当前任务或调用 submit_deliverable 提交。"
                        )
                        yield _sse_event({
                            "type": "coordinator_nudge",
                            "world_id": world_id,
                            "tick": engine.current_tick,
                            "content": msg,
                        })
                    if plan.all_done:
                        engine.world.status = "finished"
                        await _finish_engine_simulation(engine)
                        # State 4 D1+D2: SSE 路径也需触发固化+指纹持久化
                        if hasattr(engine, "_consolidate_memories"):
                            await engine._consolidate_memories(engine.events)
                        if hasattr(engine, "_persist_fingerprints"):
                            await engine._persist_fingerprints()
                        # Step 82: 发射 memory_consolidated 事件
                        pending_cons = getattr(engine, "_pending_consolidation_events", [])
                        for cons in pending_cons:
                            yield _sse_event({
                                "type": "memory_consolidated",
                                "world_id": world_id,
                                "tick": engine.current_tick,
                                "data": cons,
                            })
                        engine._pending_consolidation_events = []
                        yield _sse_event({
                            "type": "session_end",
                            "world_id": world_id,
                            "tick": engine.current_tick,
                        })
                        report = plan.build_report()
                        yield _sse_event({
                            "type": "report_ready",
                            "world_id": world_id,
                            "tick": engine.current_tick,
                            "data": report,
                        })
                        # 持久化报告 + 标记 Team/Plan/World 全部完成
                        if hasattr(engine, "team_engine") and engine.team_engine:
                            await engine.team_engine._save_report(report)
                        try:
                            from db import async_session
                            from models.team_orm import TeamRow
                            from models.world_orm import WorldRow
                            from sqlalchemy import update as _upd
                            async with async_session() as _db:
                                # 标记 Team finished
                                if hasattr(engine, "team_engine"):
                                    tid = engine.team_engine.team.get("id", "")
                                    if tid:
                                        await _db.execute(_upd(TeamRow).where(TeamRow.id == tid).values(status="finished"))
                                # 标记 World finished（确保不重连）
                                await _db.execute(_upd(WorldRow).where(WorldRow.id == world_id).values(status="finished"))
                                await _db.commit()
                        except Exception as _db_err:
                            logger.warning(
                                f"SSE: failed to mark Team/World finished: {_db_err}"
                            )
                        break
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
