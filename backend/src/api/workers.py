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
from engines.worker.workspace import CloudWorkspace, LocalWorkspace, WorkspaceProvider


def _create_workspace(workspace_type: str, config: dict, run_id: str = "") -> WorkspaceProvider | None:
    """共享 workspace 工厂——workers 和 pipelines 端点共用。

    Args:
        workspace_type: "local" | "cloud"
        config: 工作区配置字典 (local: {path}, cloud: {host, port, user, key, path})
        run_id: 运行 ID（local 模式用作子目录名）

    Returns:
        WorkspaceProvider 实例，local 模式返回 None（由 AgentWorker 自动创建 LocalWorkspace）

    Raises:
        HTTPException: 云端配置无效时
    """
    from pathlib import Path
    from fastapi import HTTPException

    if workspace_type == "cloud":
        try:
            return CloudWorkspace(
                host=config.get("host", ""),
                port=config.get("port", 22),
                user=config.get("user", ""),
                key=config.get("key", ""),
                path=config.get("path", ""),
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"云端工作区配置错误: {e}")
    # local → None, AgentWorker 自动创建 LocalWorkspace
    return None

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
    reuse_run_id: str = Field(
        default="",
        description="复用已有工作区——用于追加对话。空字符串则创建新工作区",
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


async def _persist_worker_state(entry: dict):
    """保存 Worker 状态到工作区目录——重启后可恢复。"""
    try:
        worker = entry["worker"]
        state_file = f"{worker._workspace._root}/worker_state.json"
        state = {
            "run_id": worker.run_id,
            "agent_name": entry["agent_name"],
            "task": entry["task"],
            "running": entry.get("running", False),
            "state": worker.state.value if hasattr(worker.state, 'value') else str(worker.state),
            "steps": worker._step_index,
            "created_at": entry["created_at"],
        }
        import json
        from pathlib import Path
        Path(state_file).write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        pass  # 持久化失败不阻塞 Worker


async def _restore_workers_from_disk(base_dir: str = None):
    """从磁盘恢复已完成/运行中的 Worker（服务重启后调用）。"""
    from pathlib import Path
    import json as _json
    root = Path(base_dir or str(Path.home() / "workspaces"))
    if not root.exists():
        return
    for ws_dir in root.iterdir():
        if not ws_dir.is_dir():
            continue
        state_file = ws_dir / "worker_state.json"
        if not state_file.exists():
            continue
        try:
            state = _json.loads(state_file.read_text(encoding='utf-8'))
            state["running"] = False  # 重启后标记为非运行
            _active_workers[state["run_id"]] = {
                "worker": None,  # 无活跃 engine，仅元数据
                "agent_name": state.get("agent_name", "?"),
                "task": state.get("task", ""),
                "running": False,
                "events": [],
                "created_at": state.get("created_at", ""),
            }
            logger.info(f"Restored worker: {state['run_id']} — {state.get('task', '')[:50]}")
        except Exception:
            pass


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

    # 创建 Workspace——如果 reuse_run_id 指定且已有工作区，则复用
    workspace = None
    if req.reuse_run_id:
        existing = _active_workers.get(req.reuse_run_id)
        if existing:
            workspace = existing["worker"]._workspace
            logger.info(f"Reusing workspace from run {req.reuse_run_id}")
    if workspace is None:
        workspace = _create_workspace(
            req.workspace_type,
            req.workspace_config or {},
            req.agent_id,
        )

    # 创建 Worker
    worker = AgentWorker(agent=agent, workspace=workspace, base_dir=req.workspace_config.get("path"))

    # 注册到内存表
    _active_workers[worker.run_id] = {
        "worker": worker,
        "agent_name": worker._agent_name,
        "task": req.task,
        "running": True,
        "events": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    # 返回 SSE 流
    async def event_generator():
        entry = _active_workers.get(worker.run_id)
        try:
            async for event in worker.execute(req.task):
                yield event
                # 保存事件供重连回放
                if entry and entry.get("events") is not None:
                    entry["events"].append(event)
        except Exception as e:
            logger.exception(f"Worker SSE error: {e}")
            err = f"data: {json.dumps({'type': 'worker.error', 'data': {'message': str(e)}, 'timestamp': datetime.now(timezone.utc).isoformat()})}\n\n"
            if entry and entry.get("events") is not None:
                entry["events"].append(err)
            yield err
        finally:
            if entry:
                entry["running"] = False
                # 持久化到工作区目录（重启后可恢复）
                await _persist_worker_state(entry)
            # 保留 worker 在内存中（用户可查询状态、下载产物）

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ⚠️ /history 和 /running/list 必须在 /{run_id} 之前，否则会被路径参数捕获
@router.get("/history")
async def list_worker_history():
    """列出所有已完成和运行中的 Worker（历史记录）。"""
    history = []
    for rid, e in _active_workers.items():
        worker = e["worker"]
        files = []
        try:
            f_list = await worker._workspace.list_files()
            files = [{"path": f.path, "size": f.size} for f in f_list]
        except Exception:
            pass
        history.append({
            "run_id": rid,
            "agent_name": e["agent_name"],
            "task": e["task"][:120],
            "running": e.get("running", False),
            "state": worker.state.value if hasattr(worker.state, 'value') else str(worker.state),
            "steps": worker._step_index,
            "files": files,
            "created_at": e["created_at"],
        })
    history.sort(key=lambda h: h["created_at"], reverse=True)
    return history


@router.get("/running/list")
async def list_running_workers():
    """列出所有活跃 Worker——供全局状态栏显示。"""
    return [
        {"run_id": rid, "agent_name": e["agent_name"], "task": e["task"][:80],
         "running": e.get("running", False), "created_at": e["created_at"]}
        for rid, e in _active_workers.items()
    ]


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


# =============================================================================
# 文件读取 + 事件回放 + 活跃列表
# =============================================================================


@router.get("/{run_id}/files/{path:path}")
async def read_worker_file(run_id: str, path: str):
    """读取 Worker 工作区中的文件内容。"""
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Worker {run_id!r} 未找到")
    try:
        content = await entry["worker"]._workspace.read_file(path)
        return {"path": path, "content": content, "size": len(content)}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{run_id}/events")
async def get_worker_events(run_id: str):
    """获取 Worker 事件列表——页面切换后恢复终端用。"""
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Worker {run_id!r} 未找到")
    return {
        "run_id": run_id,
        "events": entry.get("events", [])[-500:],
        "running": entry.get("running", False),
    }


class FileWriteRequest(BaseModel):
    """用户编辑工作区文件的请求。"""
    path: str = Field(..., description="文件路径")
    content: str = Field(..., description="新内容")
    lock: bool = Field(default=True, description="编辑期间锁定文件，禁止 Agent 写入")


@router.put("/{run_id}/files/{path:path}")
async def write_worker_file(run_id: str, path: str, req: FileWriteRequest):
    """用户编辑工作区文件（区别于 Agent 的 write_file 工具调用）。

    如果 lock=True，编辑期间 Agent 无法写入此文件。
    """
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Worker {run_id!r} 未找到")
    worker = entry["worker"]
    try:
        if req.lock:
            worker.lock_file(path)
        await worker._workspace.write_file(path, req.content)
        return {"path": path, "size": len(req.content), "locked": req.lock}
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{run_id}/unlock")
async def unlock_worker_file(run_id: str, path: str = ""):
    """解锁文件——用户关闭编辑器后调用，允许 Agent 恢复写入。"""
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Worker {run_id!r} 未找到")
    entry["worker"].unlock_file(path)
    return {"path": path, "locked": False}


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


# =============================================================================
# Phase 24: 工作区连接测试
# =============================================================================


class TestConnectionRequest(BaseModel):
    """SSH 连接测试请求。"""
    host: str = Field(..., description="SSH 主机地址")
    port: int = Field(default=22, description="SSH 端口")
    user: str = Field(..., description="SSH 用户名")
    key: str = Field(..., description="SSH 私钥内容（PEM 格式或文件路径），仅存内存")
    path: str = Field(default="/data/workspaces", description="云端工作区路径")


class TestConnectionResponse(BaseModel):
    """连接测试结果。"""
    success: bool
    message: str
    latency_ms: int
    location: str


@router.post("/test-connection")
async def test_ssh_connection(req: TestConnectionRequest):
    """测试 SSH 连接。

    创建一个临时 CloudWorkspace → 测试连接 → 返回结果。
    SSH 密钥仅存内存中，不会序列化到数据库或日志。
    """
    logger.info(f"POST /api/workers/test-connection: {req.user}@{req.host}:{req.port}")
    workspace = CloudWorkspace(
        host=req.host,
        port=req.port,
        user=req.user,
        key=req.key,
        path=req.path,
    )
    success, message, latency = await workspace.test_connection()
    await workspace.close()

    return TestConnectionResponse(
        success=success,
        message=message,
        latency_ms=latency,
        location=f"云端: {req.user}@{req.host}:{req.path}",
    )


# =============================================================================
# Phase 26: 调度器管理
# =============================================================================


class SchedulerTaskRequest(BaseModel):
    """调度任务创建请求。"""
    name: str = Field(..., description="任务名称")
    agent_id: str = Field(..., description="执行 Agent ID")
    task: str = Field(..., description="任务描述")
    trigger_type: str = Field(default="cron", description="触发类型: cron | file_watch | once")
    cron_expr: str = Field(default="", description="Cron 表达式，如 'daily 08:00'")
    watch_dir: str = Field(default="", description="监视目录路径")
    file_pattern: str = Field(default="*", description="文件匹配模式")


@router.post("/scheduler/tasks")
async def create_scheduled_task(req: SchedulerTaskRequest):
    """创建自主调度任务。"""
    import uuid
    from engines.worker.scheduler import get_scheduler, ScheduledTask

    task = ScheduledTask(
        id=str(uuid.uuid4())[:8],
        name=req.name,
        agent_id=req.agent_id,
        task=req.task,
        trigger_type=req.trigger_type,
        cron_expr=req.cron_expr,
        watch_dir=req.watch_dir,
        file_pattern=req.file_pattern,
        enabled=True,
    )
    get_scheduler().add_task(task)
    return {"id": task.id, "name": task.name, "trigger_type": task.trigger_type}


@router.get("/scheduler/tasks")
async def list_scheduled_tasks():
    """列出所有调度任务。"""
    from engines.worker.scheduler import get_scheduler
    tasks = get_scheduler().list_tasks()
    return [
        {
            "id": t.id,
            "name": t.name,
            "trigger_type": t.trigger_type,
            "cron_expr": t.cron_expr,
            "enabled": t.enabled,
            "last_run": t.last_run,
            "run_count": t.run_count,
        }
        for t in tasks
    ]


@router.delete("/scheduler/tasks/{task_id}")
async def delete_scheduled_task(task_id: str):
    """删除调度任务。"""
    from engines.worker.scheduler import get_scheduler
    get_scheduler().remove_task(task_id)
    return {"status": "deleted", "task_id": task_id}
