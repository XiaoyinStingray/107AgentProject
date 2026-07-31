"""
Worker API — AgentWorker 的 REST API 端点。

端点:
    POST /api/workers/execute     → SSE 流式执行任务
    GET  /api/workers/{run_id}    → 查询 Worker 状态
    DELETE /api/workers/{run_id}  → 删除工作区

Phase 23: 单 Agent 本地执行。
Phase 24: 扩展支持 CloudWorkspace。
Phase 25: 扩展支持多 Agent 协作。
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

from engines.worker.engine import AgentWorker

router = APIRouter(prefix="/api/workers", tags=["workers"])


# =============================================================================
# 请求/响应模型
# =============================================================================


class WorkerExecuteRequest(BaseModel):
    """执行任务请求。"""
    agent_id: str = Field(..., description="执行任务的 Agent ID")
    task: str = Field(..., min_length=1, max_length=5000, description="任务描述")
    workspace_type: str = Field(
        default="local",
        description="工作区类型: 'local' (Phase 23) | 'cloud' (Phase 24)",
    )
    workspace_config: dict = Field(
        default_factory=dict,
        description="工作区配置——本地: {path}，云端: {host, port, user, key, path}",
    )


class WorkerStatusResponse(BaseModel):
    """Worker 状态响应。"""
    run_id: str
    state: str
    agent_name: str
    task: str
    created_at: str


# =============================================================================
# 内存 Worker 注册表
# =============================================================================

_active_workers: dict[str, dict] = {}  # run_id → {worker, agent_name, task, created_at}


def _get_or_create_agent(agent_id: str) -> "LifeAgent":
    """从数据库或内存中获取 LifeAgent 实例。

    Phase 23: 从现有的 Agent Factory / DB 获取。
    如果找不到，返回一个简单的测试 Agent。
    """
    from llm.client import create_model_client
    from engines.agent_factory.factory import LifeAgent
    from models.agent import Persona, Background

    # 尝试从活跃世界中获取
    from api.sse import _active_worlds
    for engine in _active_worlds.values():
        if agent_id in engine.agents:
            return engine.agents[agent_id]

    # 创建临时 Agent（用于 Worker 模式——不需要 World 上下文）
    model_client = create_model_client()
    persona = Persona(
        name=f"Worker-{agent_id[:8]}",
        mbti="ISTJ",
        narrative="高效的任务执行者",
        traits=["organized", "thorough", "pragmatic"],
    )
    background = Background(
        profession="研究员",
        education="未知",
        experience="多年的信息分析和报告撰写经验",
    )
    return LifeAgent(
        id=agent_id,
        persona=persona,
        background=background,
        goals=[],
        model_client=model_client,
        tools=[],
    )


# =============================================================================
# API 端点
# =============================================================================


@router.post("/execute")
async def execute_worker_task(req: WorkerExecuteRequest):
    """执行 Worker 任务——返回 SSE 流。

    请求体:
        {
          "agent_id": "abc123...",
          "task": "搜索 AI Agent 框架的最新发展，写一份报告",
          "workspace_type": "local",
          "workspace_config": {}
        }

    响应:
        Server-Sent Events 流，包含 worker.started → worker.plan →
        worker.step_decision → worker.tool_start → worker.tool_result →
        worker.reflection → ... → worker.done → worker.summary

    前端使用:
        const es = new EventSource("/api/workers/execute", { method: "POST", body: ... })
        // 或使用 fetch + ReadableStream
    """
    logger.info(f"POST /api/workers/execute: agent={req.agent_id}, task={req.task[:80]}")

    # 获取 Agent
    try:
        agent = _get_or_create_agent(req.agent_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"无法创建 Agent: {e}")

    # 创建 Worker
    worker = AgentWorker(agent=agent)

    # 注册到内存表
    _active_workers[worker.run_id] = {
        "worker": worker,
        "agent_name": worker._agent_name,
        "task": req.task,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # 返回 SSE 流
    async def event_generator():
        try:
            async for event in worker.execute(req.task):
                yield event
        except Exception as e:
            logger.exception(f"Worker SSE error: {e}")
            yield f"data: {json.dumps({'type': 'worker.error', 'data': {'message': str(e)}, 'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
        finally:
            # 保留 worker 在内存中（用户可查询状态、下载产物）
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{run_id}")
async def get_worker_status(run_id: str):
    """查询 Worker 状态。"""
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Worker {run_id!r} 未找到")
    worker = entry["worker"]
    return WorkerStatusResponse(
        run_id=run_id,
        state=worker.state.value if hasattr(worker.state, 'value') else str(worker.state),
        agent_name=entry["agent_name"],
        task=entry["task"],
        created_at=entry["created_at"],
    )


@router.delete("/{run_id}")
async def delete_worker(run_id: str):
    """删除 Worker 及其工作区。"""
    entry = _active_workers.pop(run_id, None)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Worker {run_id!r} 未找到")
    # 简单清理（Phase 23: 工作区目录保留在磁盘上等待定期清理）
    return {"status": "deleted", "run_id": run_id}


@router.post("/{run_id}/cancel")
async def cancel_worker(run_id: str):
    """取消正在运行的 Worker。"""
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Worker {run_id!r} 未找到")
    worker = entry["worker"]
    worker.cancel()
    return {"status": "cancelling", "run_id": run_id}
