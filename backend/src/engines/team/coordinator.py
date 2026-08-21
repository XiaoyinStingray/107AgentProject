"""
Team 步骤调度器 — 拓扑排序 + 依赖等待 + Worker 生命周期管理。

不依赖 WorldEngine。只做纯调度逻辑。
"""

import asyncio
from collections import deque
from loguru import logger


def topological_order(steps: list[dict]) -> list[list[dict]]:
    """将步骤按依赖关系分批——同一批可并行执行。

    如果步骤没有 depends_on 字段，按原始顺序串行。

    Args:
        steps: [{id, title, depends_on: [step_id, ...], ...}]

    Returns:
        [[batch_0_steps], [batch_1_steps], ...] — 批内可并行
    """
    if not steps:
        return []

    # 检查是否有依赖信息
    has_deps = any(s.get("depends_on") for s in steps)

    if not has_deps:
        # 无依赖——串行执行（每批一个）
        return [[s] for s in steps]

    # 构建依赖图
    step_map = {s["id"]: s for s in steps}
    in_degree: dict[str, int] = {s["id"]: 0 for s in steps}
    children: dict[str, list[str]] = {s["id"]: [] for s in steps}

    for s in steps:
        for dep_id in s.get("depends_on", []):
            if dep_id in step_map:
                in_degree[s["id"]] += 1
                children.setdefault(dep_id, []).append(s["id"])

    # Kahn 算法分批
    queue = deque([sid for sid, deg in in_degree.items() if deg == 0])
    batches: list[list[dict]] = []

    while queue:
        batch: list[dict] = []
        for _ in range(len(queue)):
            sid = queue.popleft()
            batch.append(step_map[sid])
            for child_id in children.get(sid, []):
                in_degree[child_id] -= 1
                if in_degree[child_id] == 0:
                    queue.append(child_id)
        if batch:
            batches.append(batch)

    # 未覆盖的步骤（循环依赖？）——追加到末尾
    covered = {s["id"] for batch in batches for s in batch}
    for s in steps:
        if s["id"] not in covered:
            batches.append([s])
            logger.warning(f"[coordinator] step {s['id']} has circular dependency, appended at end")

    return batches


def get_ready_steps(
    steps: list[dict],
    completed_ids: set[str],
    skipped_ids: set[str],
) -> list[dict]:
    """获取当前可执行的步骤（依赖已满足 + 本身未完成/跳过）。

    Args:
        steps: 全部步骤
        completed_ids: 已完成的步骤 ID 集合
        skipped_ids: 已跳过的步骤 ID 集合

    Returns:
        可立即执行的步骤列表
    """
    ready = []
    for s in steps:
        sid = s["id"]
        if sid in completed_ids or sid in skipped_ids:
            continue
        deps = s.get("depends_on", [])
        all_deps_satisfied = all(
            dep_id in completed_ids or dep_id in skipped_ids
            for dep_id in deps
        )
        if all_deps_satisfied:
            ready.append(s)
    return ready


async def schedule_steps(
    steps: list[dict],
    execute_step,  # async callable(step) → StepResult
    parallel: bool = False,
) -> list[dict]:
    """按依赖顺序调度步骤执行。

    Args:
        steps: 步骤列表
        execute_step: async fn(step) → StepResult
        parallel: 是否允许同批次并行（默认串行）

    Returns:
        按执行顺序排列的 StepResult 列表
    """
    completed: dict[str, dict] = {}
    skipped: set[str] = set()
    results: list[dict] = []

    while len(completed) + len(skipped) < len(steps):
        ready = get_ready_steps(steps, set(completed.keys()), skipped)
        if not ready:
            # 无法推进——所有未完成步骤标记为 skipped
            for s in steps:
                sid = s["id"]
                if sid not in completed and sid not in skipped:
                    skipped.add(sid)
                    results.append({
                        "step_id": sid,
                        "step_title": s.get("title", sid),
                        "assignee_id": s.get("assignee"),
                        "assignee_name": s.get("assignee_name", "?"),
                        "success": False,
                        "files": [],
                        "output_summary": "",
                        "steps_used": 0,
                        "duration_secs": 0,
                        "error": "依赖的步骤失败或不存在",
                    })
            break

        if parallel:
            # 并行执行同批步骤
            tasks = [execute_step(s) for s in ready]
            batch_results = await asyncio.gather(*tasks, return_exceptions=True)
            for step, result in zip(ready, batch_results):
                if isinstance(result, Exception):
                    logger.error(f"[coordinator] step {step['id']} failed: {result}")
                    result = {
                        "step_id": step["id"],
                        "step_title": step.get("title", step["id"]),
                        "success": False,
                        "files": [],
                        "output_summary": "",
                        "steps_used": 0,
                        "duration_secs": 0,
                        "error": str(result),
                    }
                completed[step["id"]] = result  # type: ignore[assignment]
                results.append(result)  # type: ignore[arg-type]
        else:
            # 串行执行（一次一个）
            for step in ready:
                try:
                    result = await execute_step(step)
                except Exception as e:
                    logger.error(f"[coordinator] step {step['id']} failed: {e}")
                    result = {
                        "step_id": step["id"],
                        "step_title": step.get("title", step["id"]),
                        "success": False,
                        "files": [],
                        "output_summary": "",
                        "steps_used": 0,
                        "duration_secs": 0,
                        "error": str(e),
                    }
                completed[step["id"]] = result
                results.append(result)

    return results
