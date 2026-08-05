"""Step T12: WorkspaceCoordinator 单元测试 — 真实文件系统 + asyncio.Lock。

覆盖:
  - FileLockManager: 获取/释放锁、超时、并发排队、路径归一化
  - TaskQueue: submit/claim/complete/list/any_pending
  - DependencyWaiter: 空列表、文件已存在、等待创建、超时、.lock 检查
  - WorkspaceCoordinator: 组合接口
"""

import asyncio
import json
import os
import shutil
from pathlib import Path

import pytest

from engines.worker.workspace import LocalWorkspace
from engines.worker.coordinator import (
    DependencyWaiter,
    FileLockManager,
    QueuedTask,
    TaskQueue,
    WorkspaceCoordinator,
)


def _run(coro):
    """异步运行辅助。"""
    return asyncio.run(coro)


@pytest.fixture
def workspace(tmp_path):
    """创建临时 LocalWorkspace。"""
    return LocalWorkspace(str(tmp_path), "test-run")


# =============================================================================
# FileLockManager
# =============================================================================


class TestFileLockManager:
    """文件锁管理器测试。"""

    def test_lock_returns_asyncio_lock(self):
        """lock() 返回 asyncio.Lock 实例。"""
        mgr = FileLockManager()
        lock = mgr.lock("report.md")
        assert isinstance(lock, asyncio.Lock)

    def test_same_path_same_lock(self):
        """同一路径返回同一个锁实例。"""
        mgr = FileLockManager()
        lock1 = mgr.lock("report.md")
        lock2 = mgr.lock("report.md")
        assert lock1 is lock2

    def test_different_path_different_lock(self):
        """不同路径返回不同锁实例。"""
        mgr = FileLockManager()
        lock1 = mgr.lock("a.md")
        lock2 = mgr.lock("b.md")
        assert lock1 is not lock2

    def test_path_normalization(self):
        """路径归一化：反斜杠转正斜杠。"""
        mgr = FileLockManager()
        lock1 = mgr.lock("data\\report.md")
        lock2 = mgr.lock("data/report.md")
        assert lock1 is lock2

    def test_try_lock_success(self):
        """try_lock 成功获取锁。"""
        mgr = FileLockManager()
        result = _run(mgr.try_lock("report.md", timeout=1.0))
        assert result is True
        # 清理
        mgr.unlock("report.md")

    def test_try_lock_timeout(self):
        """try_lock 超时返回 False。"""
        mgr = FileLockManager()

        async def _test():
            # 先获取锁
            lock = mgr.lock("report.md")
            await lock.acquire()
            # 再次 try_lock 应超时
            result = await mgr.try_lock("report.md", timeout=0.1)
            assert result is False
            # 清理
            lock.release()

        _run(_test())

    def test_unlock_releases_lock(self):
        """unlock 释放锁后其他协程可获取。"""
        mgr = FileLockManager()

        async def _test():
            lock = mgr.lock("report.md")
            await lock.acquire()
            assert lock.locked()
            mgr.unlock("report.md")
            assert not lock.locked()

        _run(_test())

    def test_unlock_nonexistent_path_no_error(self):
        """unlock 不存在的路径不报错。"""
        mgr = FileLockManager()
        mgr.unlock("nonexistent.md")  # 不抛异常

    def test_concurrent_writes_serialized(self):
        """并发写同一文件被序列化。"""
        mgr = FileLockManager()
        results = []

        async def writer(name, delay=0.05):
            async with mgr.lock("shared.md"):
                results.append(f"{name}_start")
                await asyncio.sleep(delay)
                results.append(f"{name}_end")

        async def _test():
            await asyncio.gather(
                writer("A", 0.05),
                writer("B", 0.05),
            )

        _run(_test())
        # 4 个事件：两个 start + 两个 end
        assert len(results) == 4
        # 序列化意味着第一个 writer 的 end 在第二个 start 之前
        # 即 results 应该是 [X_start, X_end, Y_start, Y_end]
        assert results[0].endswith("_start")
        assert results[1].endswith("_end")
        assert results[2].endswith("_start")
        assert results[3].endswith("_end")
        # 第一个和第二个必须是不同的 writer
        assert results[0][:1] != results[2][:1]


# =============================================================================
# TaskQueue
# =============================================================================


class TestTaskQueue:
    """任务队列测试。"""

    def test_submit_creates_pending_file(self, workspace):
        """submit 在 .tasks/pending/ 创建 JSON 文件。"""
        tq = TaskQueue(workspace)
        task = QueuedTask(id="t1", title="搜索", agent_id="a1")

        async def _test():
            task_id = await tq.submit(task)
            assert task_id == "t1"
            content = await workspace.read_file(".tasks/pending/t1.json")
            data = json.loads(content)
            assert data["id"] == "t1"
            assert data["status"] == "pending"
            assert data["title"] == "搜索"

        _run(_test())

    def test_claim_moves_to_claimed(self, workspace):
        """claim 将任务从 pending 移到 claimed。"""
        tq = TaskQueue(workspace)
        task = QueuedTask(id="t1", title="搜索", agent_id="a1")

        async def _test():
            await tq.submit(task)
            result = await tq.claim("t1", "agent-x")
            assert result is not None
            assert result["status"] == "claimed"
            assert result["claimed_by"] == "agent-x"
            # pending 文件应被删除
            assert not await workspace.exists(".tasks/pending/t1.json")
            # claimed 文件应存在（注意：TaskQueue 的路径不经过 files/）

        _run(_test())

    def test_claim_nonexistent_returns_none(self, workspace):
        """claim 不存在的任务返回 None。"""
        tq = TaskQueue(workspace)

        async def _test():
            result = await tq.claim("nonexistent", "agent-x")
            assert result is None

        _run(_test())

    def test_complete_moves_to_done(self, workspace):
        """complete 将任务从 claimed 移到 done。"""
        tq = TaskQueue(workspace)
        task = QueuedTask(id="t1", title="搜索", agent_id="a1")

        async def _test():
            await tq.submit(task)
            await tq.claim("t1", "agent-x")
            result = await tq.complete("t1")
            assert result is True

        _run(_test())

    def test_complete_nonexistent_returns_false(self, workspace):
        """complete 不存在的任务返回 False。"""
        tq = TaskQueue(workspace)

        async def _test():
            result = await tq.complete("nonexistent")
            assert result is False

        _run(_test())

    def test_list_pending(self, workspace):
        """list_pending 返回所有待处理任务。"""
        tq = TaskQueue(workspace)

        async def _test():
            await tq.submit(QueuedTask(id="t1", title="任务1", agent_id="a1"))
            await tq.submit(QueuedTask(id="t2", title="任务2", agent_id="a2"))
            pending = await tq.list_pending()
            assert len(pending) == 2
            ids = {t["id"] for t in pending}
            assert ids == {"t1", "t2"}

        _run(_test())

    def test_list_pending_empty(self, workspace):
        """list_pending 空队列返回空列表。"""
        tq = TaskQueue(workspace)

        async def _test():
            pending = await tq.list_pending()
            assert pending == []

        _run(_test())

    def test_list_claimed(self, workspace):
        """list_claimed 返回已认领任务。"""
        tq = TaskQueue(workspace)

        async def _test():
            await tq.submit(QueuedTask(id="t1", title="任务1", agent_id="a1"))
            await tq.claim("t1", "agent-x")
            claimed = await tq.list_claimed()
            assert len(claimed) == 1
            assert claimed[0]["id"] == "t1"

        _run(_test())

    def test_any_pending_true(self, workspace):
        """any_pending 有任务时返回 True。"""
        tq = TaskQueue(workspace)

        async def _test():
            await tq.submit(QueuedTask(id="t1", title="任务1", agent_id="a1"))
            assert await tq.any_pending() is True

        _run(_test())

    def test_any_pending_false(self, workspace):
        """any_pending 无任务时返回 False。"""
        tq = TaskQueue(workspace)

        async def _test():
            assert await tq.any_pending() is False

        _run(_test())

    def test_submit_with_depends_on(self, workspace):
        """submit 支持 depends_on 字段。"""
        tq = TaskQueue(workspace)
        task = QueuedTask(id="t2", title="分析", agent_id="a1", depends_on=["t1"])

        async def _test():
            await tq.submit(task)
            pending = await tq.list_pending()
            assert len(pending) == 1
            assert pending[0]["depends_on"] == ["t1"]

        _run(_test())


# =============================================================================
# DependencyWaiter
# =============================================================================


class TestDependencyWaiter:
    """依赖等待器测试。"""

    def test_empty_list_returns_true(self, workspace):
        """空列表立即返回 True。"""
        waiter = DependencyWaiter(workspace)

        async def _test():
            result = await waiter.wait_for_files([])
            assert result is True

        _run(_test())

    def test_existing_file_returns_true(self, workspace):
        """文件已存在时立即返回 True。"""
        waiter = DependencyWaiter(workspace)

        async def _test():
            await workspace.write_file("data.txt", "hello")
            result = await waiter.wait_for_files(["data.txt"], timeout=2.0)
            assert result is True

        _run(_test())

    def test_wait_for_file_creation(self, workspace):
        """等待文件被创建后返回 True。"""
        waiter = DependencyWaiter(workspace)

        async def _test():
            async def create_file_later():
                await asyncio.sleep(0.2)
                await workspace.write_file("delayed.txt", "content")

            asyncio.create_task(create_file_later())
            result = await waiter.wait_for_files(
                ["delayed.txt"], timeout=5.0, poll_interval=0.1
            )
            assert result is True

        _run(_test())

    def test_timeout_returns_false(self, workspace):
        """超时返回 False。"""
        waiter = DependencyWaiter(workspace)

        async def _test():
            result = await waiter.wait_for_files(
                ["nonexistent.txt"], timeout=0.3, poll_interval=0.1
            )
            assert result is False

        _run(_test())

    def test_lock_file_blocks_readiness(self, workspace):
        """存在 .lock 文件时文件不算就绪。"""
        waiter = DependencyWaiter(workspace)

        async def _test():
            await workspace.write_file("data.txt", "hello")
            await workspace.write_file("data.txt.lock", "locked")
            # .lock 存在 → 文件不算就绪 → 超时
            result = await waiter.wait_for_files(
                ["data.txt"], timeout=0.3, poll_interval=0.1
            )
            assert result is False

        _run(_test())

    def test_multiple_files_all_must_exist(self, workspace):
        """多个文件必须全部存在才返回 True。"""
        waiter = DependencyWaiter(workspace)

        async def _test():
            await workspace.write_file("a.txt", "a")
            await workspace.write_file("b.txt", "b")
            result = await waiter.wait_for_files(
                ["a.txt", "b.txt"], timeout=2.0, poll_interval=0.1
            )
            assert result is True

        _run(_test())

    def test_multiple_files_partial_missing(self, workspace):
        """部分文件缺失时超时。"""
        waiter = DependencyWaiter(workspace)

        async def _test():
            await workspace.write_file("a.txt", "a")
            result = await waiter.wait_for_files(
                ["a.txt", "missing.txt"], timeout=0.3, poll_interval=0.1
            )
            assert result is False

        _run(_test())


# =============================================================================
# WorkspaceCoordinator — 组合接口
# =============================================================================


class TestWorkspaceCoordinator:
    """WorkspaceCoordinator 组合接口测试。"""

    def test_lock_and_unlock(self, workspace):
        """lock/unlock 正常工作。"""
        coord = WorkspaceCoordinator(workspace)

        async def _test():
            acquired = await coord.lock("report.md")
            assert acquired is True
            coord.unlock("report.md")

        _run(_test())

    def test_lock_timeout(self, workspace):
        """lock 超时返回 False。"""
        coord = WorkspaceCoordinator(workspace)

        async def _test():
            # 先获取锁
            await coord._lock_mgr.lock("report.md").acquire()
            result = await coord.lock("report.md", timeout=0.1)
            assert result is False
            coord._lock_mgr.lock("report.md").release()

        _run(_test())

    def test_submit_claim_complete_task(self, workspace):
        """完整任务生命周期：submit → claim → complete。"""
        coord = WorkspaceCoordinator(workspace)
        task = QueuedTask(id="t1", title="搜索", agent_id="a1")

        async def _test():
            task_id = await coord.submit_task(task)
            assert task_id == "t1"
            assert await coord.has_pending_tasks() is True

            claimed = await coord.claim_task("t1", "agent-x")
            assert claimed is not None
            assert claimed["status"] == "claimed"

            result = await coord.complete_task("t1")
            assert result is True

        _run(_test())

    def test_wait_for_files(self, workspace):
        """wait_for_files 委托给 DependencyWaiter。"""
        coord = WorkspaceCoordinator(workspace)

        async def _test():
            await workspace.write_file("output.md", "result")
            result = await coord.wait_for_files(["output.md"], timeout=2.0)
            assert result is True

        _run(_test())

    def test_has_pending_tasks_false_when_empty(self, workspace):
        """无任务时 has_pending_tasks 返回 False。"""
        coord = WorkspaceCoordinator(workspace)

        async def _test():
            assert await coord.has_pending_tasks() is False

        _run(_test())
