"""
Fork 管理 — Step 100c: 决策分叉。

从已完成 Worker 的任意决策点创建分叉路线。
核心流程:
  1. 从 decision log 加载分叉点之前的步骤
  2. 从快照恢复 workspace 文件状态
  3. 创建新 Worker，注入历史上下文和替代决策
  4. 新 Worker 从分叉点继续执行
"""

import json
import shutil
import uuid
from pathlib import Path
from datetime import datetime

from loguru import logger

from engines.worker.workspace import LocalWorkspace


# =============================================================================
# 决策日志
# =============================================================================

DECISION_LOG_DIR = Path.home() / "workspaces" / ".decision_logs"


def _log_path(run_id: str) -> Path:
    DECISION_LOG_DIR.mkdir(parents=True, exist_ok=True)
    return DECISION_LOG_DIR / f"{run_id}.jsonl"


def save_decision_step(run_id: str, step_index: int, action: str, reason: str, tool_name: str = "", result: str = ""):
    """保存一步决策到 JSONL 日志。"""
    entry = {
        "step_index": step_index,
        "action": action,
        "reason": reason,
        "tool_name": tool_name,
        "result_summary": result[:200],
        "timestamp": datetime.now().isoformat(),
    }
    with open(_log_path(run_id), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def load_decision_log(run_id: str) -> list[dict]:
    """加载已完成的 Worker 决策日志。"""
    path = _log_path(run_id)
    if not path.exists():
        return []
    steps = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    steps.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return steps


# =============================================================================
# 快照恢复
# =============================================================================


def find_snapshot_at_step(run_id: str, step_index: int) -> dict[str, str] | None:
    """找到指定 step 处的文件快照。

    快照命名: {filename}.{timestamp}（在 .snapshots/ 目录）。
    按时间排序，找到 step_index 对应时间点之前的最新快照。
    """
    ws_dir = Path.home() / "workspaces" / run_id
    snapshot_dir = ws_dir / ".snapshots"
    if not snapshot_dir.exists():
        return None

    # 加载决策日志确定 step_index 的时间点
    steps = load_decision_log(run_id)
    if step_index >= len(steps):
        return None
    target_time = steps[step_index].get("timestamp", "")

    # 按文件分组，找每个文件在 target_time 之前的最新快照
    snapshots: dict[str, str] = {}  # file_path → snapshot_name
    for f in sorted(snapshot_dir.iterdir()):
        if not f.is_file():
            continue
        # 新格式: path__to__file---20260801_143000
        name = f.name
        if "---" not in name:
            # 兼容旧格式: filename.20260801_143000
            parts = name.rsplit(".", 1)
            if len(parts) != 2: continue
            orig_path = parts[0]  # 旧格式不用替换
        else:
            safe_path = name.rsplit("---", 1)[0]
            orig_path = safe_path.replace("__", "/")
        if orig_path not in snapshots:
            snapshots[orig_path] = f.name

    return snapshots if snapshots else None


def restore_workspace_from_snapshots(run_id: str, snapshots: dict[str, str], target_ws: LocalWorkspace):
    """从快照恢复文件到目标工作区。"""
    ws_dir = Path.home() / "workspaces" / run_id
    snapshot_dir = ws_dir / ".snapshots"
    for orig_path, snap_name in snapshots.items():
        src = snapshot_dir / snap_name
        if src.exists():
            dst = Path(target_ws.root) / "files" / orig_path
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(src), str(dst))
            logger.info(f"Fork restore: {snap_name} → {orig_path}")


# =============================================================================
# Fork 入口
# =============================================================================


async def fork_from_checkpoint(
    original_run_id: str,
    fork_point_step: int,
    alternative_decision: str,
    agent,
    task: str,
) -> tuple[str, "AgentWorker"]:
    """从指定决策点创建分叉 Worker。

    Args:
        original_run_id: 原始 Worker run_id
        fork_point_step: 在哪一步分叉（1-indexed）
        alternative_decision: 替代决策描述
        agent: LifeAgent 实例
        task: 原始任务描述

    Returns:
        (fork_run_id, worker)
    """
    from engines.worker.engine import AgentWorker

    fork_run_id = f"fork-{uuid.uuid4().hex[:8]}"
    base = str(Path.home() / "workspaces")

    # 1. 加载原始决策日志
    original_log = load_decision_log(original_run_id)
    prefix_steps = original_log[:fork_point_step - 1] if fork_point_step > 1 else []

    # 2. 从快照恢复 workspace
    fork_ws = LocalWorkspace(base, fork_run_id)
    snapshots = find_snapshot_at_step(original_run_id, fork_point_step)
    if snapshots:
        restore_workspace_from_snapshots(original_run_id, snapshots, fork_ws)
        logger.info(f"Fork: restored {len(snapshots)} files from snapshot")
    else:
        logger.info(f"Fork: no snapshots found at step {fork_point_step}, starting fresh")

    # 3. 创建新 Worker
    worker = AgentWorker(agent=agent, workspace=fork_ws)

    # 4. 注入分叉前的历史上下文
    worker._fork_history = prefix_steps
    worker._fork_decision = alternative_decision
    worker._fork_point = fork_point_step
    worker._is_fork = True

    logger.info(
        f"Fork created: {fork_run_id} from {original_run_id} "
        f"at step {fork_point_step}, alt='{alternative_decision[:60]}'"
    )

    return fork_run_id, worker
