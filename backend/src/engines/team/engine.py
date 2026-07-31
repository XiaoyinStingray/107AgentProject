"""
TeamEngine — Agent 团队工作流编排。
Step 52: 复用 WorldEngine 的 GroupChat 能力，叠加 Plan 管理和任务调度。
"""

import json as _json
import uuid
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import async_session
from models.team_orm import TeamRow
from models.plan_orm import PlanRow
from engines.team.decomposer import decompose_task
from engines.team.planner import PlanManager
from engines.team.debate import detect_debate
from engines.team.role_evolution import evaluate_and_evolve, apply_evolution


class TeamEngine:
    """编排一个 Team 的任务执行。

    生命周期：
        1. execute() → 分解任务 → 创建 Plan → 创建 World → 运行
        2. 每个 tick → PlanManager.check_progress()
        3. 全部 done → finish()
    """

    def __init__(self, team: dict, db: AsyncSession):
        """
        team: TeamRow.to_dict() 的返回
        db: 数据库会话
        """
        self.team = team
        self.db = db
        self.plan: PlanManager | None = None
        self.plan_row: PlanRow | None = None
        self._world_engine = None
        self._sse_events: list[dict] = []
        self._model_client = None  # 67: 保留引用供 on_tick 使用
        self._evolved_roles: dict[str, str] = {}  # 67: 角色演化后的最新角色

    # ── 启动 ──────────────────────────────────────────────────────

    async def execute(self, model_client) -> dict:
        """执行 Team 任务：分解 → 创建 Plan → 启动 World。

        model_client: AutoGen 模型客户端

        返回: Plan dict（含 steps + world_id）
        """
        team_id = self.team["id"]
        task = self.team.get("description", "") or self.team.get("name", "")
        self._model_client = model_client  # 67: 保留供 on_tick 角色演化使用

        # 1. 加载 Agent 摘要（id, name, role, mbti）
        agents = await self._load_agents()

        # 2. 任务分解
        steps = await decompose_task(task, agents, model_client)

        # 3. 持久化 Plan
        plan_id = str(uuid.uuid4())
        self.plan_row = PlanRow.from_decomposition(
            plan_id=plan_id,
            team_id=team_id,
            task=task,
            steps=steps,
        )
        self.db.add(self.plan_row)

        # 4. 更新 Team 状态
        result = await self.db.execute(
            select(TeamRow).where(TeamRow.id == team_id)
        )
        team_row = result.scalar_one_or_none()
        if team_row:
            team_row.status = "executing"
            await self.db.commit()

        # 5. 创建 PlanManager
        def on_plan_event(event_type: str, data: dict):
            self._sse_events.append({
                "type": event_type,
                "data": data,
                "tick": self._tick_count,
            })

        self.plan = PlanManager(steps, on_event=on_plan_event, model_client=model_client)
        self._tick_count = 0

        # 6. 创建临时 World
        world_id = await self._create_world()
        self.plan_row.world_id = world_id
        self.db.add(self.plan_row)
        await self.db.commit()

        logger.info(
            f"TeamEngine started: team={team_id!r}, plan={plan_id}, "
            f"world={world_id}, steps={len(steps)}"
        )

        return {
            "id": plan_id,
            "team_id": team_id,
            "task": task,
            "steps": steps,
            "world_id": world_id,
            "status": "executing",
            "created_at": self.plan_row.created_at if self.plan_row else "",
            "progress_pct": 0.0,
        }

    # ── Tick ──────────────────────────────────────────────────────

    async def on_tick(self, tick: int, agent_messages: list[dict]) -> list[dict]:
        """每个 tick 结束时调用——更新 Plan 进度 + 辩论检测 + 角色演化。

        返回: 本 tick 产生的事件列表
        """
        self._tick_count = tick
        if not self.plan:
            return []

        events = list(self._sse_events)
        self._sse_events.clear()

        # ── 67: 检测步骤完成 → 角色演化 ──
        prev_done = sum(1 for s in self.plan.steps if s.get("status") == "done")

        await self.plan.check_progress(tick, agent_messages)

        agents = await self._load_agents()

        new_done = sum(1 for s in self.plan.steps if s.get("status") == "done")
        if new_done > prev_done and self._model_client and len(agents) >= 2:
            # 找到刚完成的步骤
            just_done = [s for s in self.plan.steps if s.get("status") == "done"][-1]
            recent_texts = [
                m.get("content", "") or m.get("message", "")
                for m in agent_messages[-8:]
            ]
            evo_result = await evaluate_and_evolve(
                agents, just_done, recent_texts, self._model_client,
            )
            if evo_result.get("evolutions"):
                changes = apply_evolution(agents, evo_result["evolutions"])
                # 67: 持久化演化后的角色
                for ch in changes:
                    self._evolved_roles[ch["agent_id"]] = ch["new_role"]
                events.append({
                    "type": "role_evolved",
                    "data": {
                        "evolutions": evo_result["evolutions"],
                        "step_title": evo_result["step_title"],
                    },
                    "tick": tick,
                })
                logger.info(f"[team] role_evolved: {len(evo_result['evolutions'])} agent(s) changed")

        # ── 67: 辩论检测（每 tick，有 2+ 条消息就检测）──
        if len(agent_messages) >= 2:
            debate = detect_debate(agent_messages, agents, tick)
            events.append({
                "type": "debate_update",
                "data": debate,
                "tick": tick,
            })
            logger.info(f"[debate] tick={tick} msgs={len(agent_messages)} phase={debate.get('phase','?')} div={debate.get('divergence',0)}")

        # 同步 PlanRow 到 DB
        if self.plan_row:
            self.plan_row.steps = _json.dumps(self.plan.steps, ensure_ascii=False)
            if self.plan.all_done:
                self.plan_row.status = "finished"
            self.db.add(self.plan_row)
            await self.db.commit()

        return events

    # ── 结束 ──────────────────────────────────────────────────────

    async def _save_report(self, report: dict):
        """保存最终报告到 PlanRow + 标记 Team 完成。"""
        if not self.plan_row:
            return
        import json as _json
        from sqlalchemy import select as _sel
        from models.team_orm import TeamRow

        self.plan_row.report = _json.dumps(report, ensure_ascii=False)
        self.plan_row.status = "finished"
        # Team 状态同步
        result = await self.db.execute(_sel(TeamRow).where(TeamRow.id == self.team["id"]))
        tr = result.scalar_one_or_none()
        if tr:
            tr.status = "finished"
        self.db.add(self.plan_row)
        await self.db.commit()

    async def _sync_plan_to_db(self):
        """将 PlanManager 的当前状态同步到 PlanRow + TeamRow。"""
        if not self.plan_row or not self.plan:
            return
        import json as _json
        self.plan_row.steps = _json.dumps(self.plan.steps, ensure_ascii=False)
        if self.plan.all_done:
            self.plan_row.status = "finished"
            # 同步更新 Team 状态
            from sqlalchemy import select as _sel
            from models.team_orm import TeamRow
            result = await self.db.execute(_sel(TeamRow).where(TeamRow.id == self.team["id"]))
            tr = result.scalar_one_or_none()
            if tr:
                tr.status = "finished"
        self.db.add(self.plan_row)
        await self.db.commit()

    async def finish(self) -> dict:
        """结束执行——更新 Team 和 Plan 状态。"""
        if self.plan_row:
            self.plan_row.status = "finished"
            self.plan_row.steps = _json.dumps(
                self.plan.steps if self.plan else [], ensure_ascii=False
            )
            self.db.add(self.plan_row)

        result = await self.db.execute(
            select(TeamRow).where(TeamRow.id == self.team["id"])
        )
        team_row = result.scalar_one_or_none()
        if team_row:
            team_row.status = "finished"
        await self.db.commit()

        logger.info(f"TeamEngine finished: team={self.team['id']!r}")
        return {
            "status": "finished",
            "progress_pct": self.plan.progress_pct if self.plan else 0.0,
            "steps": self.plan.steps if self.plan else [],
        }

    # ── 内部 ──────────────────────────────────────────────────────

    async def _load_agents(self) -> list[dict]:
        """加载 Team 成员的摘要信息。"""
        from models.agent_orm import AgentRow

        agents = []
        roles_map = {r.get("agent_id"): r for r in (self.team.get("roles") or [])}
        for aid in self.team.get("agent_ids", []):
            result = await self.db.execute(
                select(AgentRow).where(AgentRow.id == aid)
            )
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
            role_info = roles_map.get(aid, {})
            # 67: 优先用演化后的角色，fallback 到初始分配
            evolved = self._evolved_roles.get(aid)
            role = evolved or role_info.get("role", "成员")
            agents.append({
                "id": aid,
                "name": name,
                "role": role,
                "mbti": mbti,
            })
        return agents

    async def _create_world(self) -> str:
        """创建一个临时 World 用于 Team 协作。"""
        from models.world import WorldCreate, WorldResponse, Scenario
        from models.world_orm import WorldRow
        from api.world_helpers import resolve_world_scenario

        world_id = str(uuid.uuid4())
        scenario = Scenario(
            name="团队协作",
            description=f"Team {self.team['name']} 的任务协作场景",
            time_span="长期",
            initial_events=[],
            environment_params={"mode": "team_collaboration"},
        )

        world = WorldResponse(
            id=world_id,
            name=f"Team: {self.team['name']}",
            world_type="team",
            scenario=scenario,
            agent_ids=self.team.get("agent_ids", []),
            current_tick=0,
            status="idle",
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        row = WorldRow.from_response(world.model_dump())
        self.db.add(row)
        await self.db.commit()
        return world_id
