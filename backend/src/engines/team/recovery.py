"""M9 部分完成恢复操作。

恢复动作始终作用于同一份 Plan：保留已经完成的步骤，只处理用户选择的
失败步骤，并在操作后重新生成团队报告。
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from engines.team.engine import StepResult, TeamEngine, _parse_sse_dict
from engines.team.workspace import _safe_dirname
from engines.worker.engine import AgentWorker, _is_user_deliverable_path
from engines.worker.workspace import LocalWorkspace
from models.plan_orm import PlanRow
from models.team_orm import TeamRow


class TeamRecoveryError(ValueError):
    """恢复请求无法执行。"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _find_step(steps: list[dict], step_id: str) -> tuple[int, dict]:
    for index, step in enumerate(steps):
        if step.get("id") == step_id:
            return index, step
    raise TeamRecoveryError(f"步骤 {step_id!r} 不存在")


def _find_run_root(team_id: str, step_index: int, step: dict) -> Path:
    team_root = Path.home() / "workspaces" / "teams" / team_id
    if not team_root.exists():
        raise TeamRecoveryError("找不到这次团队执行的工作区")

    step_dir_name = f"step_{step_index + 1}_{_safe_dirname(step.get('title', '步骤'))}"
    candidates = sorted(
        (path for path in team_root.iterdir() if path.is_dir()),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for run_root in candidates:
        if (run_root / step_dir_name / "work" / "files").exists():
            return run_root
    raise TeamRecoveryError("找不到该步骤已经保留的产物")


def _step_workspace(run_root: Path, step_index: int, step: dict) -> LocalWorkspace:
    step_dir_name = f"step_{step_index + 1}_{_safe_dirname(step.get('title', '步骤'))}"
    return LocalWorkspace(base_dir=str(run_root / step_dir_name), run_id="work")


def _step_result(step: dict) -> StepResult:
    result = step.get("result") or {}
    return StepResult(
        step_id=step.get("id", ""),
        step_title=step.get("title", ""),
        assignee_id=step.get("assignee"),
        assignee_name=step.get("assignee_name", "全员"),
        success=step.get("status") == "done",
        files=list(result.get("files") or []),
        output_summary=result.get("output_summary", "") or "",
        steps_used=int(result.get("steps_used", 0) or 0),
        duration_secs=float(result.get("duration_secs", 0) or 0),
        error=result.get("error", "") or "",
        recoverable=bool(result.get("recoverable", False)),
    )


def _record_recovery(result: dict, action: str, message: str) -> None:
    history = list(result.get("recovery_history") or [])
    history.append({"action": action, "message": message, "at": _utc_now()})
    result["recovery_history"] = history[-10:]


async def _build_context(
    engine: TeamEngine,
    plan_row: PlanRow,
    steps: list[dict],
    step_index: int,
) -> str:
    completed = {
        step.get("id", f"s{index}"): _step_result(step)
        for index, step in enumerate(steps[:step_index])
    }
    return await engine._build_step_context(steps[step_index], completed)


async def _build_step_task(
    engine: TeamEngine,
    plan_row: PlanRow,
    steps: list[dict],
    step_index: int,
) -> str:
    step = steps[step_index]
    title = step.get("title", f"步骤 {step_index + 1}")
    context = await _build_context(engine, plan_row, steps, step_index)
    return (
        f"# 团队任务\n\n{plan_row.task}\n\n"
        f"# 你的子任务: {title}\n\n{step.get('description', title)}\n\n"
        f"# 上下文\n\n{context}\n\n"
        "# 恢复要求\n"
        "1. 这是一次单步骤恢复，不要重新执行其他已完成步骤\n"
        "2. 先读取当前工作区已有产物和 upstream/ 中的上游参考\n"
        "3. 修订后将本步骤最终产出保存为当前根目录的 output.md\n"
    )


def _build_audit_task(plan_row: PlanRow, step: dict) -> str:
    """重新验收只核对原任务，不把恢复操作说明误当成交付约束。"""
    title = step.get("title", "当前步骤")
    return (
        f"# 团队任务\n\n{plan_row.task}\n\n"
        f"# 当前子任务: {title}\n\n{step.get('description', title)}\n"
    )


async def _prepare_engine(
    team_row: TeamRow,
    db: AsyncSession,
    model_client,
) -> TeamEngine:
    engine = TeamEngine(team_row.to_dict(), db)
    engine._model_client = model_client
    engine._agents = await engine._load_agents()
    return engine


async def _has_workspace_deliverables(workspace: LocalWorkspace) -> bool:
    files = await workspace.list_files()
    return any(_is_user_deliverable_path(file_info.path) for file_info in files)


async def _rebuild_report(
    engine: TeamEngine,
    team_row: TeamRow,
    plan_row: PlanRow,
    steps: list[dict],
    run_root: Path,
    db: AsyncSession,
) -> dict:
    engine._workspace_root = str(run_root)
    step_results = [_step_result(step) for step in steps]
    report = await engine._compile_report(step_results)
    completed_count = sum(1 for result in step_results if result.success)
    failed_count = len(step_results) - completed_count
    recoverable_count = sum(
        1 for result in step_results if not result.success and result.recoverable
    )
    outcome = (
        "partial" if completed_count and failed_count
        else "failed" if failed_count
        else "success"
    )
    report.update({
        "outcome": outcome,
        "total_steps": len(steps),
        "completed_steps": completed_count,
        "failed_steps": failed_count,
        "recoverable_steps": recoverable_count,
    })

    recovery_lines: list[str] = []
    for step in steps:
        history = (step.get("result") or {}).get("recovery_history") or []
        if history:
            latest = history[-1]
            recovery_lines.append(
                f"- {step.get('title', '步骤')}：{latest.get('message', '')}"
            )
    if recovery_lines:
        report["content"] += "\n\n## 恢复与调整记录\n\n" + "\n".join(recovery_lines)

    plan_row.steps = json.dumps(steps, ensure_ascii=False)
    plan_row.report = json.dumps(report, ensure_ascii=False)
    plan_row.status = "finished"
    team_row.status = "finished"
    db.add(plan_row)
    db.add(team_row)
    await db.commit()
    await db.refresh(plan_row)
    return plan_row.to_dict()


async def recover_team_step(
    *,
    action: str,
    team_row: TeamRow,
    plan_row: PlanRow,
    step_id: str,
    db: AsyncSession,
    model_client,
) -> dict:
    """执行 reaudt/retry/accept 中的一项，并返回更新后的 Plan。"""
    if action not in {"reaudit", "retry", "accept"}:
        raise TeamRecoveryError(f"不支持的恢复动作：{action}")

    steps = json.loads(plan_row.steps)
    step_index, step = _find_step(steps, step_id)
    result = dict(step.get("result") or {})
    if step.get("status") != "error":
        raise TeamRecoveryError("只有待调整的失败步骤可以执行恢复操作")
    if not result.get("recoverable"):
        raise TeamRecoveryError("该步骤不是可恢复状态，请重新执行团队任务")
    if not result.get("files"):
        raise TeamRecoveryError("该步骤没有已保留的产物，无法执行恢复操作")

    run_root = _find_run_root(team_row.id, step_index, step)
    workspace = _step_workspace(run_root, step_index, step)
    engine = await _prepare_engine(team_row, db, model_client)
    step_task = await _build_step_task(engine, plan_row, steps, step_index)

    if action in {"reaudit", "accept"} and not await _has_workspace_deliverables(workspace):
        raise TeamRecoveryError("该步骤没有可重新验收或接受的产物")

    response: dict = {"action": action, "step_id": step_id}

    if action == "accept":
        message = "已由用户接受当前产物并继续保留后续结果"
        step["status"] = "done"
        result.update({
            "error": None,
            "recoverable": False,
            "artifact_status": "accepted",
            "accepted_with_warning": True,
        })
        _record_recovery(result, action, message)
        response.update({"status": "accepted", "message": message})

    elif action == "reaudit":
        agent = await engine._get_agent_instance(step.get("assignee"))
        worker = AgentWorker(agent, workspace=workspace)
        audit = await worker._audit_delivery(_build_audit_task(plan_row, step))
        if audit is None:
            raise TeamRecoveryError("重新验收服务暂时不可用，请稍后重试")
        response["audit"] = audit
        if audit.get("passed"):
            message = "已有产物重新验收通过，无需重跑该步骤"
            step["status"] = "done"
            result.update({
                "error": None,
                "recoverable": False,
                "artifact_status": "reaudited",
            })
            response["status"] = "passed"
        else:
            issues = [str(issue) for issue in audit.get("issues", [])]
            message = "重新验收未通过：" + ("；".join(issues[:3]) or "仍有约束未满足")
            step["status"] = "error"
            result.update({
                "error": message,
                "recoverable": True,
                "artifact_status": "preserved",
                "audit": audit,
            })
            response["status"] = "needs_adjustment"
        _record_recovery(result, action, message)
        response["message"] = message

    elif action == "retry":
        agent = await engine._get_agent_instance(step.get("assignee"))
        worker = AgentWorker(agent, workspace=workspace)
        existing_files = list(result.get("files") or [])
        files_created: list[str] = []
        output_summary = ""
        steps_used = 0
        error_message = ""
        recoverable = False
        started = time.monotonic()

        step["status"] = "active"
        plan_row.steps = json.dumps(steps, ensure_ascii=False)
        plan_row.status = "executing"
        team_row.status = "executing"
        db.add(plan_row)
        db.add(team_row)
        await db.commit()

        async for raw_event in worker.execute(step_task, is_follow_up=True):
            event = _parse_sse_dict(raw_event)
            event_type = event.get("type", "")
            data = event.get("data") or {}
            if event_type == "worker.file_updated":
                for file_info in data.get("files", []):
                    path = file_info.get("path", "") if isinstance(file_info, dict) else ""
                    if path and _is_user_deliverable_path(path):
                        step_dir = f"step_{step_index + 1}_{_safe_dirname(step.get('title', '步骤'))}"
                        full_path = f"{step_dir}/work/files/{path}"
                        if full_path not in files_created:
                            files_created.append(full_path)
            elif event_type == "worker.summary":
                output_summary = data.get("deliverable_summary", "") or ""
            elif event_type == "worker.done":
                steps_used = int(data.get("total_steps", 0) or 0)
                error_message = ""
            elif event_type == "worker.error":
                error_message = data.get("message", "") or "Worker 恢复执行失败"
                recoverable = bool(data.get("recoverable", False))

        duration = round(time.monotonic() - started, 1)
        succeeded = worker.state.value == "done" and not error_message
        if succeeded:
            message = "仅重试该步骤成功，其他已完成步骤保持不变"
            step["status"] = "done"
            result.update({
                "files": files_created or existing_files,
                "output_summary": output_summary,
                "steps_used": steps_used,
                "duration_secs": duration,
                "error": None,
                "recoverable": False,
                "artifact_status": "retried",
            })
            response["status"] = "passed"
        else:
            message = error_message or "单步骤重试未产生成功结果"
            step["status"] = "error"
            result.update({
                "files": files_created or existing_files,
                "output_summary": output_summary,
                "steps_used": steps_used,
                "duration_secs": duration,
                "error": message,
                "recoverable": recoverable or bool(files_created or existing_files),
                "artifact_status": "preserved" if files_created or existing_files else None,
            })
            response["status"] = "needs_adjustment"
        _record_recovery(result, action, message)
        response["message"] = message

    step["result"] = result
    response["plan"] = await _rebuild_report(
        engine, team_row, plan_row, steps, run_root, db
    )
    return response
