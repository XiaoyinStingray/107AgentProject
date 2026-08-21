"""
自主调度器 — Cron 定时 + 文件监视 + 自动触发 Worker 任务。

用法:
    scheduler = WorkerScheduler()
    await scheduler.start()
    # ... FastAPI lifespan ...
    await scheduler.stop()

Phase 26: 完整实现。
"""

import asyncio
import json
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger

from engines.worker.engine import AgentWorker
from engines.worker.workspace import LocalWorkspace, WorkspaceProvider


# =============================================================================
# 调度任务定义
# =============================================================================


@dataclass
class ScheduledTask:
    """一个定时/监视任务。"""
    id: str
    name: str
    agent_id: str
    task: str
    trigger_type: str  # "cron" | "file_watch" | "once"
    cron_expr: str = ""  # "daily 08:00" / "hourly" / "every 30 minutes"
    watch_dir: str = ""  # 文件监视目录（trigger_type=file_watch 时）
    file_pattern: str = "*"  # 文件匹配模式
    enabled: bool = True
    last_run: str = ""
    run_count: int = 0


# =============================================================================
# WorkerScheduler
# =============================================================================


class WorkerScheduler:
    """自主调度器——Cron + 文件监视器 + check_in。

    在 FastAPI lifespan 中启动，作为后台任务运行。
    """

    def __init__(self, base_dir: str | None = None):
        self._base_dir = base_dir or str(Path.home() / "workspaces")
        self._tasks: list[ScheduledTask] = []
        self._running = False
        self._watchers: dict[str, dict] = {}  # watch_dir → {mtime, ...}
        self._check_interval = 30  # 检查间隔秒数

    # ── 任务管理 ──

    def add_task(self, task: ScheduledTask):
        """添加调度任务。"""
        self._tasks.append(task)
        logger.info(f"[Scheduler] task added: {task.name} ({task.trigger_type})")

    def remove_task(self, task_id: str):
        """移除调度任务。"""
        self._tasks = [t for t in self._tasks if t.id != task_id]

    def list_tasks(self) -> list[ScheduledTask]:
        """列出所有调度任务。"""
        return list(self._tasks)

    # ── 生命周期 ──

    async def start(self):
        """启动调度器。"""
        self._running = True
        logger.info(f"[Scheduler] started with {len(self._tasks)} tasks, "
                     f"check interval: {self._check_interval}s")
        asyncio.create_task(self._loop())

    async def stop(self):
        """停止调度器。"""
        self._running = False
        logger.info("[Scheduler] stopped")

    # ── 主循环 ──

    async def _loop(self):
        """主调度循环——定期检查所有任务。"""
        while self._running:
            try:
                await self._check_all_tasks()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[Scheduler] loop error: {e}")
            try:
                await asyncio.sleep(self._check_interval)
            except asyncio.CancelledError:
                break
            except RuntimeError:
                # Event loop closed during shutdown
                break

    async def _check_all_tasks(self):
        """检查所有任务是否需要触发。"""
        now = datetime.now(timezone.utc)

        for task in self._tasks:
            if not task.enabled:
                continue

            try:
                if task.trigger_type == "cron":
                    if self._should_run_cron(task, now):
                        await self._execute_task(task)
                elif task.trigger_type == "file_watch":
                    if await self._check_file_watch(task):
                        await self._execute_task(task)
                elif task.trigger_type == "once":
                    # 一次性任务：立即执行然后禁用
                    await self._execute_task(task)
                    task.enabled = False
            except Exception as e:
                logger.error(f"[Scheduler] task '{task.name}' check failed: {e}")

    # ── Cron 检查 ──

    def _should_run_cron(self, task: ScheduledTask, now: datetime) -> bool:
        """检查 Cron 任务是否该运行。

        支持的格式:
            - "daily 08:00" → 每天 8:00
            - "hourly" → 每小时
            - "every N minutes" → 每 N 分钟
        """
        cron = task.cron_expr.strip()

        if cron.startswith("daily "):
            # "daily 08:00"
            target_time = cron[6:].strip()  # "08:00"
            current_time = now.strftime("%H:%M")
            if current_time == target_time:
                # 检查是否已经运行过（避免同一分钟多次触发）
                if task.last_run:
                    last = datetime.fromisoformat(task.last_run)
                    if last.date() == now.date():
                        return False
                return True

        elif cron == "hourly":
            if task.last_run:
                last = datetime.fromisoformat(task.last_run)
                if (now - last).total_seconds() < 3600:
                    return False
            return True

        elif cron.startswith("every "):
            # "every 30 minutes" / "every 2 hours"
            parts = cron.split()
            if len(parts) >= 3:
                try:
                    n = int(parts[1])
                    unit = parts[2]
                    seconds = {"minute": 60, "minutes": 60, "hour": 3600, "hours": 3600}.get(unit, 3600)
                    if task.last_run:
                        last = datetime.fromisoformat(task.last_run)
                        if (now - last).total_seconds() < n * seconds:
                            return False
                    return True
                except ValueError:
                    return False

        return False

    # ── 文件监视 ──

    async def _check_file_watch(self, task: ScheduledTask) -> bool:
        """检查监视目录是否有新文件或变更。"""
        if not task.watch_dir:
            return False

        watch_path = Path(task.watch_dir)
        if not watch_path.exists():
            return False

        # 获取目录状态（修改时间）
        try:
            current_mtime = os.path.getmtime(watch_path)
        except OSError:
            return False

        watcher_key = f"{task.id}:{task.watch_dir}"
        if watcher_key not in self._watchers:
            self._watchers[watcher_key] = {"mtime": 0, "files": set()}

        watcher = self._watchers[watcher_key]

        # 检查目录修改时间是否有变化
        if current_mtime > watcher["mtime"]:
            watcher["mtime"] = current_mtime

            # 检查是否有新文件
            current_files = set()
            import fnmatch
            for p in watch_path.rglob(task.file_pattern or "*"):
                if p.is_file():
                    current_files.add(str(p))

            new_files = current_files - watcher.get("files", set())
            if new_files:
                logger.info(f"[Scheduler] new files detected: {new_files}")
                watcher["files"] = current_files
                return True

            watcher["files"] = current_files

        return False

    # ── 任务执行 ──

    async def _execute_task(self, task: ScheduledTask):
        """执行调度任务——创建 Worker 并运行。"""
        logger.info(f"[Scheduler] executing: {task.name} — {task.task[:80]}")

        run_id = f"sched-{task.id}-{int(time.time())}"
        workspace = LocalWorkspace(self._base_dir, run_id)

        # 获取 Agent（从活跃注册表或创建新 Agent）
        try:
            from api.workers import _get_or_create_agent
            agent = await _get_or_create_agent(task.agent_id)
        except Exception as e:
            logger.error(f"[Scheduler] failed to create agent: {e}")
            return

        worker = AgentWorker(agent=agent, workspace=workspace)

        try:
            events = []
            async for event in worker.execute(task.task):
                events.append(event)
            task.run_count += 1
            task.last_run = datetime.now(timezone.utc).isoformat()
            logger.info(f"[Scheduler] task '{task.name}' completed: "
                         f"{len(events)} events, {worker._step_index} steps")
        except Exception as e:
            logger.error(f"[Scheduler] task '{task.name}' failed: {e}")


# =============================================================================
# 单例（FastAPI lifespan 使用）
# =============================================================================

_scheduler: WorkerScheduler | None = None


def get_scheduler() -> WorkerScheduler:
    """获取全局调度器单例。"""
    global _scheduler
    if _scheduler is None:
        _scheduler = WorkerScheduler()
    return _scheduler
