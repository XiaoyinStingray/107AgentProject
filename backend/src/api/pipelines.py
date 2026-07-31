"""
Pipeline API — 管道 CRUD + 执行 + LLM 建议生成。
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


class NodeCreateRequest(BaseModel):
    id: str = Field(..., description="Node ID")
    title: str = Field(default="", description="Node title")
    agent_id: str = Field(default="worker-default", description="Agent ID")
    task: str = Field(default="", description="Task description")
    depends_on: list[str] = Field(default_factory=list)
    depends_on_files: list[str] = Field(default_factory=list)


class PipelineCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    nodes: list[NodeCreateRequest] = Field(..., min_length=1)


class PipelineExecuteRequest(BaseModel):
    workspace_type: str = Field(default="local")
    workspace_config: dict = Field(default_factory=dict)


class PipelineSuggestRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=2000, description="User's goal description")
    agent_ids: list[str] = Field(default_factory=list, description="Available agent IDs to assign")


_pipelines: dict[str, PipelineSpec] = {}
_active_runs: dict[str, object] = {}


# =============================================================================
# LLM 管道建议
# =============================================================================

SUGGEST_PROMPT = """你是一个工作流设计专家。用户描述了一个目标，请设计一个 Agent 管道来完成它。

输出必须是严格 JSON（不要加任何其他文字）:

{
  "name": "管道名称（简短）",
  "description": "管道描述（一句话）",
  "nodes": [
    {
      "id": "research",
      "title": "搜索资料",
      "task": "搜索关于XX的最新信息，输出到 research.md",
      "depends_on": []
    },
    {
      "id": "analyze",
      "title": "分析整理",
      "task": "读取 research.md，分析整理出关键结论",
      "depends_on": ["research"]
    }
  ]
}

规则:
- 每个节点必须有 agent_id 字段，值为 "worker-default"
- 3-5 个节点为宜
- 每个节点任务要具体、可执行
- 节点间用文件传递数据（前一个节点的产出文件名）
- id 用英文短标识
- 有明确依赖关系的节点要设 depends_on
- 输出必须是纯 JSON 对象，不要加任何说明文字"""


@router.post("/suggest")
async def suggest_pipeline(req: PipelineSuggestRequest):
    """LLM 生成管道建议。"""
    logger.info(f"POST /api/pipelines/suggest: {req.goal[:80]}")
    try:
        from llm.client import create_model_client
        from autogen_core.models import UserMessage

        client = create_model_client()
        if client is None:
            raise HTTPException(status_code=503, detail="LLM 不可用")

        prompt = f"用户目标：{req.goal}\n可用 Agent ID：{', '.join(req.agent_ids) if req.agent_ids else '(全部可用)'}"
        response = await client.create(
            messages=[
                UserMessage(content=f"{SUGGEST_PROMPT}\n\n{prompt}", source="pipeline_suggest"),
            ],
        )
        text = response.content if hasattr(response, 'content') else str(response)

        # Parse JSON
        text = text.strip()
        if "```json" in text:
            text = text[text.find("```json") + 7:text.rfind("```")]
        elif "```" in text:
            text = text[text.find("```") + 3:text.rfind("```")]
        text = text[text.find("{"):text.rfind("}") + 1]

        suggestion = json.loads(text)
        return {
            "name": suggestion.get("name", "新管道"),
            "description": suggestion.get("description", ""),
            "nodes": suggestion.get("nodes", []),
        }

    except Exception as e:
        logger.error(f"Pipeline suggestion failed: {e}")
        raise HTTPException(status_code=500, detail=f"生成建议失败: {e}")


# =============================================================================
# CRUD
# =============================================================================

@router.post("/")
async def create_pipeline(req: PipelineCreateRequest):
    pipeline_id = str(uuid.uuid4())[:8]
    nodes = [
        PipelineNodeSpec(
            id=n.id, title=n.title, agent_id=n.agent_id, task=n.task,
            depends_on=n.depends_on, depends_on_files=n.depends_on_files,
        )
        for n in req.nodes
    ]
    pipeline = PipelineSpec(id=pipeline_id, name=req.name, description=req.description, nodes=nodes)
    valid, msg = validate_pipeline(pipeline)
    if not valid:
        raise HTTPException(status_code=400, detail=f"管道配置无效: {msg}")
    _pipelines[pipeline_id] = pipeline
    logger.info(f"Pipeline created: {pipeline_id} — {req.name} ({len(nodes)} nodes)")
    return {"id": pipeline_id, "name": req.name, "node_count": len(nodes), "status": "draft"}


@router.get("/")
async def list_pipelines():
    return [
        {"id": p.id, "name": p.name, "description": p.description, "node_count": len(p.nodes), "status": p.status.value}
        for p in _pipelines.values()
    ]


@router.get("/{pipeline_id}")
async def get_pipeline(pipeline_id: str):
    p = _pipelines.get(pipeline_id)
    if not p:
        raise HTTPException(status_code=404, detail="管道不存在")
    return {
        "id": p.id, "name": p.name, "description": p.description, "status": p.status.value,
        "nodes": [{"id": n.id, "title": n.title, "agent_id": n.agent_id, "task": n.task, "depends_on": n.depends_on, "depends_on_files": n.depends_on_files} for n in p.nodes],
    }


@router.delete("/{pipeline_id}")
async def delete_pipeline(pipeline_id: str):
    if pipeline_id not in _pipelines:
        raise HTTPException(status_code=404, detail="管道不存在")
    del _pipelines[pipeline_id]
    return {"status": "deleted"}


@router.post("/{pipeline_id}/execute")
async def execute_pipeline(pipeline_id: str, req: PipelineExecuteRequest = None):
    if req is None:
        req = PipelineExecuteRequest()
    pipeline = _pipelines.get(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="管道不存在")
    valid, msg = validate_pipeline(pipeline)
    if not valid:
        raise HTTPException(status_code=400, detail=f"管道无效: {msg}")

    from pathlib import Path
    from api.workers import _create_workspace
    workspace = _create_workspace(req.workspace_type, req.workspace_config or {}, f"pipeline-{pipeline_id}")
    if workspace is None:
        from engines.worker.workspace import LocalWorkspace
        workspace = LocalWorkspace(str(Path.home() / "workspaces"), f"pipeline-{pipeline_id}")

    async def get_agent(agent_id: str):
        from api.workers import _get_or_create_agent
        return _get_or_create_agent(agent_id)

    from engines.worker.pipeline_engine import PipelineEngine
    engine = PipelineEngine()

    async def event_generator():
        try:
            async for sse_event in engine.execute(pipeline, workspace, get_agent):
                yield f"data: {sse_event}\n\n"
        except Exception as e:
            logger.exception(f"Pipeline error: {e}")
            yield f"data: {json.dumps({'type':'pipeline.error','data':{'message':str(e)},'timestamp':datetime.now(timezone.utc).isoformat()})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
