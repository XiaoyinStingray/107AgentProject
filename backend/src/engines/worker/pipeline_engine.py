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
    PipelineEdge,
    PipelineStatus,
    NodeStatus,
    EdgeType,
    validate_pipeline,
    _topological_sort,
    get_flow_deps,
    get_loop_edges,
    get_branch_edges,
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
        self.node_outputs: dict[str, list[str]] = {
            n.id: [] for n in pipeline.nodes
        }
        self.node_output_files: dict[str, set[str]] = {
            n.id: set() for n in pipeline.nodes
        }
        self.start_time: float = 0
        self._cancel_requested = False
        self._errors: list[dict] = []

    def cancel(self):
        """取消管道执行。"""
        self._cancel_requested = True
        for worker in self.node_workers.values():
            if hasattr(worker, 'cancel'):
                worker.cancel()  # type: ignore[union-attr]

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

        # Step 3: 拓扑排序 → 分级执行 (Step 104: 使用 FLOW deps)
        flow_deps = get_flow_deps(pipeline.nodes, pipeline.edges)
        try:
            levels = _topological_sort(pipeline.nodes, flow_deps)
        except ValueError as e:
            yield _pipeline_event("pipeline.error", {"message": str(e)})
            return

        # Step 104: 迭代计数器（边 ID → 已循环次数）
        iteration_counts: dict[str, int] = {}
        branch_taken: set[str] = set()  # 已触发的 branch 边 ID

        # 执行每一层（支持回边动态重新入队）
        level_idx = 0
        while level_idx < len(levels):
            level = levels[level_idx]
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
                    # 回边重放时只允许本轮结果参与条件判断，避免旧的 FAILED 污染新结果。
                    run.node_outputs[node.id] = []
                    run.node_output_files[node.id] = set()
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

                        # 执行任务 (Step 105: 传递节点专属工具)
                        async for sse_event in worker.execute(
                            node.task, extra_tools=node.extra_tools,
                        ):
                            _record_node_output(run, node.id, sse_event)
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

            # ── Step 104: Loop/Branch 检查 ──
            nodes_to_replay: list[PipelineNodeSpec] = []

            for node in level:
                if run.node_statuses[node.id] not in (NodeStatus.COMPLETE, NodeStatus.ERROR):
                    continue

                # 检查 LOOP 边
                for loop_edge in get_loop_edges(pipeline.edges, node.id):
                    loop_id = loop_edge.id
                    current_iter = iteration_counts.get(loop_id, 0)
                    if current_iter >= loop_edge.max_iterations:
                        logger.warning(f"[Pipeline] Loop {loop_id}: max_iter={loop_edge.max_iterations} reached, skipping")
                        continue

                    if await _eval_condition(loop_edge, run, workspace):
                        iteration_counts[loop_id] = current_iter + 1
                        logger.info(f"[Pipeline] Loop {loop_id}: condition met, iteration {iteration_counts[loop_id]}/{loop_edge.max_iterations}")
                        nodes_to_replay.extend(
                            _path_between(pipeline.nodes, flow_deps,
                                         loop_edge.to_node, loop_edge.from_node))
                        yield _pipeline_event("pipeline.loop_triggered", {
                            "edge_id": loop_id,
                            "iteration": iteration_counts[loop_id],
                            "max_iterations": loop_edge.max_iterations,
                        })

                # 检查 BRANCH 边
                for branch_edge in get_branch_edges(pipeline.edges, node.id):
                    if branch_edge.id in branch_taken:
                        continue
                    if await _eval_condition(branch_edge, run, workspace):
                        branch_taken.add(branch_edge.id)
                        logger.info(f"[Pipeline] Branch {branch_edge.id}: condition met → {branch_edge.to_node}")
                        # 标记被 branch 绕过的节点为 SKIPPED
                        _skip_bypassed(pipeline.nodes, flow_deps, branch_edge, run)
                        yield _pipeline_event("pipeline.branch_taken", {
                            "edge_id": branch_edge.id,
                            "label": branch_edge.label,
                        })

            # 将回边触发的节点重新插入执行队列
            if nodes_to_replay:
                # 重置这些节点的状态
                for n in nodes_to_replay:
                    run.node_statuses[n.id] = NodeStatus.PENDING
                # 插入到当前位置之后
                levels.insert(level_idx + 1, nodes_to_replay)
                yield _pipeline_event("pipeline.loop_replay", {
                    "nodes": [n.id for n in nodes_to_replay],
                })

            level_idx += 1

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

        # 持久化到工作区目录
        from api.pipelines import _save_pipeline_run
        await _save_pipeline_run(pipeline.id, {
            "nodes": node_summary,
            "errors": run._errors,
            "duration_ms": total_ms,
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "node_events": _collect_node_summaries(run),
        })

        logger.info(f"Pipeline DONE: {pipeline.name} — {run.status.value}, {total_ms}ms")


# =============================================================================
# 辅助函数
# =============================================================================


def _collect_node_summaries(run) -> dict:
    """收集每个节点的摘要信息（任务、步骤数、状态）。"""
    summaries = {}
    for nid, status in run.node_statuses.items():
        node = next((n for n in run.pipeline.nodes if n.id == nid), None)
        worker = run.node_workers.get(nid)
        summaries[nid] = {
            "title": node.title if node else nid,
            "task": node.task if node else "",
            "status": status.value,
            "steps": worker._step_index if worker and hasattr(worker, '_step_index') else 0,
        }
    return summaries


def _pipeline_event(event_type: str, data: dict) -> str:
    """构建管道 SSE 事件。"""
    import json as _j
    return _j.dumps({
        "type": event_type,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }, ensure_ascii=False)


# ── Step 104: Loop/Branch 辅助函数 ──


async def _eval_condition(edge: PipelineEdge, run, workspace=None) -> bool:
    """评估边的触发条件。

    从已完成节点的输出 + workspace 文件中检查条件:
    - 简单模式: "FAILED" → 检查 from_node 输出/文件是否包含 FAILED
    - 数值模式: "score < 0.7" → 从 workspace 文件提取 score 值
    - 正则模式: "/error|失败/" → 匹配输出内容
    无条件 → 默认 True
    """
    if not edge.condition:
        return True

    cond = edge.condition.strip()
    output = await _get_node_output(
        run,
        edge.from_node,
        workspace,
        condition_field=edge.condition_field,
    )

    # 正则模式: /pattern/
    if cond.startswith("/") and cond.endswith("/"):
        import re
        pattern = cond[1:-1]
        return bool(re.search(pattern, output))

    # 数值模式: field op value
    import re as _re
    num_match = _re.match(r'(\w+)\s*([<>=!]+)\s*([\d.]+)', cond)
    if num_match:
        field = num_match.group(1)
        op = num_match.group(2)
        target = float(num_match.group(3))
        actual = _extract_field_value(output, field)
        if actual is None:
            return False
        if op == '<': return actual < target
        if op == '>': return actual > target
        if op == '<=': return actual <= target
        if op == '>=': return actual >= target
        if op in ('==', '='): return actual == target
        if op == '!=': return actual != target

    # 简单模式: 检查输出 + workspace 文件是否包含关键词
    return cond.lower() in output.lower()


def _record_node_output(run, node_id: str, sse_event: str) -> None:
    """记录本轮 Worker 事件，并提取事件中声明的产出文件。"""
    run.node_outputs.setdefault(node_id, []).append(sse_event)
    try:
        event = json.loads(sse_event)
        data = event.get("data") or {}
        files = data.get("files") or []
        for item in files:
            path = item.get("path") if isinstance(item, dict) else item
            if isinstance(path, str) and path.strip():
                run.node_output_files.setdefault(node_id, set()).add(path.strip())
    except (TypeError, ValueError, json.JSONDecodeError):
        # 非 JSON 事件仍作为文本参与判断，但不会用于发现文件。
        pass


async def _get_node_output(
    run,
    node_id: str,
    workspace=None,
    condition_field: str | None = None,
) -> str:
    """收集本轮真实事件和产出文件；不读取任务描述，避免条件误触发。"""
    parts = []
    # 显式指定结果文件时只信该文件；否则才回退到错误与 Worker 事件。
    if not condition_field:
        for err in run._errors:
            if err.get("node_id") == node_id:
                parts.append(err.get("error", ""))
        parts.extend(run.node_outputs.get(node_id, []))

    # condition_field 是显式结果文件；未设置时读取节点声明和事件报告的产物。
    if workspace:
        try:
            node = next((n for n in run.pipeline.nodes if n.id == node_id), None)
            filenames = [condition_field] if condition_field else [
                *(node.produces if node else []),
                *sorted(run.node_output_files.get(node_id, set())),
            ]
            seen: set[str] = set()
            for filename in filenames:
                if not filename or filename in seen:
                    continue
                seen.add(filename)
                try:
                    content = await workspace.read_file(filename)
                    if content:
                        parts.append(str(content)[:8000])
                except Exception as exc:
                    logger.warning(
                        f"[Pipeline] condition output unavailable: "
                        f"node={node_id}, file={filename}, error={exc}"
                    )
        except Exception:
            pass
    return " ".join(parts)


def _extract_field_value(output: str, field: str) -> float | None:
    """从已收集的节点输出中提取数值字段（如 score、count）。"""
    import re
    for pat in [rf'{field}["\s:=]+([\d.]+)', rf'{field}\s*=\s*([\d.]+)']:
        m = re.search(pat, output, re.IGNORECASE)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                pass
    return None


def _path_between(
    nodes: list[PipelineNodeSpec],
    flow_deps: dict[str, set[str]],
    from_id: str,
    to_id: str,
) -> list[PipelineNodeSpec]:
    """找出 from_id → to_id 路径上的所有节点（含两端）。"""
    node_map = {n.id: n for n in nodes}
    result = []
    current = to_id
    visited = set()
    while current != from_id and current not in visited:
        visited.add(current)
        node = node_map.get(current)
        if node:
            result.append(node)
        # Fix: flow_deps[current] = current 依赖的上游节点；从 to_id 向 from_id 回溯
        upstream = list(flow_deps.get(current, set()))
        current = upstream[0] if upstream else current
    # 加上 from 节点
    if from_node := node_map.get(from_id):
        result.append(from_node)
    result.reverse()
    return result


def _skip_bypassed(
    nodes: list[PipelineNodeSpec],
    flow_deps: dict[str, set[str]],
    branch_edge: PipelineEdge,
    run,
):
    """标记从 branch 起点到目标之间被绕过的节点为 SKIPPED。

    被绕过的节点 = from_node 的下游中、不在 to_node 路径上的节点。
    """
    from_id = branch_edge.from_node
    to_id = branch_edge.to_node

    # 找出 to_node 的所有上游（反向 BFS）
    reachable_from_to = {to_id}
    queue = [to_id]
    while queue:
        nid = queue.pop(0)
        for dep_id, deps in flow_deps.items():
            if nid in deps and dep_id not in reachable_from_to:
                reachable_from_to.add(dep_id)
                queue.append(dep_id)

    # Fix: 递归标记 from_node 的所有下游中、不在 to_node 路径上的节点（包括孙子节点）
    bypassed = set()
    # 从 from_node 出发 BFS 找所有下游
    downstream_queue = [
        nid for nid, deps in flow_deps.items() if from_id in deps
    ]
    while downstream_queue:
        nid = downstream_queue.pop(0)
        if nid in reachable_from_to or nid in bypassed or nid == from_id:
            continue
        bypassed.add(nid)
        # 添加此节点的下游
        for child_id, child_deps in flow_deps.items():
            if nid in child_deps and child_id not in bypassed:
                downstream_queue.append(child_id)

    for nid in bypassed:
        if run.node_statuses.get(nid) == NodeStatus.PENDING:
            run.node_statuses[nid] = NodeStatus.SKIPPED
