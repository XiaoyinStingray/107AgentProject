"""
Fork 管理 — Step 100c: 决策分叉。

从已完成 Worker 的任意决策点创建分叉路线。
核心流程:
  1. 从 decision log 加载分叉点之前的步骤
  2. 从快照恢复 workspace 文件状态
  3. 创建新 Worker，注入历史上下文和替代决策
  4. 新 Worker 从分叉点继续执行
"""

from datetime import datetime
import json
from pathlib import Path
import shutil
import uuid

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


def _snapshot_original_path(snapshot_name: str) -> str | None:
    """从新旧两种快照文件名中还原工作区相对路径。"""
    if "---" in snapshot_name:
        return snapshot_name.rsplit("---", 1)[0].replace("__", "/")
    parts = snapshot_name.rsplit(".", 1)
    return parts[0] if len(parts) == 2 else None


def _snapshot_time(snapshot: Path) -> datetime:
    """读取快照产生时间；旧格式无法解析时退回文件时间。"""
    if "---" in snapshot.name:
        raw = snapshot.name.rsplit("---", 1)[1]
        try:
            return datetime.strptime(raw, "%Y%m%d_%H%M%S")
        except ValueError:
            pass
    return datetime.fromtimestamp(snapshot.stat().st_ctime)


def find_snapshot_at_step(
    run_id: str,
    step_index: int,
    base_dir: str | Path | None = None,
) -> dict[str, Path] | None:
    """重建指定决策发生前的工作区文件版本。

    ``LocalWorkspace`` 会在每次覆盖文件前保存旧版本。对于每个文件，
    这里选择分叉时间之后出现的第一份快照；若之后没有再覆盖，则使用
    当时已经存在的当前文件。这样不会把分叉点之后新建的文件带回去。
    """
    ws_dir = Path(base_dir or (Path.home() / "workspaces")) / run_id
    snapshot_dir = ws_dir / ".snapshots"
    files_dir = ws_dir / "files"

    steps = load_decision_log(run_id)
    target = next((step for step in steps if step.get("step_index") == step_index), None)
    if target is None:
        return None
    try:
        target_time = datetime.fromisoformat(str(target.get("timestamp", "")))
    except ValueError:
        return None
    if target_time.tzinfo is not None:
        target_time = target_time.replace(tzinfo=None)

    snapshots_by_path: dict[str, list[Path]] = {}
    if snapshot_dir.exists():
        for snapshot in snapshot_dir.iterdir():
            if not snapshot.is_file():
                continue
            original_path = _snapshot_original_path(snapshot.name)
            if original_path:
                snapshots_by_path.setdefault(original_path, []).append(snapshot)

    current_by_path: dict[str, Path] = {}
    if files_dir.exists():
        for current in files_dir.rglob("*"):
            if current.is_file():
                relative = str(current.relative_to(files_dir)).replace("\\", "/")
                current_by_path[relative] = current

    restored: dict[str, Path] = {}
    for path in set(current_by_path) | set(snapshots_by_path):
        future_snapshots = sorted(
            (
                snapshot
                for snapshot in snapshots_by_path.get(path, [])
                if _snapshot_time(snapshot) >= target_time
            ),
            key=_snapshot_time,
        )
        candidate = future_snapshots[0] if future_snapshots else current_by_path.get(path)
        if candidate is None:
            continue
        # copy2 保留了被快照文件原本的 mtime；晚于分叉点说明文件当时尚不存在。
        if datetime.fromtimestamp(candidate.stat().st_mtime) <= target_time:
            restored[path] = candidate

    return restored or None


def restore_workspace_from_snapshots(snapshots: dict[str, Path], target_ws: LocalWorkspace):
    """将选定的历史文件版本恢复到分叉工作区。"""
    for orig_path, src in snapshots.items():
        if src.exists():
            dst = Path(target_ws.root) / "files" / orig_path
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(str(src), str(dst))
            logger.info(f"Fork restore: {src.name} → {orig_path}")


# =============================================================================
# 候选路线生成
# =============================================================================


def _parse_option_payload(text: str) -> list[dict]:
    """容忍 Markdown 包裹，解析并清洗 2-3 条候选路线。"""
    text = text.strip()
    candidates = [text]
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        if end > start:
            candidates.append(text[start:end].strip())
    brace_start, brace_end = text.find("{"), text.rfind("}")
    if brace_start >= 0 and brace_end > brace_start:
        candidates.append(text[brace_start:brace_end + 1])

    payload = None
    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            payload = parsed
            break
    if payload is None:
        return []

    cleaned: list[dict] = []
    for item in payload.get("options", []):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title", "")).strip()[:40]
        decision = str(item.get("decision", "")).strip()[:500]
        rationale = str(item.get("rationale", "")).strip()[:160]
        if title and decision:
            cleaned.append({
                "title": title,
                "decision": decision,
                "rationale": rationale,
            })
    return cleaned[:3] if len(cleaned) >= 2 else []


async def generate_fork_options(
    agent,
    task: str,
    fork_point_step: int,
    decision_log: list[dict],
) -> list[dict]:
    """让原 Agent 针对一个历史决策生成 2-3 条真正不同的替代路线。"""
    from autogen_agentchat.messages import TextMessage

    selected = next(
        (step for step in decision_log if step.get("step_index") == fork_point_step),
        None,
    )
    if selected is None:
        return []
    previous = [
        step for step in decision_log
        if int(step.get("step_index", 0)) < fork_point_step
    ][-3:]
    history = "\n".join(
        f"- Step {step.get('step_index')}: {step.get('action')} — {step.get('reason', '')}"
        for step in previous
    ) or "（这是第一个决策点）"
    prompt = f"""你正在为自己的 Worker 执行过程生成决策分叉。

原任务：{task}
分叉前历史：
{history}
原 Step {fork_point_step} 决策：{selected.get('action')} — {selected.get('reason', '')}

请给出 3 条彼此明显不同、可直接执行的替代路线。不要重复原决策，不要解释人格设定。
只返回严格 JSON：
{{"options":[
  {{"title":"短标题","decision":"给 Worker 的明确新决策，不超过 200 字","rationale":"这条路线的取舍，不超过 80 字"}},
  {{"title":"短标题","decision":"...","rationale":"..."}},
  {{"title":"短标题","decision":"...","rationale":"..."}}
]}}"""
    try:
        result = await agent.autogen_agent.on_messages(
            [TextMessage(content=prompt, source="worker-fork")],
            cancellation_token=None,
        )
        chat_message = result.chat_message
        content = chat_message.content if hasattr(chat_message, "content") else str(chat_message)
        return _parse_option_payload(content)
    except Exception as exc:
        logger.warning(f"Fork option generation failed: {exc}")
        return []


# =============================================================================
# Fork 入口
# =============================================================================


async def fork_from_checkpoint(
    original_run_id: str,
    fork_point_step: int,
    alternative_decision: str,
    agent,
    task: str,
    base_dir: str | Path | None = None,
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
    base = str(base_dir or (Path.home() / "workspaces"))

    # 1. 加载原始决策日志
    original_log = load_decision_log(original_run_id)
    if not any(step.get("step_index") == fork_point_step for step in original_log):
        raise ValueError(f"决策点 Step {fork_point_step} 不存在")
    prefix_steps = original_log[:fork_point_step - 1] if fork_point_step > 1 else []

    # 2. 从快照恢复 workspace
    fork_ws = LocalWorkspace(base, fork_run_id)
    snapshots = find_snapshot_at_step(original_run_id, fork_point_step, base)
    if snapshots:
        restore_workspace_from_snapshots(snapshots, fork_ws)
        logger.info(f"Fork: restored {len(snapshots)} files from snapshot")
    else:
        logger.info(f"Fork: no snapshots found at step {fork_point_step}, starting fresh")

    # 3. 创建新 Worker
    worker = AgentWorker(agent=agent, workspace=fork_ws)
    # AgentWorker 默认会再生成一个 run_id；分叉必须让注册表、工作区、事件和
    # 决策日志使用同一个 ID，否则前端会在运行后找不到这条历史。
    worker._run_id = fork_run_id

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
