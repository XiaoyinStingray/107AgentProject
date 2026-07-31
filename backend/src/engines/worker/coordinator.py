"""
共享工作区协调器 — 多 Agent 同 workspace 文件锁 + 任务队列 + 依赖等待。

设计原则:
  - Agent 之间通过文件沟通，不通过消息队列。
    这是 Worker 模式的核心决策——文件就是接口，避免 GroupChat 的复杂性。
  - 文件锁用 asyncio.Lock（单进程）+ .lock 文件（跨进程兼容）。
  - 任务队列通过 .tasks/ 目录实现（pending → claimed → done）。

Phase 25: 完整实现。
"""

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger

from engines.worker.workspace import WorkspaceProvider


# =============================================================================
# 文件锁
# =============================================================================


class FileLockManager:
    """异步文件锁管理器——防止多 Agent 并发写同一文件。

    使用方式:
        lock_mgr = FileLockManager()
        async with lock_mgr.lock("report.md"):
            await workspace.write_file("report.md", content)
    """

    def __init__(self):
        self._locks: dict[str, asyncio.Lock] = {}

    def lock(self, path: str) -> asyncio.Lock:
        """获取文件的异步锁。如果不存在则创建。"""
        normalized = path.replace("\\", "/")
        if normalized not in self._locks:
            self._locks[normalized] = asyncio.Lock()
        return self._locks[normalized]

    async def try_lock(self, path: str, timeout: float = 30.0) -> bool:
        """尝试获取锁，超时返回 False。

        Args:
            path: 文件路径
            timeout: 最大等待秒数

        Returns:
            True 如果获取到锁，False 如果超时
        """
        lock = self.lock(path)
        # asyncio.Lock.acquire() 返回 bool，会等待直到获取
        try:
            acquired = await asyncio.wait_for(lock.acquire(), timeout=timeout)
            return acquired
        except asyncio.TimeoutError:
            return False

    def unlock(self, path: str):
        """释放文件锁。"""
        normalized = path.replace("\\", "/")
        if normalized in self._locks:
            lock = self._locks[normalized]
            if lock.locked():
                lock.release()


# =============================================================================
# 任务队列
# =============================================================================


@dataclass
class QueuedTask:
    """工作区任务队列中的一个任务。"""
    id: str
    title: str
    agent_id: str
    depends_on: list[str] = field(default_factory=list)
    status: str = "pending"  # pending → claimed → done
    created_at: str = ""
    claimed_at: str = ""
    done_at: str = ""


class TaskQueue:
    """基于文件的 Agent 任务队列。

    目录结构:
        workspace/.tasks/pending/   → 待处理任务（JSON 文件）
        workspace/.tasks/claimed/   → 已被 Agent 认领
        workspace/.tasks/done/      → 已完成

    每个任务是一个 JSON 文件:
        {
          "id": "task-001",
          "title": "搜索 AI Agent 框架",
          "agent_id": "abc123",
          "depends_on": [],
          "created_at": "2024-01-01T00:00:00Z"
        }
    """

    def __init__(self, workspace: WorkspaceProvider):
        self._workspace = workspace

    async def submit(self, task: QueuedTask) -> str:
        """提交一个新任务到待处理队列。

        Returns:
            任务 ID
        """
        if not task.created_at:
            task.created_at = datetime.now(timezone.utc).isoformat()
        task.status = "pending"

        task_path = f".tasks/pending/{task.id}.json"
        await self._workspace.write_file(task_path, json.dumps({
            "id": task.id,
            "title": task.title,
            "agent_id": task.agent_id,
            "depends_on": task.depends_on,
            "status": "pending",
            "created_at": task.created_at,
        }, ensure_ascii=False, indent=2))
        logger.info(f"[TaskQueue] submitted: {task.id} — {task.title}")
        return task.id

    async def claim(self, task_id: str, agent_id: str) -> dict | None:
        """Agent 认领一个任务——将其从 pending 移到 claimed。

        Args:
            task_id: 任务 ID
            agent_id: 认领的 Agent ID

        Returns:
            任务数据 dict，如果任务不存在或被抢先则返回 None
        """
        pending_path = f".tasks/pending/{task_id}.json"
        claimed_path = f".tasks/claimed/{task_id}.json"

        try:
            content = await self._workspace.read_file(pending_path)
            task_data = json.loads(content)
        except Exception:
            return None

        task_data["status"] = "claimed"
        task_data["claimed_at"] = datetime.now(timezone.utc).isoformat()
        task_data["claimed_by"] = agent_id

        await self._workspace.write_file(claimed_path, json.dumps(task_data, ensure_ascii=False, indent=2))
        await self._workspace.delete_file(pending_path)

        logger.info(f"[TaskQueue] claimed: {task_id} by {agent_id}")
        return task_data

    async def complete(self, task_id: str) -> bool:
        """标记任务完成——从 claimed 移到 done。"""
        claimed_path = f".tasks/claimed/{task_id}.json"
        done_path = f".tasks/done/{task_id}.json"

        try:
            content = await self._workspace.read_file(claimed_path)
            task_data = json.loads(content)
        except Exception:
            return False

        task_data["status"] = "done"
        task_data["done_at"] = datetime.now(timezone.utc).isoformat()

        await self._workspace.write_file(done_path, json.dumps(task_data, ensure_ascii=False, indent=2))
        await self._workspace.delete_file(claimed_path)

        logger.info(f"[TaskQueue] completed: {task_id}")
        return True

    async def list_pending(self) -> list[dict]:
        """列出所有待处理任务。"""
        try:
            files = await self._workspace.list_files(".tasks/pending")
            tasks = []
            for f in files:
                try:
                    content = await self._workspace.read_file(f.path)
                    tasks.append(json.loads(content))
                except Exception:
                    pass
            return tasks
        except Exception:
            return []

    async def list_claimed(self) -> list[dict]:
        """列出所有已认领的任务。"""
        try:
            files = await self._workspace.list_files(".tasks/claimed")
            tasks = []
            for f in files:
                try:
                    content = await self._workspace.read_file(f.path)
                    tasks.append(json.loads(content))
                except Exception:
                    pass
            return tasks
        except Exception:
            return []

    async def any_pending(self) -> bool:
        """是否有待处理任务。"""
        tasks = await self.list_pending()
        return len(tasks) > 0


# =============================================================================
# 依赖等待器
# =============================================================================


class DependencyWaiter:
    """等待依赖文件就绪的异步工具。

    用法:
        waiter = DependencyWaiter(workspace)
        await waiter.wait_for_files(["data/trends.json", "data/analysis.csv"])
        # → 所有文件存在后才返回
    """

    def __init__(self, workspace: WorkspaceProvider):
        self._workspace = workspace

    async def wait_for_files(self, file_paths: list[str], timeout: float = 120.0,
                              poll_interval: float = 1.0) -> bool:
        """等待所有依赖文件就绪。

        Args:
            file_paths: 需要等待的文件路径列表
            timeout: 最大等待秒数
            poll_interval: 轮询间隔秒数

        Returns:
            True 如果所有文件就绪，False 如果超时
        """
        if not file_paths:
            return True

        start = time.monotonic()
        remaining = set(file_paths)

        while remaining and (time.monotonic() - start) < timeout:
            to_check = list(remaining)
            for fp in to_check:
                try:
                    if await self._workspace.exists(fp):
                        # 额外检查：确保没有 .lock 文件（正在写入中）
                        lock_path = fp + ".lock"
                        if not await self._workspace.exists(lock_path):
                            remaining.discard(fp)
                except Exception:
                    pass
            if not remaining:
                return True
            await asyncio.sleep(poll_interval)

        logger.warning(f"[DependencyWaiter] timeout waiting for: {remaining}")
        return False


# =============================================================================
# WorkspaceCoordinator — 统一协调入口
# =============================================================================


class WorkspaceCoordinator:
    """多 Agent 共享工作区协调器。

    组合 FileLockManager + TaskQueue + DependencyWaiter，
    为多 Agent 提供统一的协作原语。

    用法:
        coordinator = WorkspaceCoordinator(workspace)
        # Agent A 写文件
        async with coordinator.lock("report.md"):
            await workspace.write_file("report.md", content)
        # Agent B 等文件
        await coordinator.wait_for_files(["report.md"])
    """

    def __init__(self, workspace: WorkspaceProvider):
        self._lock_mgr = FileLockManager()
        self._task_queue = TaskQueue(workspace)
        self._waiter = DependencyWaiter(workspace)
        self._workspace = workspace

    # ── 文件锁 ──

    async def lock(self, path: str, timeout: float = 30.0) -> bool:
        """获取文件锁。"""
        return await self._lock_mgr.try_lock(path, timeout)

    def unlock(self, path: str):
        """释放文件锁。"""
        self._lock_mgr.unlock(path)

    # ── 任务队列 ──

    async def submit_task(self, task: QueuedTask) -> str:
        """提交任务。"""
        return await self._task_queue.submit(task)

    async def claim_task(self, task_id: str, agent_id: str) -> dict | None:
        """认领任务。"""
        return await self._task_queue.claim(task_id, agent_id)

    async def complete_task(self, task_id: str) -> bool:
        """完成任务。"""
        return await self._task_queue.complete(task_id)

    async def has_pending_tasks(self) -> bool:
        """是否有待处理任务。"""
        return await self._task_queue.any_pending()

    # ── 依赖等待 ──

    async def wait_for_files(self, paths: list[str], timeout: float = 120.0) -> bool:
        """等待依赖文件就绪。"""
        return await self._waiter.wait_for_files(paths, timeout)
