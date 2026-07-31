"""
管道编排引擎 — DAG 拓扑排序 + 层级并行执行。

设计原则:
  - 管道是 DAG——每个节点是一个 Agent 子任务。
  - 节点间通过文件传递数据，不通过消息通信。
  - 拓扑排序 → 按层级执行，同层并行（最多 3 个并发）。
  - 某节点 ERROR → 依赖它的下游全部 SKIPPED，不依赖它的继续。

Phase 25: 完整实现。
"""

import asyncio
import json
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from loguru import logger

from engines.worker.pipeline import (
    PipelineSpec,
    PipelineNodeSpec,
    PipelineStatus,
    NodeStatus,
    validate_pipeline,
    _topological_sort,
)
from engines.worker.workspace import WorkspaceProvider, LocalWorkspace
from engines.worker.coordinator import WorkspaceCoordinator, QueuedTask


# =============================================================================
# 运行状态
# =============================================================================


class PipelineRun:
    """管道运行实例——追踪每个节点的状态。"""

    def __init__(self, pipeline: PipelineSpec, workspace: WorkspaceProvider):
        self.pipeline = pipeline
        self.workspace = workspace
        self.coordinator = WorkspaceCoordinator(workspace)
        self.node_statuses: dict[str, NodeStatus] = {
            n.id: NodeStatus.PENDING for n in pipeline.nodes
        }
        self.node_workers: dict[str, object] = {}  # node_id → AgentWorker
        self.start_time: float = 0
        self._cancel_requested = False
        self._errors: list[dict] = []

    def cancel(self):
        """取消管道执行。"""
        self._cancel_requested = True
        for worker in self.node_workers.values():
            if hasattr(worker, 'cancel'):
                worker.cancel()

    @property
    def status(self) -> PipelineStatus:
        """管道整体状态。"""
        statuses = self.node_statuses.values()
        if all(s in (NodeStatus.PENDING,) for s in statuses):
            return PipelineStatus.DRAFT
        if all(s == NodeStatus.COMPLETE for s in statuses):
            return PipelineStatus.COMPLETE
        if any(s == NodeStatus.CANCELLED for s in statuses):
            return PipelineStatus.CANCELLED
        if any(s == NodeStatus.RUNNING for s in statuses):
            return PipelineStatus.RUNNING
        if any(s == NodeStatus.ERROR for s in statuses):
            return PipelineStatus.PARTIAL
        return PipelineStatus.RUNNING


# =============================================================================
# PipelineEngine
# =============================================================================


class PipelineEngine:
    """管道执行引擎——DAG 拓扑排序 + 层级并行执行。

    用法:
        engine = PipelineEngine()
        run = await engine.execute(pipeline, workspace, get_agent_fn)
        # get_agent_fn: async def get_agent_fn(agent_id) -> LifeAgent
    """

    def __init__(self, max_parallel: int = 3):
        self._max_parallel = max_parallel

    async def execute(
        self,
        pipeline: PipelineSpec,
        workspace: WorkspaceProvider,
        get_agent_fn,
    ) -> AsyncGenerator[str, None]:
        """执行管道——返回 SSE 事件生成器。

        Args:
            pipeline: 管道规格
            workspace: 共享工作区
            get_agent_fn: async fn(agent_id) → LifeAgent

        Yields:
            SSE 事件字符串
        """
        # Step 1: 验证
        valid, msg = validate_pipeline(pipeline)
        if not valid:
            yield _pipeline_event("pipeline.error", {"message": msg})
            return

        # Step 2: 创建运行实例
        run = PipelineRun(pipeline, workspace)
        run.start_time = time.monotonic()

        yield _pipeline_event("pipeline.started", {
            "pipeline_id": pipeline.id,
            "name": pipeline.name,
            "total_nodes": len(pipeline.nodes),
        })

        # Step 3: 拓扑排序 → 分级执行
        try:
            levels = _topological_sort(pipeline.nodes)
        except ValueError as e:
            yield _pipeline_event("pipeline.error", {"message": str(e)})
            return

        # 执行每一层
        for level_idx, level in enumerate(levels):
            if run._cancel_requested:
                break

            node_ids = [n.id for n in level]
            yield _pipeline_event("pipeline.level_start", {
                "level": level_idx + 1,
                "total_levels": len(levels),
                "nodes": node_ids,
            })

            # 更新状态: 该层所有节点 → RUNNING
            for node in level:
                # 检查依赖节点是否有失败
                for dep in node.depends_on:
                    if run.node_statuses.get(dep) == NodeStatus.ERROR:
                        run.node_statuses[node.id] = NodeStatus.SKIPPED
                        yield _pipeline_event("pipeline.node_status", {
                            "node_id": node.id,
                            "status": "skipped",
                            "reason": f"上游节点 '{dep}' 失败，已跳过",
                        })
                        break

            # 并行执行未跳过的节点（最多 max_parallel 个并发）
            active_nodes = [n for n in level if run.node_statuses[n.id] != NodeStatus.SKIPPED]
            semaphore = asyncio.Semaphore(self._max_parallel)

            async def run_node(node: PipelineNodeSpec):
                async with semaphore:
                    if run._cancel_requested:
                        return

                    run.node_statuses[node.id] = NodeStatus.RUNNING
                    yield _pipeline_event("pipeline.node_status", {
                        "node_id": node.id,
                        "status": "running",
                    })

                    try:
                        # 获取 Agent
                        agent = await get_agent_fn(node.agent_id)

                        # 创建 Worker（共享 workspace）
                        from engines.worker.engine import AgentWorker
                        worker = AgentWorker(agent=agent, workspace=workspace)
                        run.node_workers[node.id] = worker

                        # 执行任务
                        async for sse_event in worker.execute(node.task):
                            # 转发节点事件（加上 node_id 前缀）
                            yield _pipeline_event("pipeline.node_event", {
                                "node_id": node.id,
                                "sse": sse_event,
                            })

                        # 完成后标记
                        run.node_statuses[node.id] = NodeStatus.COMPLETE
                        yield _pipeline_event("pipeline.node_status", {
                            "node_id": node.id,
                            "status": "complete",
                        })

                    except Exception as e:
                        logger.error(f"Pipeline node '{node.id}' failed: {e}")
                        run.node_statuses[node.id] = NodeStatus.ERROR
                        run._errors.append({"node_id": node.id, "error": str(e)})
                        yield _pipeline_event("pipeline.node_status", {
                            "node_id": node.id,
                            "status": "error",
                            "error": str(e)[:200],
                        })

            # 收集该层所有节点的输出
            tasks = []
            async def collect_events(node):
                events = []
                async for ev in run_node(node):
                    events.append(ev)
                return events

            # 并行启动该层所有节点
            level_results = await asyncio.gather(
                *[collect_events(n) for n in active_nodes],
                return_exceptions=True,
            )

            # 发射该层所有事件
            for result in level_results:
                if isinstance(result, list):
                    for ev in result:
                        yield ev
                elif isinstance(result, Exception):
                    yield _pipeline_event("pipeline.error", {
                        "message": f"层 {level_idx + 1} 执行异常: {result}",
                    })

            yield _pipeline_event("pipeline.level_end", {
                "level": level_idx + 1,
                "completed": len([n for n in level if run.node_statuses[n.id] == NodeStatus.COMPLETE]),
                "skipped": len([n for n in level if run.node_statuses[n.id] == NodeStatus.SKIPPED]),
                "errors": len([n for n in level if run.node_statuses[n.id] == NodeStatus.ERROR]),
            })

        # Step 4: 完成
        total_ms = int((time.monotonic() - run.start_time) * 1000)
        node_summary = {
            nid: status.value for nid, status in run.node_statuses.items()
        }

        yield _pipeline_event("pipeline.done", {
            "pipeline_id": pipeline.id,
            "status": run.status.value,
            "nodes": node_summary,
            "errors": run._errors,
            "duration_ms": total_ms,
        })

        logger.info(f"Pipeline DONE: {pipeline.name} — {run.status.value}, {total_ms}ms")


# =============================================================================
# 辅助函数
# =============================================================================


def _pipeline_event(event_type: str, data: dict) -> str:
    """构建管道 SSE 事件。"""
    return json.dumps({
        "type": event_type,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }, ensure_ascii=False)
