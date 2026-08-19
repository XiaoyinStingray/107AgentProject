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

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

from engines.agent_factory.loader import AgentNotFoundError, AgentRestoreError
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
    role: str = Field(default="worker", description="结点角色: analyst/writer/reviewer/executor/worker (Step 105)")
    enabled_tools: list[str] = Field(default_factory=list, description="启用的工具列表——空=全部可用 (Step 105)")
    extra_tools: list[str] = Field(default_factory=list, description="额外启用的特殊工具 (Step 105)")
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
    recipe_id: str = Field(
        default="",
        description="配方 ID（可选），如 deep_research / code_review / data_analysis",
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
_MAX_ACTIVE_WORKERS = 200  # 防止内存无限增长


async def _persist_worker_state(entry: dict):
    """保存 Worker 状态到工作区目录——重启后可恢复。"""
    try:
        worker = entry["worker"]
        if worker is None:
            return  # 磁盘恢复的条目无活跃 engine
        state_file = f"{worker._workspace._root}/worker_state.json"
        state = {
            "run_id": worker.run_id,
            "agent_id": entry.get("agent_id", ""),
            "agent_name": entry["agent_name"],
            "task": entry["task"],
            "running": entry.get("running", False),
            "state": worker.state.value if hasattr(worker.state, 'value') else str(worker.state),
            "steps": worker._step_index,
            "accepted": entry.get("accepted", False),
            "created_at": entry["created_at"],
        }
        import json
        from pathlib import Path
        Path(state_file).write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        pass  # 持久化失败不阻塞 Worker


async def _persist_worker_agent_binding(
    run_id: str,
    entry: dict,
    base_dir: str | None = None,
):
    """只补写旧 Worker 历史的 Agent 身份，不破坏原状态字段。"""
    from pathlib import Path
    import json as _json

    worker = entry.get("worker")
    if worker is not None and hasattr(worker._workspace, "root"):
        state_file = Path(worker._workspace.root) / "worker_state.json"
    else:
        state_file = Path(base_dir or (Path.home() / "workspaces")) / run_id / "worker_state.json"

    state: dict = {}
    if state_file.exists():
        state = _json.loads(state_file.read_text(encoding="utf-8"))
    state.update({
        "run_id": run_id,
        "agent_id": entry.get("agent_id", ""),
        "agent_name": entry.get("agent_name", "?"),
        "task": entry.get("task", state.get("task", "")),
        "running": entry.get("running", False),
        "accepted": entry.get("accepted", state.get("accepted", False)),
        "created_at": entry.get("created_at", state.get("created_at", "")),
    })
    state_file.parent.mkdir(parents=True, exist_ok=True)
    temp_file = state_file.with_suffix(".json.tmp")
    temp_file.write_text(_json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_file.replace(state_file)
    logger.info(f"Bound restored worker {run_id} to agent {entry.get('agent_id', '')}")


async def _restore_workers_from_disk(base_dir: str | None = None):
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
                "worker": None,
                "agent_id": state.get("agent_id", ""),
                "agent_name": state.get("agent_name", "?"),
                "task": state.get("task", ""),
                "running": False,
                "accepted": state.get("accepted", False),
                "events": [],
                "created_at": state.get("created_at", ""),
            }
            logger.info(f"Restored worker: {state['run_id']} — {state.get('task', '')[:50]}")
        except Exception:
            pass


async def _get_or_create_agent(agent_id: str) -> Any:
    """Compatibility wrapper around the shared execution Agent loader.

    A real ID is restored from SQLite.  Only ``worker-default`` may create a
    generic worker; missing/deleted IDs raise an explicit error.
    """
    from engines.agent_factory.loader import load_agent_for_execution

    # 尝试从活跃世界中获取
    from api.sse import _active_worlds
    for engine in _active_worlds.values():
        if agent_id in engine.agents:
            return engine.agents[agent_id]

    # 使用统一的 Agent 加载器
    return await load_agent_for_execution(agent_id)


# =============================================================================
# API 端点
# =============================================================================


# ── Step 100: 配方 API ──

@router.get("/recipes")
async def list_recipes():
    """列出所有可用配方（供前端配方卡片使用）。"""
    from engines.worker.recipes import list_recipes as _list
    return _list()


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
        agent = await _get_or_create_agent(req.agent_id)
    except AgentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except AgentRestoreError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"无法创建 Agent: {e}")

    # 创建 Workspace——如果 reuse_run_id 指定且已有工作区，则复用
    workspace = None
    logger.info(f"reuse_run_id={req.reuse_run_id!r}, active_workers={list(_active_workers.keys())}")
    if req.reuse_run_id:
        existing = _active_workers.get(req.reuse_run_id)
        if existing:
            worker_obj = existing.get("worker")
            if worker_obj is not None:
                workspace = worker_obj._workspace
                logger.info(f"Reusing workspace from run {req.reuse_run_id}: {workspace.location_description}")
            else:
                # 磁盘恢复的条目——尝试重建 LocalWorkspace
                from pathlib import Path
                ws_root = Path.home() / "workspaces" / req.reuse_run_id
                if ws_root.exists():
                    from engines.worker.workspace import LocalWorkspace
                    workspace = LocalWorkspace(str(Path.home() / "workspaces"), req.reuse_run_id)
                    logger.info(f"Rebuilt workspace for restored run {req.reuse_run_id}: {workspace.location_description}")
        else:
            logger.warning(f"reuse_run_id={req.reuse_run_id} not found in _active_workers")
    if workspace is None:
        workspace = _create_workspace(
            req.workspace_type,
            req.workspace_config or {},
            req.agent_id,
        )
        logger.info(f"Created new workspace: {workspace.location_description if workspace else 'default'}")

    # 创建 Worker
    is_follow_up = bool(req.reuse_run_id and workspace is not None)
    worker = AgentWorker(agent=agent, workspace=workspace, base_dir=req.workspace_config.get("path"))
    if is_follow_up:
        logger.info(f"Follow-up task reusing workspace from run {req.reuse_run_id}")

    # 注册到内存表
    _active_workers[worker.run_id] = {
        "worker": worker,
        "agent_id": req.agent_id,
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
            # Step 105: 传递角色和工具配置
            extra_tools = list(req.extra_tools) if req.extra_tools else []
            async for event in worker.execute(
                req.task, is_follow_up=is_follow_up, recipe_id=req.recipe_id,
                extra_tools=extra_tools,
            ):
                yield event
                # 保存解析后的事件供重连回放（去掉 "data: " 前缀，解析 JSON）
                if entry and entry.get("events") is not None:
                    try:
                        if event.startswith("data: "):
                            entry["events"].append(json.loads(event[6:]))
                    except Exception:
                        pass  # 解析失败静默跳过
        except Exception as e:
            logger.exception(f"Worker SSE error: {e}")
            err_data = {"type": "worker.error", "data": {"message": str(e)}, "timestamp": datetime.now(timezone.utc).isoformat()}
            err_sse = f"data: {json.dumps(err_data)}\n\n"
            if entry and entry.get("events") is not None:
                entry["events"].append(err_data)
            yield err_sse
        finally:
            if entry:
                entry["running"] = False
                # 持久化到工作区目录（重启后可恢复）
                await _persist_worker_state(entry)
                await _save_events_file(entry)
            # 淘汰最旧的已完成 Worker，防止内存无限增长
            if len(_active_workers) > _MAX_ACTIVE_WORKERS:
                done = [(rid, e) for rid, e in _active_workers.items() if not e.get("running")]
                done.sort(key=lambda x: x[1].get("created_at", ""))
                for rid, _ in done[:len(done) // 2 + 1]:
                    _active_workers.pop(rid, None)
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
        worker = e.get("worker")
        files = []
        steps = 0
        worker_state = "done"
        duration_ms = e.get("duration_ms", 0)
        self_rating = ""
        key_findings = []
        if worker is not None:
            try:
                f_list = await worker._workspace.list_files()
                files = [{"path": f.path, "size": f.size} for f in f_list]
            except Exception:
                pass
            steps = worker._step_index
            worker_state = worker.state.value if hasattr(worker.state, 'value') else str(worker.state)
            # 提取元数据
            duration_ms = getattr(worker, "_total_duration_ms", 0) or duration_ms
            self_rating = getattr(worker, "_self_rating", "") or ""
            key_findings = getattr(worker, "_key_findings", []) or []
        else:
            from pathlib import Path
            ws_dir = Path.home() / "workspaces" / rid / "files"
            if ws_dir.exists():
                for p in ws_dir.rglob("*"):
                    if p.is_file():
                        rel = str(p.relative_to(ws_dir)).replace("\\", "/")
                        files.append({"path": rel, "size": p.stat().st_size})
        accepted = e.get("accepted", False)
        history.append({
            "run_id": rid,
            "agent_name": e["agent_name"],
            "task": e["task"][:120],
            "running": e.get("running", False),
            "state": worker_state,
            "steps": steps,
            "files": files,
            "accepted": accepted,
            "duration_ms": duration_ms,
            "self_rating": self_rating,
            "key_findings": key_findings[:3],
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
    worker = entry.get("worker")
    if worker is None:
        # 磁盘恢复的条目——直接从文件系统读
        from pathlib import Path
        ws_root = Path.home() / "workspaces" / run_id / "files"
        if not ws_root.exists():
            raise HTTPException(status_code=404, detail="工作区不存在")
        # 路径穿越检查
        resolved = (ws_root / path).resolve()
        if not str(resolved).startswith(str(ws_root.resolve())):
            raise HTTPException(status_code=403, detail="不允许访问工作区外的文件")
        if not resolved.exists() or not resolved.is_file():
            raise HTTPException(status_code=404, detail=f"文件不存在: {path}")
        content = resolved.read_text(encoding='utf-8')
        return {"path": path, "content": content, "size": len(content)}
    try:
        content = await worker._workspace.read_file(path)
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
    events = entry.get("events", [])
    if not events:
        # 尝试从磁盘加载
        from pathlib import Path
        events_file = Path.home() / "workspaces" / run_id / "worker_events.json"
        if events_file.exists():
            try:
                events = json.loads(events_file.read_text(encoding='utf-8'))
            except Exception:
                pass
    return {
        "run_id": run_id,
        "events": events[-500:],
        "running": entry.get("running", False),
        "accepted": entry.get("accepted", False),
    }


@router.get("/{run_id}/events/stream")
async def stream_worker_events(run_id: str, from_index: int = 0):
    """SSE 端点——从指定事件索引开始推送新事件，用于页面切换后重连。

    前端在 reconnect effect 中 hydrate 历史事件后调用此端点，
    从已加载事件的末尾继续接收新事件，直到 Worker 完成。
    """
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Worker {run_id!r} 未找到")

    async def event_generator():
        last_idx = from_index
        while True:
            events = entry.get("events", [])
            # 推送从 from_index 开始的所有新事件
            while last_idx < len(events):
                evt = events[last_idx]
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
                last_idx += 1
            # Worker 已完成 → 发送剩余事件后关闭
            if not entry.get("running", False):
                break
            await asyncio.sleep(1.5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


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
    worker = entry.get("worker")
    if worker is None:
        raise HTTPException(status_code=404, detail=f"Worker {run_id!r} 无活跃引擎（已从磁盘恢复）")
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
    worker = entry.get("worker")
    if worker is not None:
        worker.unlock_file(path)
    return {"path": path, "locked": False}


@router.post("/{run_id}/accept")
async def accept_worker(run_id: str):
    """认可交付——持久化事件并标记为已验收。"""
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Worker {run_id!r} 未找到")
    entry["accepted"] = True
    # 持久化到磁盘
    await _persist_worker_state(entry)
    # 额外保存事件文件供历史回放
    await _save_events_file(entry)
    return {"run_id": run_id, "accepted": True}


async def _save_events_file(entry: dict):
    """保存完整事件列表到工作区目录。"""
    try:
        worker = entry.get("worker")
        if worker is None:
            return
        from pathlib import Path
        events_file = Path(worker._workspace._root) / "worker_events.json"
        import json as _json
        events_file.write_text(_json.dumps(entry.get("events", []), ensure_ascii=False), encoding='utf-8')
        logger.info(f"Saved {len(entry.get('events', []))} events for {worker.run_id}")
    except Exception:
        pass


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
        latency_ms=int(latency),
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


# ── Step 100c: 决策分叉 ──

class ForkRequest(BaseModel):
    fork_point_step: int = Field(..., ge=1, description="在哪一步分叉（1-indexed）")
    alternative_decision: str = Field(..., min_length=1, max_length=500, description="替代决策描述")


class ForkOptionsRequest(BaseModel):
    fork_point_step: int = Field(..., ge=1, description="要生成替代路线的决策步骤")


class BindWorkerAgentRequest(BaseModel):
    agent_id: str = Field(..., min_length=1, description="要绑定到旧历史的真实 Agent ID")


@router.get("/{run_id}/decisions")
async def list_worker_decisions(run_id: str):
    """列出一次 Worker 运行中可用于分叉的真实决策节点。"""
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(404, f"Worker {run_id!r} 不存在")

    from engines.worker.fork import load_decision_log

    decisions = load_decision_log(run_id)
    return {
        "run_id": run_id,
        "running": entry.get("running", False),
        "agent_id": entry.get("agent_id", ""),
        "agent_name": entry.get("agent_name", "?"),
        "needs_agent_binding": not bool(entry.get("agent_id")),
        "decisions": decisions,
    }


@router.post("/{run_id}/bind-agent")
async def bind_worker_agent(run_id: str, req: BindWorkerAgentRequest):
    """显式把缺少 ID 的旧 Worker 历史绑定回同名 Agent。"""
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(404, f"Worker {run_id!r} 不存在")
    if entry.get("running", False):
        raise HTTPException(409, "运行中的任务不能重新绑定 Agent")

    existing_agent_id = entry.get("agent_id", "")
    if existing_agent_id and existing_agent_id != req.agent_id:
        raise HTTPException(409, "这条历史已经绑定到另一个 Agent，不能覆盖")

    try:
        agent = await _get_or_create_agent(req.agent_id)
    except AgentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AgentRestoreError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    historical_name = str(entry.get("agent_name", "")).split(" (Fork @", 1)[0].strip()
    agent_name = str(getattr(getattr(agent, "persona", None), "name", "")).strip()
    if historical_name and historical_name != "?" and historical_name.casefold() != agent_name.casefold():
        raise HTTPException(
            409,
            f"历史记录属于“{historical_name}”，不能绑定到“{agent_name or req.agent_id}”",
        )

    previous_id = entry.get("agent_id", "")
    previous_name = entry.get("agent_name", "?")
    entry["agent_id"] = req.agent_id
    entry["agent_name"] = agent_name or previous_name
    try:
        await _persist_worker_agent_binding(run_id, entry)
    except Exception as exc:
        entry["agent_id"] = previous_id
        entry["agent_name"] = previous_name
        logger.exception(f"Unable to persist Worker binding: {exc}")
        raise HTTPException(500, "绑定信息保存失败，请重试") from exc

    return {
        "run_id": run_id,
        "agent_id": req.agent_id,
        "agent_name": entry["agent_name"],
        "bound": True,
    }


@router.post("/{run_id}/fork-options")
async def create_worker_fork_options(run_id: str, req: ForkOptionsRequest):
    """让原 Agent 为一个历史决策生成 2-3 条替代路线。"""
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(404, f"Worker {run_id!r} 不存在")
    if entry.get("running", False):
        raise HTTPException(409, "请等待原任务完成后再创建决策分叉")

    from engines.worker.fork import generate_fork_options, load_decision_log

    decisions = load_decision_log(run_id)
    if not any(step.get("step_index") == req.fork_point_step for step in decisions):
        raise HTTPException(404, f"决策点 Step {req.fork_point_step} 不存在")

    agent_id = entry.get("agent_id", "")
    if not agent_id:
        raise HTTPException(409, "这条旧历史缺少 Agent 信息，请先绑定原 Agent")
    try:
        agent = await _get_or_create_agent(agent_id)
    except AgentNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except AgentRestoreError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    options = await generate_fork_options(
        agent=agent,
        task=entry.get("task", ""),
        fork_point_step=req.fork_point_step,
        decision_log=decisions,
    )
    if len(options) < 2:
        raise HTTPException(502, "候选路线生成失败，你仍可手动填写替代决策")
    return {
        "run_id": run_id,
        "fork_point_step": req.fork_point_step,
        "options": options,
    }


@router.post("/{run_id}/fork")
async def fork_worker(run_id: str, req: ForkRequest):
    """从已完成 Worker 的决策点创建分叉——返回 SSE 流。"""
    entry = _active_workers.get(run_id)
    if not entry:
        raise HTTPException(404, f"Worker {run_id!r} 不存在")

    if entry.get("running", False):
        raise HTTPException(409, "请等待原任务完成后再创建决策分叉")

    agent_id = entry.get("agent_id", "")
    if not agent_id:
        raise HTTPException(409, "这条旧历史缺少 Agent 信息，请先绑定原 Agent")

    try:
        agent = await _get_or_create_agent(agent_id)
    except AgentNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    except AgentRestoreError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    from engines.worker.fork import fork_from_checkpoint

    worker_obj: AgentWorker | None = entry.get("worker")
    base_dir = None
    if worker_obj is not None and isinstance(worker_obj._workspace, LocalWorkspace):
        from pathlib import Path
        base_dir = str(Path(worker_obj._workspace.root).parent)
    try:
        fork_run_id, fork_worker = await fork_from_checkpoint(
            original_run_id=run_id,
            fork_point_step=req.fork_point_step,
            alternative_decision=req.alternative_decision,
            agent=agent,
            task=entry["task"],
            base_dir=base_dir,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    # 注册 fork worker
    _active_workers[fork_run_id] = {
        "worker": fork_worker,
        "agent_id": entry.get("agent_id", ""),
        "agent_name": f"{entry['agent_name']} (Fork @ step {req.fork_point_step})",
        "task": f"[Fork] {entry['task'][:100]}",
        "running": True,
        "events": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    async def fork_generator():
        fork_entry = _active_workers.get(fork_run_id)
        try:
            async for event in fork_worker.execute(entry["task"]):
                yield event
                if fork_entry and fork_entry.get("events") is not None:
                    try:
                        if event.startswith("data: "):
                            fork_entry["events"].append(json.loads(event[6:]))
                    except Exception:
                        pass
        except Exception as exc:
            logger.exception(f"Fork SSE error: {exc}")
            yield f"data: {json.dumps({'type': 'worker.error', 'data': {'message': str(exc)}})}\n\n"
        finally:
            if fork_entry:
                fork_entry["running"] = False
                await _persist_worker_state(fork_entry)
                await _save_events_file(fork_entry)
            # 淘汰最旧的已完成 Worker，防止内存无限增长
            if len(_active_workers) > _MAX_ACTIVE_WORKERS:
                done = [(rid, e) for rid, e in _active_workers.items() if not e.get("running")]
                done.sort(key=lambda x: x[1].get("created_at", ""))
                for rid, _ in done[:len(done) // 2 + 1]:
                    _active_workers.pop(rid, None)

    return StreamingResponse(
        fork_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/scheduler/tasks/{task_id}")
async def delete_scheduled_task(task_id: str):
    """删除调度任务。"""
    from engines.worker.scheduler import get_scheduler
    get_scheduler().remove_task(task_id)
    return {"status": "deleted", "task_id": task_id}
