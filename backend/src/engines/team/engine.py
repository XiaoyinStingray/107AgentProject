"""
TeamEngine — Agent 团队工作流编排（State 8 重写）。

不再依赖 WorldEngine/GroupChat。每个步骤启动一个 AgentWorker——
Agent 独立干活，通过共享工作区文件协作。
"""

import json as _json
import shutil
import time
import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from engines.team.decomposer import decompose_task
from engines.team.role_evolution import evaluate_and_evolve, apply_evolution
from engines.team.workspace import init_team_workspace, write_step_context, _safe_dirname
from engines.worker.engine import AgentWorker
from engines.worker.workspace import LocalWorkspace
from models.team_orm import TeamRow
from models.plan_orm import PlanRow
from models.agent_orm import AgentRow


@dataclass
class StepResult:
    step_id: str = ""
    step_title: str = ""
    assignee_id: str | None = None
    assignee_name: str = ""
    success: bool = False
    files: list[str] = field(default_factory=list)
    output_summary: str = ""
    steps_used: int = 0
    duration_secs: float = 0.0
    error: str = ""
    recoverable: bool = False


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_sse(event_type: str, data: dict, step_id: str | None = None) -> str:
    payload = {"type": event_type, "data": data, "timestamp": _now_iso()}
    if step_id:
        payload["step_id"] = step_id
    return f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"


def _make_error_sse(error_message: str) -> str:
    """安全构建 team.error SSE——避免字符串内双引号破坏 JSON。"""
    payload = {
        "type": "team.error",
        "data": {"error": error_message},
        "timestamp": _now_iso(),
    }
    return f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"


_WORKER_EVENT_MAP = {
    "worker.started": "step.started",
    "worker.tool_start": "step.tool_start",
    "worker.tool_result": "step.tool_result",
    "worker.file_updated": "step.file_updated",
    "worker.thought": "step.thought",
    "worker.plan": "step.plan",
    "worker.reflection": "step.reflection",
    "worker.summary": "step.summary",
    "worker.done": "step.worker_done",
    "worker.error": "step.worker_error",
}


def _prefix_worker_sse(raw: str, step_id: str) -> str:
    if not raw.startswith("data: "):
        return raw
    try:
        obj = _json.loads(raw[6:].strip())
        worker_type = obj.get("type", "")
        obj["type"] = _WORKER_EVENT_MAP.get(worker_type, f"step.{worker_type}")
        if worker_type == "worker.error":
            data = obj.setdefault("data", {})
            data["error"] = data.get("error") or data.get("message") or "Worker 执行失败"
        obj["step_id"] = step_id
        return f"data: {_json.dumps(obj, ensure_ascii=False)}\n\n"
    except Exception:
        return raw


class TeamEngine:

    def __init__(self, team: dict, db: AsyncSession):
        self.team = team
        self.db = db
        self._run_id = f"run-{uuid.uuid4().hex[:8]}"
        self._workspace_root: str = ""
        self._plan_id: str = ""
        self._evolved_roles: dict[str, str] = {}
        self._model_client = None
        self._agents: list[dict] = []
        self._prepared_steps: list[dict] | None = None
        self._agent_instances: dict[str, object] = {}

    # =================================================================
    # 主入口
    # =================================================================

    async def prepare(self, model_client) -> str:
        """Prepare and persist exactly one Plan for this Team run.

        The API calls this before starting the background task so it can return
        a stable plan_id immediately. ``execute`` then consumes the same steps
        instead of decomposing the task and creating a second Plan.
        """
        self._model_client = model_client
        task = self.team.get("description", "") or self.team.get("name", "")

        # Idempotent within one TeamEngine/run: repeated preparation must reuse
        # the already persisted Plan rather than creating another history row.
        if self._plan_id and self._prepared_steps is not None and self._agents:
            return self._plan_id

        self._agents = await self._load_agents()
        if not self._agents:
            raise ValueError("Team 中没有有效的 Agent")

        steps = await decompose_task(task, self._agents, model_client)
        if not steps:
            raise ValueError("任务分解失败——无法生成步骤")
        for s in steps:
            # 安全网：LLM 可能返回名字而非 UUID → 映射回 UUID
            raw_assignee = s.get("assignee")
            resolved = self._resolve_agent_id(raw_assignee)
            if resolved != raw_assignee:
                logger.info(f"[TeamEngine] assignee name→id: {raw_assignee!r} → {resolved!r}")
            s["assignee"] = resolved
            s["assignee_name"] = self._find_agent_name(resolved)

        # Persist once. All later progress/results are written back to this ID.
        self._plan_id = await self._create_plan_row(task, steps)
        self._prepared_steps = steps
        return self._plan_id

    async def execute(
        self,
        model_client,
        *,
        pre_steps=None,
        pre_plan_id=None,
    ) -> AsyncGenerator[str, None]:
        self._model_client = model_client
        team_id = self.team["id"]
        task = self.team.get("description", "") or self.team.get("name", "")

        # Compatibility for callers that already prepared and persisted a Plan.
        # The normal API path uses prepare(), which is idempotent and guarantees
        # that one execution creates exactly one Plan row.
        if pre_steps is not None or pre_plan_id is not None:
            if pre_steps is None or pre_plan_id is None:
                yield _make_sse("team.error", {
                    "error": "pre_steps 与 pre_plan_id 必须同时提供",
                })
                return
            if not self._agents:
                self._agents = await self._load_agents()
            if not self._agents:
                yield _make_sse("team.error", {"error": "Team 中没有有效的 Agent"})
                return
            self._prepared_steps = pre_steps
            self._plan_id = pre_plan_id
        else:
            try:
                await self.prepare(model_client)
            except ValueError as exc:
                yield _make_sse("team.error", {"error": str(exc)})
                return

        # prepare() guarantees these values and is idempotent for this run.
        steps = self._prepared_steps or []

        # ── 初始化工作区 ──
        self._workspace_root = init_team_workspace(
            team_id=team_id, team_name=self.team.get("name", "团队"),
            task=task, steps=steps, agents=self._agents,
        )
        logger.info(f"[TeamEngine] plan={self._plan_id}, ws={self._workspace_root}, steps={len(steps)}")

        yield _make_sse("plan_created", {
            "plan_id": self._plan_id, "task": task, "total_steps": len(steps),
            "steps": [
                {"id": s.get("id", ""), "title": s.get("title", ""),
                 "assignee_id": s.get("assignee"), "assignee_name": s.get("assignee_name", "全员"),
                 "description": s.get("description", "")}
                for s in steps
            ],
        })

        await self._update_team_status("executing")

        # ── 逐步骤执行 ──
        step_results: list[StepResult] = []
        completed: dict[str, StepResult] = {}

        for i, step in enumerate(steps):
            sid = step.get("id", f"s{i}")
            title = step.get("title", f"步骤 {i+1}")
            aid = step.get("assignee")
            aname = step.get("assignee_name", "全员")

            yield _make_sse("step.started", {
                "title": title, "assignee_id": aid, "assignee_name": aname,
                "step_index": i, "total_steps": len(steps),
            }, step_id=sid)

            # === 准备步骤工作区 ===
            # Worker 文件空间: step_i/work/files/ —— Agent 的 read_file/list_files/write_file
            # 都在这下面操作。所以 shared/ 和上游产出必须复制到 files/ 子目录内。
            step_dir_name = f"step_{i + 1}_{_safe_dirname(title)}"
            step_dir = Path(self._workspace_root) / step_dir_name
            worker_files_dir = step_dir / "work" / "files"
            worker_files_dir.mkdir(parents=True, exist_ok=True)

            # 复制 shared 上下文 → worker 可见的 files/shared/
            shared_src = Path(self._workspace_root) / "shared"
            shared_dst = worker_files_dir / "shared"
            if shared_src.exists():
                if shared_dst.exists():
                    shutil.rmtree(shared_dst)
                shutil.copytree(shared_src, shared_dst)

            # 复制上游步骤产出 → worker 可见的 files/upstream/<步骤>/。
            # 不再把多个步骤的 output.md 平铺到当前根目录，避免相互覆盖，
            # 也避免 Agent/用户误把上一步产物当成本步骤最终交付。
            for prev_r in step_results:
                if prev_r.success:
                    prev_idx = self._find_step_index(steps, prev_r.step_id)
                    prev_step_dir_name = f"step_{prev_idx + 1}_{_safe_dirname(prev_r.step_title)}"
                    prev_files_dir = Path(self._workspace_root) / prev_step_dir_name / "work" / "files"
                    if prev_files_dir.exists():
                        for f_path in prev_r.files:
                            marker = "/work/files/"
                            source_rel = f_path.split(marker, 1)[-1] if marker in f_path else f_path
                            src_file = prev_files_dir / source_rel
                            if src_file.exists():
                                upstream_dir = f"step_{prev_idx + 1}_{_safe_dirname(prev_r.step_title)}"
                                dst_file = worker_files_dir / "upstream" / upstream_dir / source_rel
                                dst_file.parent.mkdir(parents=True, exist_ok=True)
                                try:
                                    shutil.copy2(src_file, dst_file)
                                except Exception:
                                    pass

            # 写入步骤上下文文件（到 worker 可见目录）
            ctx = await self._build_step_context(step, completed)
            ctx_file = worker_files_dir / "CONTEXT.md"
            ctx_file.write_text(ctx, encoding="utf-8")

            # 构建任务 prompt
            task_desc = step.get("description", title)
            step_task = (
                f"# 团队任务\n\n{task}\n\n"
                f"# 你的子任务: {title}\n\n{task_desc}\n\n"
                f"# 上下文\n\n{ctx}\n\n"
                f"# 可用文件\n"
                f"- 上下文文件: shared/TASK.md, shared/TEAM.json\n"
                f"- 你的上下文: CONTEXT.md\n"
                f"- 上游产出文件（如有）位于 upstream/，仅供参考\n"
                f"- 使用 list_files 查看所有可用文件，使用 read_file 读取内容\n\n"
                f"# 要求\n"
                f"1. 专注完成你的子任务，产出可直接使用的文件交付物\n"
                f"2. 完成后将本步骤最终产出写入当前根目录的 output.md；不要覆盖 upstream/ 中的文件\n"
            )

            # === 获取 Agent ===
            agent = await self._get_agent_instance(aid)
            if agent is None:
                agent_error = f"Agent {aid or '?'} 不可用"
                yield _make_sse("step.worker_error", {
                    "error": agent_error, "recoverable": False,
                }, step_id=sid)
                sr = StepResult(sid, title, aid, aname, False, error=agent_error)
                step_results.append(sr)
                completed[sid] = sr
                await self._update_plan_step(sid, "error", {"error": agent_error})
                continue

            # === 创建 Worker ===
            workspace = LocalWorkspace(base_dir=str(step_dir), run_id="work")

            worker = AgentWorker(agent, workspace=workspace)

            # === 执行 Worker 并收集元数据 ===
            # 字段映射（Worker 事件 → 我们需要的元数据）:
            #   worker.file_updated → data.files: [{path, size}]   (NOT data.path)
            #   worker.summary      → data.deliverable_summary     (NOT data.content)
            #   worker.done         → data.total_steps, data.files
            #   worker.error        → data.message

            files_created: list[str] = []
            output_summary = ""
            steps_used = 0
            success = False
            error_msg = ""
            error_recoverable = False
            start_time = time.monotonic()

            try:
                async for raw_event in worker.execute(step_task):
                    parsed = _parse_sse_dict(raw_event)
                    etype = parsed.get("type", "") if parsed else ""

                    if etype == "worker.file_updated":
                        flist = (parsed.get("data") or {}).get("files", [])
                        if isinstance(flist, list):
                            for f in flist:
                                if isinstance(f, dict) and f.get("path"):
                                    # 存储相对于 run root 的完整路径，供下载 API 使用
                                    step_dir_name = f"step_{i + 1}_{_safe_dirname(title)}"
                                    full_rel = f"{step_dir_name}/work/files/{f['path']}"
                                    files_created.append(full_rel)
                    elif etype == "worker.summary":
                        output_summary = (parsed.get("data") or {}).get("deliverable_summary", "") or ""
                    elif etype == "worker.done":
                        steps_used = (parsed.get("data") or {}).get("total_steps", 0) or 0
                        success = True
                    elif etype == "worker.error":
                        error_data = parsed.get("data") or {}
                        error_msg = error_data.get("message", "") or ""
                        error_recoverable = bool(error_data.get("recoverable", False))

                    yield _prefix_worker_sse(raw_event, sid)

            except Exception as e:
                error_msg = str(e)
                logger.error(f"[TeamEngine] step '{title}' crashed: {e}")
                yield _make_error_sse(error_msg)

            duration = time.monotonic() - start_time

            if success:
                yield _make_sse("step.worker_done", {
                    "success": True, "files": files_created, "output_summary": output_summary,
                    "steps_used": steps_used, "duration_secs": round(duration, 1),
                }, step_id=sid)
            elif not error_msg:
                error_msg = "Worker 未产生成功结果"
                yield _make_sse("step.worker_error", {
                    "error": error_msg, "recoverable": True,
                }, step_id=sid)

            sr = StepResult(sid, title, aid, aname, success, files_created,
                            output_summary, steps_used, round(duration, 1), error_msg,
                            error_recoverable)
            step_results.append(sr)
            completed[sid] = sr

            await self._update_plan_step(sid, "done" if success else "error", {
                "files": files_created, "output_summary": output_summary,
                "steps_used": steps_used, "duration_secs": round(duration, 1),
                "error": error_msg or None,
                "recoverable": error_recoverable,
                "artifact_status": "preserved" if error_recoverable and files_created else None,
            })

            # ── 角色演化 ──
            if success and self._model_client and len(self._agents) >= 2:
                evos = await self._do_role_evolution(step, output_summary)
                if evos:
                    for ev in evos:
                        self._evolved_roles[ev["agent_id"]] = ev["new_role"]
                    yield _make_sse("role_evolved", {"evolutions": evos, "step_title": title})

        # ── 报告 & team_done ──
        report = await self._compile_report(step_results)
        total_dur = round(sum(r.duration_secs for r in step_results), 1)
        completed_count = sum(1 for r in step_results if r.success)
        failed_count = len(step_results) - completed_count
        recoverable_count = sum(1 for r in step_results if not r.success and r.recoverable)
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

        yield _make_sse("team_done", {
            "outcome": outcome,
            "total_duration_secs": total_dur,
            "total_steps_completed": completed_count,
            "failed_steps": failed_count,
            "total_steps": len(steps),
            "steps": [
                {"step_title": r.step_title, "success": r.success,
                 "files": r.files, "duration_secs": r.duration_secs,
                 "recoverable": r.recoverable, "error": r.error or None}
                for r in step_results
            ],
            "report": report,
            "workspace_root": self._workspace_root,
        })

        await self._finalize_plan(report)

    # =================================================================
    # Agent 管理
    # =================================================================

    async def _load_agents(self) -> list[dict]:
        from engines.agent_factory.loader import AgentNotFoundError

        agent_ids = self.team.get("agent_ids", [])
        if not agent_ids:
            return []

        # 批量查询，避免 N+1
        result = await self.db.execute(
            select(AgentRow).where(AgentRow.id.in_(agent_ids))
        )
        rows_by_id = {r.id: r for r in result.scalars().all()}

        agents = []
        roles_map = {r.get("agent_id"): r for r in (self.team.get("roles") or [])}
        for aid in agent_ids:
            row = rows_by_id.get(aid)
            if not row:
                raise AgentNotFoundError(f"Agent {aid!r} 不存在或已被删除")
            try:
                persona = _json.loads(row.persona_json)
                name = persona.get("name", "") or row.name or aid[:8]
                mbti = persona.get("mbti", "")
            except Exception:
                name = row.name or aid[:8]
                mbti = ""
            role = (roles_map.get(aid) or {}).get("role", "成员")
            agents.append({"id": aid, "name": name, "role": role, "mbti": mbti})
        return agents

    async def _get_agent_instance(self, agent_id: str | None):
        if not agent_id:
            # "全员"步骤 → 回退到第一个 Agent
            if self._agents:
                agent_id = str(self._agents[0]["id"])
                logger.info(f"[TeamEngine] '全员' step → fallback to first agent {agent_id}")
            else:
                logger.warning("[TeamEngine] _get_agent_instance: agent_id is None/empty and no agents loaded")
                return None
        if agent_id in self._agent_instances:
            return self._agent_instances[agent_id]

        from engines.agent_factory.loader import load_agent_for_execution

        logger.info(f"[TeamEngine] _get_agent_instance: loading agent {agent_id}")
        agent = await load_agent_for_execution(
            agent_id,
            db=self.db,
            model_client=self._model_client,
        )

        self._agent_instances[agent_id] = agent
        logger.info(
            f"[TeamEngine] _get_agent_instance: agent {agent_id} "
            f"({agent.persona.name}) restored ok"
        )
        return agent

    # =================================================================
    # 上下文 & 角色演化
    # =================================================================

    async def _build_step_context(self, step: dict, completed: dict[str, StepResult]) -> str:
        task = self.team.get("description", "") or self.team.get("name", "")
        lines = [f"# 团队任务: {task}", "", "## 团队成员"]
        for a in self._agents:
            role = self._evolved_roles.get(a["id"], a.get("role", "成员"))
            lines.append(f"- {a['name']} — {role} ({a.get('mbti', '')})")

        if completed:
            lines.append("")
            lines.append("## 已完成步骤")
            for r in completed.values():
                icon = "✅" if r.success else "❌"
                lines.append(f"- {icon} {r.step_title} ({r.assignee_name})")
                for f in r.files:
                    lines.append(f"  - 📄 {f}")
                if r.output_summary:
                    lines.append(f"  - 📝 {r.output_summary[:200]}")

        lines.append("")
        lines.append(f"## 当前步骤: {step.get('title', '')}")
        lines.append(step.get("description", ""))
        return "\n".join(lines)

    async def _do_role_evolution(self, step: dict, output_summary: str) -> list[dict] | None:
        if not self._model_client:
            return None
        try:
            result = await evaluate_and_evolve(
                self._agents, step,
                [output_summary] if output_summary else [],
                self._model_client,
            )
            evos = result.get("evolutions")
            if evos:
                apply_evolution(self._agents, evos)
                return evos
        except Exception as e:
            logger.warning(f"[TeamEngine] role evolution failed: {e}")
        return None

    # =================================================================
    # 报告
    # =================================================================

    async def _compile_report(self, step_results: list[StepResult]) -> dict:
        task = self.team.get("description", "") or self.team.get("name", "")
        parts = [f"# {self.team.get('name', '团队')} 任务报告\n\n## 任务\n\n{task}\n"]

        completed_count = sum(1 for result in step_results if result.success)
        failed_count = len(step_results) - completed_count
        recoverable_count = sum(
            1 for result in step_results if not result.success and result.recoverable
        )
        if failed_count and completed_count:
            if recoverable_count:
                hard_failed_count = failed_count - recoverable_count
                suffix = f"{recoverable_count} 步已有产物、待调整"
                if hard_failed_count:
                    suffix += f"，{hard_failed_count} 步失败"
                result_summary = (
                    f"部分完成：{completed_count}/{len(step_results)} 步完成，{suffix}"
                )
            else:
                result_summary = f"部分完成：{completed_count}/{len(step_results)} 步完成，{failed_count} 步失败"
        elif failed_count:
            result_summary = f"执行失败：{failed_count} 步失败"
        else:
            result_summary = f"全部完成：{completed_count}/{len(step_results)} 步完成"
        parts.append(f"\n> **执行状态：{result_summary}**\n")

        # 构建 agent_id → role 映射（优先使用 team.roles，其次用 evolved_roles，最后用 agent 自带的 role）
        role_map: dict[str, str] = {}
        for r in (self.team.get("roles") or []):
            if isinstance(r, dict) and r.get("agent_id"):
                role_map[r["agent_id"]] = r.get("role", "")

        parts.append("\n## 团队\n")
        for a in self._agents:
            # 优先级：team.roles > evolved_roles > agent.role > "成员"
            role = role_map.get(a["id"]) or self._evolved_roles.get(a["id"]) or a.get("role", "") or "成员"
            parts.append(f"- {a['name']} — {role}")

        parts.append("\n## 执行结果\n")
        for i, r in enumerate(step_results):
            icon = "✅" if r.success else "🟡" if r.recoverable else "❌"
            parts.append(f"### {icon} {r.step_title}")
            parts.append(f"- 负责人: {r.assignee_name} | 耗时: {r.duration_secs:.1f}s | Worker步数: {r.steps_used}")

            # 读取 Worker 产出文件（只读 work/files/ 下的用户文件，跳过 shared/ 系统文件）
            step_dir = Path(self._workspace_root) / f"step_{i + 1}_{_safe_dirname(r.step_title)}"
            output_dir = step_dir / "work" / "files"
            files_found: list[str] = []
            if output_dir.exists():
                for fpath in output_dir.rglob("*"):
                    if not fpath.is_file():
                        continue
                    rel = str(fpath.relative_to(output_dir))
                    # 跳过系统文件
                    if (
                        rel.startswith("shared/")
                        or rel.startswith("upstream/")
                        or rel == "CONTEXT.md"
                    ):
                        continue
                    if fpath.suffix in (".md", ".txt", ".json", ".py", ".c", ".html", ".csv", ".ts", ".js", ".yaml", ".yml"):
                        try:
                            content = fpath.read_text(encoding="utf-8")
                            files_found.append(rel)
                            max_len = 5000
                            truncated = content[:max_len] + ("\n...(截断)" if len(content) > max_len else "")
                            parts.append(f"\n#### 📄 {rel}\n\n```\n{truncated}\n```")
                        except Exception:
                            pass

            if not files_found:
                if r.output_summary:
                    parts.append(f"\n产出摘要: {r.output_summary[:500]}")
                elif r.files:
                    parts.append(f"\n产出文件: {', '.join(r.files)} (内容未找到)")
                else:
                    parts.append(f"\n无产出文件")

            if r.error:
                label = "可恢复，产物已保留" if r.recoverable else "错误"
                parts.append(f"\n> ⚠️ {label}: {r.error}")
            parts.append("")

        content = "\n".join(parts)
        return {"title": f"{self.team.get('name', '团队')} — 任务报告", "content": content}

    # =================================================================
    # 持久化
    # =================================================================

    async def _create_plan_row(self, task: str, steps: list[dict]) -> str:
        plan_id = str(uuid.uuid4())
        row = PlanRow.from_decomposition(plan_id=plan_id, team_id=self.team["id"],
                                         task=task, steps=steps)
        self.db.add(row)
        await self.db.commit()
        return plan_id

    async def _update_team_status(self, status: str):
        await self.db.execute(
            update(TeamRow).where(TeamRow.id == self.team["id"]).values(status=status)
        )
        await self.db.commit()

    async def _update_plan_step(self, step_id: str, status: str, result: dict | None = None):
        result_obj = await self.db.execute(select(PlanRow).where(PlanRow.id == self._plan_id))
        plan_row = result_obj.scalar_one_or_none()
        if not plan_row:
            return
        steps = _json.loads(plan_row.steps)
        for s in steps:
            if s.get("id") == step_id:
                s["status"] = status
                if result:
                    s["result"] = result
                break
        plan_row.steps = _json.dumps(steps, ensure_ascii=False)
        await self.db.commit()

    async def _finalize_plan(self, report: dict):
        result_obj = await self.db.execute(select(PlanRow).where(PlanRow.id == self._plan_id))
        plan_row = result_obj.scalar_one_or_none()
        if plan_row:
            plan_row.status = "finished"
            plan_row.report = _json.dumps(report, ensure_ascii=False)
        await self.db.execute(
            update(TeamRow).where(TeamRow.id == self.team["id"]).values(status="finished")
        )
        await self.db.commit()
        logger.info(f"[TeamEngine] finalized team={self.team['id']}")

    # =================================================================
    # 辅助
    # =================================================================

    def _resolve_agent_id(self, name_or_id: str | None) -> str | None:
        """将名字或 UUID 解析为标准 UUID。LLM 可能返回名字而非 UUID。"""
        if not name_or_id:
            return None
        # 已经是 UUID → 直接返回
        for a in self._agents:
            if a.get("id") == name_or_id:
                return name_or_id
        # 尝试按名字匹配
        for a in self._agents:
            if a.get("name") == name_or_id:
                return a["id"]
        # 尝试部分匹配
        for a in self._agents:
            name = a.get("name", "")
            if name and name_or_id in name:
                return a["id"]
        # 找不到 → 返回原值（后续会因为查不到报错，但至少 log 已记录）
        return name_or_id

    def _find_agent_name(self, agent_id: str | None) -> str:
        if not agent_id:
            return "全员"
        for a in self._agents:
            if a.get("id") == agent_id:
                return a.get("name", agent_id[:8])
        return agent_id[:8] or "未知"

    @staticmethod
    def _find_step_index(steps: list[dict], step_id: str) -> int:
        for i, s in enumerate(steps):
            if s.get("id") == step_id:
                return i
        return 0


def _parse_sse_dict(raw: str) -> dict:
    if not raw.startswith("data: "):
        return {}
    try:
        return _json.loads(raw[6:].strip())
    except Exception:
        return {}
