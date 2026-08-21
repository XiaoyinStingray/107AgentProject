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
    PipelineEdge,
    PipelineStatus,
    EdgeType,
    validate_pipeline,
)

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])


class NodeCreateRequest(BaseModel):
    id: str = Field(..., description="Node ID")
    title: str = Field(default="", description="Node title")
    agent_id: str = Field(default="worker-default", description="Agent ID")
    task: str = Field(default="", description="Task description")
    role: str = Field(default="worker", description="Node role")
    produces: list[str] = Field(default_factory=list)
    expects: list[str] = Field(default_factory=list)
    depends_on: list[str] = Field(default_factory=list)
    depends_on_files: list[str] = Field(default_factory=list)
    extra_tools: list[str] = Field(default_factory=list)
    enabled_tools: list[str] = Field(default_factory=list)


class EdgeCreateRequest(BaseModel):
    id: str = Field(..., description="Edge ID")
    from_node: str = Field(..., description="Source node ID")
    to_node: str = Field(..., description="Target node ID")
    edge_type: str = Field(default="flow", description="flow | loop | branch")
    condition: str | None = None
    condition_field: str | None = None
    max_iterations: int = Field(default=3, ge=1, le=10)
    iteration_label: str = ""
    priority: int = 0
    label: str = ""


class PipelineCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str = ""
    nodes: list[NodeCreateRequest] = Field(..., min_length=1)
    edges: list[EdgeCreateRequest] = Field(default_factory=list)


class PipelineExecuteRequest(BaseModel):
    workspace_type: str = Field(default="local")
    workspace_config: dict = Field(default_factory=dict)


class PipelineSuggestRequest(BaseModel):
    goal: str = Field(..., min_length=1, max_length=2000, description="User's goal description")
    agent_ids: list[str] = Field(default_factory=list, description="Available agent IDs to assign")


_pipelines: dict[str, PipelineSpec] = {}
_active_runs: dict[str, object] = {}

_pipelines_file = None


def _get_pipelines_path():
    global _pipelines_file
    if _pipelines_file is None:
        from pathlib import Path
        _pipelines_file = Path.home() / ".lifelab_pipelines.json"
    return _pipelines_file


def _save_pipelines():
    try:
        import json as _json
        data = []
        for p in _pipelines.values():
            data.append({
                "id": p.id, "name": p.name, "description": p.description,
                "nodes": [{ "id": n.id, "title": n.title, "agent_id": n.agent_id,
                           "task": n.task, "role": n.role,
                           "produces": n.produces, "expects": n.expects,
                           "depends_on": n.depends_on, "depends_on_files": n.depends_on_files,
                           "extra_tools": n.extra_tools, "enabled_tools": n.enabled_tools,
                           } for n in p.nodes],
                "edges": [{ "id": e.id, "from_node": e.from_node, "to_node": e.to_node,
                           "edge_type": e.edge_type.value,
                           "condition": e.condition, "condition_field": e.condition_field,
                           "max_iterations": e.max_iterations, "iteration_label": e.iteration_label,
                           "priority": e.priority, "label": e.label,
                           } for e in p.edges],
            })
        _get_pipelines_path().write_text(_json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        pass


def _load_pipelines():
    try:
        import json as _json
        path = _get_pipelines_path()
        if path.exists():
            data = _json.loads(path.read_text(encoding='utf-8'))
            for d in data:
                _pipelines[d["id"]] = PipelineSpec(
                    id=d["id"], name=d["name"], description=d.get("description", ""),
                    nodes=[PipelineNodeSpec(
                        id=n["id"], title=n["title"], agent_id=n.get("agent_id", "worker-default"),
                        task=n["task"], role=n.get("role", "worker"),
                        produces=n.get("produces", []), expects=n.get("expects", []),
                        depends_on=n.get("depends_on", []),
                        depends_on_files=n.get("depends_on_files", []),
                        extra_tools=n.get("extra_tools", []),
                        enabled_tools=n.get("enabled_tools", []),
                    ) for n in d.get("nodes", [])],
                    edges=[PipelineEdge(
                        id=e["id"], from_node=e["from_node"], to_node=e["to_node"],
                        edge_type=EdgeType(e.get("edge_type", "flow")),
                        condition=e.get("condition"), condition_field=e.get("condition_field"),
                        max_iterations=e.get("max_iterations", 3),
                        iteration_label=e.get("iteration_label", ""),
                        priority=e.get("priority", 0), label=e.get("label", ""),
                    ) for e in d.get("edges", [])],
                )
            logger.info(f"Loaded {len(data)} pipelines from disk")
    except Exception as e:
        logger.warning(f"Failed to load pipelines: {e}")


# Load on import
_load_pipelines()


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
    """LLM 生成管道建议。LLM 不可用时用规则兜底。"""
    logger.info(f"POST /api/pipelines/suggest: {req.goal[:80]}")

    # 规则兜底：LLM 失败时基于目标关键词生成简单管道
    def _rule_fallback() -> dict:
        goal_lower = req.goal.lower()
        nodes = []
        if any(kw in goal_lower for kw in ["数据", "分析", "data", "统计"]):
            nodes = [
                {"id": "collect", "title": "数据收集", "agent_id": "worker-default",
                 "description": "收集并整理输入数据", "depends_on": []},
                {"id": "process", "title": "数据处理", "agent_id": "worker-default",
                 "description": "清洗和转换数据", "depends_on": ["collect"]},
                {"id": "analyze", "title": "数据分析", "agent_id": "worker-default",
                 "description": "执行统计分析并生成洞察", "depends_on": ["process"]},
            ]
        elif any(kw in goal_lower for kw in ["报告", "文档", "report", "总结"]):
            nodes = [
                {"id": "research", "title": "资料收集", "agent_id": "worker-default",
                 "description": "收集相关资料和参考信息", "depends_on": []},
                {"id": "draft", "title": "撰写草稿", "agent_id": "worker-default",
                 "description": "基于资料撰写报告草稿", "depends_on": ["research"]},
                {"id": "review", "title": "审核优化", "agent_id": "worker-default",
                 "description": "审核并优化报告内容", "depends_on": ["draft"]},
            ]
        else:
            nodes = [
                {"id": "plan", "title": "任务规划", "agent_id": "worker-default",
                 "description": "分析目标并制定执行计划", "depends_on": []},
                {"id": "execute", "title": "执行任务", "agent_id": "worker-default",
                 "description": "按计划执行核心任务", "depends_on": ["plan"]},
                {"id": "deliver", "title": "交付成果", "agent_id": "worker-default",
                 "description": "整合产出并交付最终成果", "depends_on": ["execute"]},
            ]
        return {
            "name": req.goal[:20] + ("..." if len(req.goal) > 20 else ""),
            "description": f"规则兜底生成：{req.goal[:80]}",
            "nodes": nodes,
        }

    try:
        import asyncio
        from llm.client import create_model_client
        from autogen_core.models import UserMessage

        client = create_model_client()
        if client is None:
            logger.warning("Pipeline suggest: LLM client is None, using rule fallback")
            return _rule_fallback()

        prompt = f"用户目标：{req.goal}\n可用 Agent ID：{', '.join(req.agent_ids) if req.agent_ids else '(全部可用)'}"
        response = await asyncio.wait_for(
            client.create(
                messages=[
                    UserMessage(content=f"{SUGGEST_PROMPT}\n\n{prompt}", source="pipeline_suggest"),
                ],
            ),
            timeout=15.0,
        )
        text = response.content if hasattr(response, 'content') else str(response)

        # Parse JSON
        text = str(text).strip()
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
        logger.warning(f"Pipeline suggest LLM failed ({type(e).__name__}), using rule fallback: {e}")
        return _rule_fallback()


# =============================================================================
# CRUD
# =============================================================================

@router.post("/")
async def create_pipeline(req: PipelineCreateRequest):
    pipeline_id = str(uuid.uuid4())[:8]
    nodes = [
        PipelineNodeSpec(
            id=n.id, title=n.title, agent_id=n.agent_id, task=n.task,
            role=n.role, produces=n.produces, expects=n.expects,
            depends_on=n.depends_on, depends_on_files=n.depends_on_files,
            extra_tools=n.extra_tools, enabled_tools=n.enabled_tools,
        )
        for n in req.nodes
    ]
    edges = [
        PipelineEdge(
            id=e.id, from_node=e.from_node, to_node=e.to_node,
            edge_type=EdgeType(e.edge_type),
            condition=e.condition, condition_field=e.condition_field,
            max_iterations=e.max_iterations, iteration_label=e.iteration_label,
            priority=e.priority, label=e.label,
        )
        for e in req.edges
    ]
    pipeline = PipelineSpec(id=pipeline_id, name=req.name, description=req.description,
                            nodes=nodes, edges=edges)
    valid, msg = validate_pipeline(pipeline)
    if not valid:
        raise HTTPException(status_code=400, detail=f"管道配置无效: {msg}")
    _pipelines[pipeline_id] = pipeline
    _save_pipelines()
    logger.info(f"Pipeline created: {pipeline_id} — {req.name} ({len(nodes)} nodes, {len(edges)} edges)")
    return {"id": pipeline_id, "name": req.name, "node_count": len(nodes), "edge_count": len(edges), "status": "draft"}


@router.get("/")
async def list_pipelines():
    return [
        {
            "id": p.id, "name": p.name, "description": p.description,
            "node_count": len(p.nodes), "status": p.status.value,
            "nodes": [{"id": n.id, "title": n.title, "agent_id": n.agent_id,
                       "task": n.task, "depends_on": n.depends_on} for n in p.nodes],
        }
        for p in _pipelines.values()
    ]


@router.get("/{pipeline_id}")
async def get_pipeline(pipeline_id: str):
    p = _pipelines.get(pipeline_id)
    if not p:
        raise HTTPException(status_code=404, detail="管道不存在")
    return {
        "id": p.id, "name": p.name, "description": p.description, "status": p.status.value,
        "nodes": [{
            "id": n.id, "title": n.title, "agent_id": n.agent_id, "task": n.task,
            "role": n.role, "produces": n.produces, "expects": n.expects,
            "depends_on": n.depends_on, "depends_on_files": n.depends_on_files,
            "extra_tools": n.extra_tools, "enabled_tools": n.enabled_tools,
        } for n in p.nodes],
        "edges": [{
            "id": e.id, "from_node": e.from_node, "to_node": e.to_node,
            "edge_type": e.edge_type.value,
            "condition": e.condition, "condition_field": e.condition_field,
            "max_iterations": e.max_iterations, "iteration_label": e.iteration_label,
            "priority": e.priority, "label": e.label,
        } for e in p.edges],
    }


@router.put("/{pipeline_id}")
async def update_pipeline(pipeline_id: str, req: PipelineCreateRequest):
    """更新已有管道。"""
    if pipeline_id not in _pipelines:
        raise HTTPException(status_code=404, detail="管道不存在")
    nodes = [
        PipelineNodeSpec(id=n.id, title=n.title, agent_id=n.agent_id, task=n.task,
                         role=n.role, produces=n.produces, expects=n.expects,
                         depends_on=n.depends_on, depends_on_files=n.depends_on_files,
                         extra_tools=n.extra_tools, enabled_tools=n.enabled_tools)
        for n in req.nodes
    ]
    edges = [
        PipelineEdge(id=e.id, from_node=e.from_node, to_node=e.to_node,
                     edge_type=EdgeType(e.edge_type),
                     condition=e.condition, condition_field=e.condition_field,
                     max_iterations=e.max_iterations, iteration_label=e.iteration_label,
                     priority=e.priority, label=e.label)
        for e in req.edges
    ]
    pipeline = PipelineSpec(id=pipeline_id, name=req.name, description=req.description,
                            nodes=nodes, edges=edges)
    valid, msg = validate_pipeline(pipeline)
    if not valid:
        raise HTTPException(status_code=400, detail=f"管道配置无效: {msg}")
    _pipelines[pipeline_id] = pipeline
    _save_pipelines()
    return {"id": pipeline_id, "name": req.name, "node_count": len(nodes), "edge_count": len(edges)}


@router.get("/{pipeline_id}/runs")
async def list_pipeline_runs(pipeline_id: str):
    """列出管线的历史运行记录。"""
    from pathlib import Path
    import json as _json
    runs = []
    run_file = Path.home() / "workspaces" / f"pipeline-{pipeline_id}" / "_pipeline_runs.json"
    if run_file.exists():
        try:
            runs = _json.loads(run_file.read_text(encoding='utf-8'))
        except Exception:
            pass
    # 补充 node_events 信息（如果 runs 中没有）
    for run_entry in runs:
        if "node_events" not in run_entry:
            run_entry["node_events"] = {}
            for nid, status in run_entry.get("nodes", {}).items():
                run_entry["node_events"][nid] = {"title": nid, "status": status}
    return {"pipeline_id": pipeline_id, "runs": runs}


async def _save_pipeline_run(pipeline_id: str, run_data: dict):
    """保存管线运行结果到工作区目录。"""
    from pathlib import Path
    import json as _json
    run_file = Path.home() / "workspaces" / f"pipeline-{pipeline_id}" / "_pipeline_runs.json"
    runs = []
    if run_file.exists():
        try:
            runs = _json.loads(run_file.read_text(encoding='utf-8'))
        except Exception:
            pass
    runs.append(run_data)
    runs = runs[-10:]  # 最多保留 10 次运行
    run_file.parent.mkdir(parents=True, exist_ok=True)
    run_file.write_text(_json.dumps(runs, ensure_ascii=False, indent=2), encoding='utf-8')


@router.get("/{pipeline_id}/files")
async def list_pipeline_files(pipeline_id: str):
    """列出管线工作区中的产出文件。"""
    from pathlib import Path
    ws_dir = Path.home() / "workspaces" / f"pipeline-{pipeline_id}" / "files"
    files = []
    if ws_dir.exists():
        for p in ws_dir.rglob("*"):
            if p.is_file():
                files.append({"path": str(p.relative_to(ws_dir)).replace("\\", "/"), "size": p.stat().st_size})
    return {"pipeline_id": pipeline_id, "files": sorted(files, key=lambda f: f["size"], reverse=True)}


@router.get("/{pipeline_id}/files/{path:path}")
async def read_pipeline_file(pipeline_id: str, path: str):
    """读取管线工作区中的文件内容。"""
    from pathlib import Path
    ws_root = Path.home() / "workspaces" / f"pipeline-{pipeline_id}" / "files"
    if not ws_root.exists():
        raise HTTPException(status_code=404, detail="管线工作区不存在")
    # 路径穿越检查——resolved 必须在 ws_root 内
    resolved = (ws_root / path).resolve()
    if not str(resolved).startswith(str(ws_root.resolve())):
        raise HTTPException(status_code=403, detail="不允许访问工作区外的文件")
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    content = resolved.read_text(encoding='utf-8')
    return {"path": path, "content": content, "size": len(content)}


@router.delete("/{pipeline_id}")
async def delete_pipeline(pipeline_id: str):
    if pipeline_id not in _pipelines:
        raise HTTPException(status_code=404, detail="管道不存在")
    del _pipelines[pipeline_id]
    _save_pipelines()
    return {"status": "deleted"}


@router.post("/{pipeline_id}/execute")
async def execute_pipeline(pipeline_id: str, req: PipelineExecuteRequest | None = None):
    if req is None:
        req = PipelineExecuteRequest()
    pipeline = _pipelines.get(pipeline_id)
    if not pipeline:
        raise HTTPException(status_code=404, detail="管道不存在")
    valid, msg = validate_pipeline(pipeline)
    if not valid:
        raise HTTPException(status_code=400, detail=f"管道无效: {msg}")

    # Validate every node before opening the SSE stream.  A deleted Agent must
    # fail explicitly instead of being replaced by a generic Worker mid-run.
    from engines.agent_factory.loader import (
        AgentNotFoundError,
        AgentRestoreError,
        validate_execution_agent_id,
    )
    try:
        for agent_id in {node.agent_id for node in pipeline.nodes}:
            await validate_execution_agent_id(agent_id)
    except AgentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AgentRestoreError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    from pathlib import Path
    from api.workers import _create_workspace
    workspace = _create_workspace(req.workspace_type, req.workspace_config or {}, f"pipeline-{pipeline_id}")
    if workspace is None:
        from engines.worker.workspace import LocalWorkspace
        workspace = LocalWorkspace(str(Path.home() / "workspaces"), f"pipeline-{pipeline_id}")

    async def get_agent(agent_id: str):
        from api.workers import _get_or_create_agent
        return await _get_or_create_agent(agent_id)

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
