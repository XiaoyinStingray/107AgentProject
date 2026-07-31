"""
Pipeline API — 管道 CRUD + 执行端点。

端点:
    POST   /api/pipelines          → 创建管道
    GET    /api/pipelines          → 列出管道
    GET    /api/pipelines/{id}     → 获取管道详情
    DELETE /api/pipelines/{id}     → 删除管道
    POST   /api/pipelines/{id}/execute → 执行管道 (SSE)
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

from engines.worker.pipeline import (
    PipelineSpec,
    PipelineNodeSpec,
    PipelineStatus,
    validate_pipeline,
)

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])


# =============================================================================
# 请求/响应模型
# =============================================================================


class NodeCreateRequest(BaseModel):
    """创建管道节点的请求。"""
    id: str = Field(..., description="节点 ID（英文标识）")
    title: str = Field(..., description="节点标题")
    agent_id: str = Field(..., description="执行 Agent ID")
    task: str = Field(..., description="任务描述")
    depends_on: list[str] = Field(default_factory=list)
    depends_on_files: list[str] = Field(default_factory=list)


class PipelineCreateRequest(BaseModel):
    """创建管道的请求。"""
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    nodes: list[NodeCreateRequest] = Field(..., min_length=1)


class PipelineExecuteRequest(BaseModel):
    """执行管道的请求。"""
    workspace_type: str = Field(default="local")
    workspace_config: dict = Field(default_factory=dict)


# =============================================================================
# 内存存储
# =============================================================================

_pipelines: dict[str, PipelineSpec] = {}
_active_runs: dict[str, object] = {}


# =============================================================================
# 端点
# =============================================================================


@router.post("/")
async def create_pipeline(req: PipelineCreateRequest):
    """创建管道。"""
    pipeline_id = str(uuid.uuid4())[:8]
    nodes = [
        PipelineNodeSpec(
            id=n.id,
            title=n.title,
            agent_id=n.agent_id,
            task=n.task,
            depends_on=n.depends_on,
            depends_on_files=n.depends_on_files,
        )
        for n in req.nodes
    ]

    pipeline = PipelineSpec(
        id=pipeline_id,
        name=req.name,
        description=req.description,
        nodes=nodes,
    )

    valid, msg = validate_pipeline(pipeline)
    if not valid:
        raise HTTPException(status_code=400, detail=f"管道配置无效: {msg}")

    _pipelines[pipeline_id] = pipeline
    logger.info(f"Pipeline created: {pipeline_id} — {req.name} ({len(nodes)} nodes)")
    return {
        "id": pipeline_id,
        "name": req.name,
        "node_count": len(nodes),
        "status": "draft",
    }


@router.get("/")
async def list_pipelines():
    """列出所有管道。"""
    return [
        {
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "node_count": len(p.nodes),
            "status": p.status.value,
        }
        for p in _pipelines.values()
    ]


@router.get("/{pipeline_id}")
async def get_pipeline(pipeline_id: str):
    """获取管道详情。"""
    pipeline = _pipelines.get(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="管道不存在")
    return {
        "id": pipeline.id,
        "name": pipeline.name,
        "description": pipeline.description,
        "status": pipeline.status.value,
        "nodes": [
            {
                "id": n.id,
                "title": n.title,
                "agent_id": n.agent_id,
                "task": n.task,
                "depends_on": n.depends_on,
                "depends_on_files": n.depends_on_files,
            }
            for n in pipeline.nodes
        ],
    }


@router.delete("/{pipeline_id}")
async def delete_pipeline(pipeline_id: str):
    """删除管道。"""
    if pipeline_id not in _pipelines:
        raise HTTPException(status_code=404, detail="管道不存在")
    del _pipelines[pipeline_id]
    return {"status": "deleted"}


@router.post("/{pipeline_id}/execute")
async def execute_pipeline(pipeline_id: str, req: PipelineExecuteRequest = None):
    """执行管道——返回 SSE 流。"""
    if req is None:
        req = PipelineExecuteRequest()

    pipeline = _pipelines.get(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="管道不存在")

    valid, msg = validate_pipeline(pipeline)
    if not valid:
        raise HTTPException(status_code=400, detail=f"管道无效: {msg}")

    # 创建工作区
    from pathlib import Path
    from engines.worker.workspace import LocalWorkspace, CloudWorkspace

    if req.workspace_type == "cloud":
        config = req.workspace_config or {}
        workspace = CloudWorkspace(
            host=config.get("host", ""),
            port=config.get("port", 22),
            user=config.get("user", ""),
            key=config.get("key", ""),
            path=config.get("path", ""),
        )
    else:
        workspace = LocalWorkspace(
            str(Path.home() / "workspaces"),
            f"pipeline-{pipeline_id}",
        )

    # Agent 获取函数
    async def get_agent(agent_id: str):
        from api.workers import _get_or_create_agent
        return _get_or_create_agent(agent_id)

    # 执行
    from engines.worker.pipeline_engine import PipelineEngine
    engine = PipelineEngine()

    async def event_generator():
        try:
            async for sse_event in engine.execute(pipeline, workspace, get_agent):
                # 用 data: 前缀包装
                yield f"data: {sse_event}\n\n"
        except Exception as e:
            logger.exception(f"Pipeline execution error: {e}")
            yield f"data: {json.dumps({'type': 'pipeline.error', 'data': {'message': str(e)}, 'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
