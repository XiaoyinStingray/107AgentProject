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
from engines.team.workspace import init_team_workspace, write_step_context
from models.team_orm import TeamRow
from models.plan_orm import PlanRow


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
        obj["type"] = _WORKER_EVENT_MAP.get(obj.get("type", ""), f"step.{obj.get('type', '')}")
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
        self._agent_instances: dict[str, "LifeAgent"] = {}

    # =================================================================
    # 主入口
    # =================================================================

    async def execute(self, model_client) -> AsyncGenerator[str, None]:
        self._model_client = model_client
        team_id = self.team["id"]
        task = self.team.get("description", "") or self.team.get("name", "")

        self._agents = await self._load_agents()
        if not self._agents:
            yield _make_sse("team.error", {"error": "Team 中没有有效的 Agent"})
            return

        steps = await decompose_task(task, self._agents, model_client)
        if not steps:
            yield _make_sse("team.error", {"error": "任务分解失败"})
            return
        for s in steps:
            s["assignee_name"] = self._find_agent_name(s.get("assignee"))

        # ── 先创建 PlanRow（确保 plan_id 立即可用）──
        self._plan_id = await self._create_plan_row(task, steps)

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
            step_dir = Path(self._workspace_root) / f"step_{i + 1}"
            step_dir.mkdir(parents=True, exist_ok=True)

            # 复制 shared 上下文到步骤工作区（使 Agent 可通过 read_file 访问）
            shared_src = Path(self._workspace_root) / "shared"
            shared_dst = step_dir / "shared"
            if shared_src.exists():
                if shared_dst.exists():
                    shutil.rmtree(shared_dst)
                shutil.copytree(shared_src, shared_dst)

            # 复制上游步骤产出到步骤工作区（使 Agent 可读取前序产出）
            for prev_r in step_results:
                if prev_r.success:
                    prev_dir = Path(self._workspace_root) / f"step_{self._find_step_index(steps, prev_r.step_id) + 1}"
                    if prev_dir.exists():
                        for f_path in prev_r.files:
                            src_file = prev_dir / f_path
                            if src_file.exists():
                                dst_file = step_dir / f_path
                                dst_file.parent.mkdir(parents=True, exist_ok=True)
                                try:
                                    shutil.copy2(src_file, dst_file)
                                except Exception:
                                    pass

            # 写入步骤上下文文件
            ctx = await self._build_step_context(step, completed)
            write_step_context(str(step_dir), sid, ctx)

            # 构建任务 prompt
            task_desc = step.get("description", title)
            step_task = (
                f"# 团队任务\n\n{task}\n\n"
                f"# 你的子任务: {title}\n\n{task_desc}\n\n"
                f"# 上下文\n\n{ctx}\n\n"
                f"# 要求\n"
                f"1. 专注完成你的子任务，产出可直接使用的文件交付物\n"
                f"2. 可使用 read_file 读取工作区内的 shared/ 上下文文件和其他文件\n"
                f"3. 完成后将最终产出写入文件\n"
            )

            # === 获取 Agent ===
            agent = await self._get_agent_instance(aid)
            if agent is None:
                yield _make_sse("step.worker_error", {
                    "error": f"Agent {aid or '?'} 不可用", "recoverable": False,
                }, step_id=sid)
                sr = StepResult(sid, title, aid, aname, False, error=f"Agent {aid or '?'} 不可用")
                step_results.append(sr)
                completed[sid] = sr
                await self._update_plan_step(sid, "error")
                continue

            # === 创建 Worker ===
            from engines.worker.engine import AgentWorker
            from engines.worker.workspace import LocalWorkspace

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
                                    files_created.append(f["path"])
                    elif etype == "worker.summary":
                        output_summary = (parsed.get("data") or {}).get("deliverable_summary", "") or ""
                    elif etype == "worker.done":
                        steps_used = (parsed.get("data") or {}).get("total_steps", 0) or 0
                        success = True
                    elif etype == "worker.error":
                        error_msg = (parsed.get("data") or {}).get("message", "") or ""

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
                yield _make_sse("step.worker_error", {
                    "error": "Worker 未产生成功结果", "recoverable": True,
                }, step_id=sid)

            sr = StepResult(sid, title, aid, aname, success, files_created,
                            output_summary, steps_used, round(duration, 1), error_msg)
            step_results.append(sr)
            completed[sid] = sr

            await self._update_plan_step(sid, "done" if success else "error", {
                "files": files_created, "output_summary": output_summary,
                "steps_used": steps_used, "duration_secs": round(duration, 1),
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

        yield _make_sse("team_done", {
            "total_duration_secs": total_dur,
            "total_steps_completed": completed_count,
            "total_steps": len(steps),
            "steps": [
                {"step_title": r.step_title, "success": r.success,
                 "files": r.files, "duration_secs": r.duration_secs}
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
        from models.agent_orm import AgentRow

        agents = []
        roles_map = {r.get("agent_id"): r for r in (self.team.get("roles") or [])}
        for aid in self.team.get("agent_ids", []):
            result = await self.db.execute(select(AgentRow).where(AgentRow.id == aid))
            row = result.scalar_one_or_none()
            if not row:
                continue
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
            return None
        if agent_id in self._agent_instances:
            return self._agent_instances[agent_id]

        from models.agent_orm import AgentRow
        from models.agent import Persona, Background, Goal
        from engines.agent_factory.factory import LifeAgent
        from llm.client import create_model_client

        result = await self.db.execute(select(AgentRow).where(AgentRow.id == agent_id))
        row = result.scalar_one_or_none()
        if not row:
            return None

        data = row.to_dict()
        persona = Persona(**data["persona"])
        background = Background(**data["background"])
        goals = [Goal(**g) for g in data["goals"]]
        mc = self._model_client or create_model_client()

        agent = LifeAgent(id=row.id, persona=persona, background=background,
                          goals=goals, model_client=mc, tools=[])
        self._agent_instances[agent_id] = agent
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

        parts.append("\n## 团队\n")
        for a in self._agents:
            role = self._evolved_roles.get(a["id"], a.get("role", "成员"))
            parts.append(f"- {a['name']} — {role}")

        parts.append("\n## 执行结果\n")
        for r in step_results:
            icon = "✅" if r.success else "❌"
            parts.append(f"### {icon} {r.step_title}")
            parts.append(f"- 负责人: {r.assignee_name} | 耗时: {r.duration_secs:.1f}s | Worker步数: {r.steps_used}")
            if r.output_summary:
                parts.append(f"- 产出: {r.output_summary[:300]}")
            if r.files:
                parts.append(f"- 文件: {', '.join(r.files)}")
            if r.error:
                parts.append(f"- 错误: {r.error}")
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
        self.db.add(plan_row)
        await self.db.commit()

    async def _finalize_plan(self, report: dict):
        result_obj = await self.db.execute(select(PlanRow).where(PlanRow.id == self._plan_id))
        plan_row = result_obj.scalar_one_or_none()
        if plan_row:
            plan_row.status = "finished"
            plan_row.report = _json.dumps(report, ensure_ascii=False)
            self.db.add(plan_row)
        await self.db.execute(
            update(TeamRow).where(TeamRow.id == self.team["id"]).values(status="finished")
        )
        await self.db.commit()
        logger.info(f"[TeamEngine] finalized team={self.team['id']}")

    # =================================================================
    # 辅助
    # =================================================================

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
