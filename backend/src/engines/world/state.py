"""World context, action, relationship, and persistence mixin."""

import uuid
from datetime import datetime, timezone
from typing import Any

from loguru import logger

from engines.world.relationships import (
    apply_relationship_changes,
    extract_relationship_changes,
)
from engines.world.instructions import resolve_agent_instruction
from engines.world.resources import build_resource_context
from models.event import Event, SimEvent


RECENT_EVENT_COUNT = 3
EVENT_DESCRIPTION_CHAR_LIMIT = 240
RECENT_EVENT_CONTEXT_CHAR_LIMIT = 800


def _resolve_agent_id(
    name_or_id: str,
    agents: dict,
    name_map: dict[str, str] | None = None,
) -> str:
    """Resolve an Agent name, UUID, or AutoGen name to its UUID."""
    if name_or_id in agents:
        return name_or_id
    for agent_id, agent in agents.items():
        if agent.persona.name == name_or_id:
            return agent_id
    if name_map and name_or_id in name_map:
        return name_map[name_or_id]
    return name_or_id


class WorldStateMixin:
    """Provide context, action effects, relationships, and persistence.

    This is a Mixin — the following attributes are provided by
    the host class (WorldEngine) at runtime.
    """

    # Mixin host-class attribute stubs (satisfied by WorldEngine at runtime)
    world: Any
    agents: dict[str, Any]
    current_tick: int
    events: list[SimEvent]
    relationships: dict[tuple[str, str], float]
    _name_to_id: dict[str, str]
    _db: Any  # sqlalchemy.ext.asyncio.AsyncSession

    def _build_world_context(self) -> str:
        """Build the current tick context injected into every Agent."""
        # Team 任务模式（Step 53）：用团队上下文替代场景上下文
        if hasattr(self, "team_task") and self.team_task:
            return self._build_team_context()

        params = self.world.scenario.environment_params
        location = params.get("location", "未知")
        names = ", ".join(
            agent.persona.name or agent.id for agent in self.agents.values()
        )
        context = (
            f"⏰ 第 {self.current_tick} 个时间段\n"
            f"📍 地点: {location}\n"
            f"👥 在场人物: {names}\n"
        )
        weather = params.get("weather")
        if weather:
            context += f"🌤️ 天气: {weather}\n"
        context += build_resource_context(params, self.current_tick)
        recent = self._recent_events_text()
        if recent:
            context += f"📋 最近事件:\n{recent}"
        # 目标完成提示——Agent 会看到自己的成就并被鼓励设定新目标
        goal_hints = self._build_goal_context()
        if goal_hints:
            context += goal_hints
        return context

    def _build_team_context(self) -> str:
        """构建团队任务专用上下文——目标是产出结构化交付物，不是聊天。"""
        task = getattr(self, "team_task", "团队任务")
        agent_steps = getattr(self, "team_agent_steps", {})
        agent_roles = getattr(self, "team_agent_roles", {})

        lines = [
            f"📋 团队任务：{task}",
            "",
            "⚡ 核心规则：你的目标不是聊天，是产出结构化交付物。",
            "",
            "工作流程：",
            "1. 快速讨论（1-2轮即可）确认理解和分工",
            "2. 各自完成分配的任务——调用 submit_deliverable(step_title, deliverable) 提交",
            "   deliverable 必须是可直接使用的结构化内容：表格、列表、方案文档",
            "   ❌ 错误：'我们讨论了选题，觉得可以做课表App'",
            "   ✅ 正确：'| 选题名 | 技术栈 | 难度 | 创新点 |\\n| 智能课表 | React+Node | 中 | AI推荐 |'",
            "3. 提交后系统自动推进到下一阶段",
            "",
            "禁止事项：",
            "- 禁止闲聊、禁止寒暄、禁止讨论无关话题",
            "- 禁止使用 observe、set_goal——你只有 send_message、think_aloud、submit_deliverable",
            "- 如果连续3轮没有实质产出，协调器会介入",
            "",
            "─── 当前分工 ───",
        ]

        for agent in self.agents.values():
            name = agent.persona.name or agent.id[:8]
            role = agent_roles.get(agent.id, "成员")
            my_steps = agent_steps.get(agent.id, [])
            lines.append(f"👤 {name} — 角色：{role}")
            if my_steps:
                for s in my_steps:
                    status_label = {"pending": "⏳待开始", "active": "🔄进行中", "done": "✅已完成"}.get(
                        s.get("status", ""), s.get("status", ""))
                    lines.append(f"   📌 {s['title']} [{status_label}]")
            lines.append("")

        lines.append(f"⏰ 阶段 {self.current_tick} | 当前工作：{self._current_step_name()}")
        return "\n".join(lines)

    def _current_step_name(self) -> str:
        """获取当前活跃步骤的名称（用于 Team 上下文显示）。"""
        if hasattr(self, "team_plan") and self.team_plan:
            step = self.team_plan.current_step()
            if step:
                return f"{step.get('title', '')}（负责人：{step.get('assignee') or '全员'}）"
        return "等待开始"

    def _build_goal_context(self) -> str:
        """Build goal status hints for each agent with recently achieved goals."""
        hints = ""
        for agent in self.agents.values():
            if not hasattr(agent, "goals"):
                continue
            achieved = [g for g in agent.goals if g.status == "achieved"]
            active = [g for g in agent.goals if g.status in ("active", "in_progress")]
            if achieved:
                name = agent.persona.name or agent.id
                hints += f"\n🎉 {name} 最近达成的目标:\n"
                for g in achieved[-2:]:  # 最多展示最近 2 个
                    hints += f"  ✅ {g.description}\n"
                hints += "💡 考虑设定一个新目标来替代已完成的目标。\n"
            if active:
                name = agent.persona.name or agent.id
                in_progress = [g for g in active if g.status == "in_progress"]
                if in_progress:
                    hints += f"\n🎯 {name} 进行中的目标:\n"
                    for g in in_progress:
                        hints += f"  ▶ {g.description} ({g.progress:.0%})\n"
        return hints

    def _recent_events_text(self, count: int = RECENT_EVENT_COUNT) -> str:
        """Return recent event descriptions within a deterministic text budget."""
        lines = [
            f"  - {self._compact_event_description(event.description)}"
            for event in self.events[-count:]
        ]
        return "\n".join(lines)[:RECENT_EVENT_CONTEXT_CHAR_LIMIT]

    @staticmethod
    def _compact_event_description(description: str) -> str:
        """Normalize whitespace and cap one event copied into an LLM prompt."""
        compact = " ".join(description.split())
        if len(compact) <= EVENT_DESCRIPTION_CHAR_LIMIT:
            return compact
        return f"{compact[:EVENT_DESCRIPTION_CHAR_LIMIT - 1]}…"

    def _apply_action(self, event: SimEvent) -> list[SimEvent]:
        """Apply one agent_action event and return derived events."""
        action = event.data.get("action", "")
        handlers = {
            "send_message": self._handle_send_message,
            "set_goal": self._handle_set_goal,
            "observe": self._handle_observe,
            "think_aloud": self._handle_think_aloud,
            "submit_deliverable": self._handle_submit_deliverable,
            "complete_step": self._handle_submit_deliverable,
            "finish_task": self._handle_submit_deliverable,
        }
        handler = handlers.get(action)
        if not handler:
            logger.debug(f"WorldEngine._apply_action: unhandled action={action}")
            return []
        return handler(event)

    def _handle_send_message(self, event: SimEvent) -> list[SimEvent]:
        """Turn send_message into a targeted agent_message event。

        State 4: 如果 tool 闭包已处理（_handled_actions 中有记录），
        跳过——避免重复生成事件。仅在 stub 模式（Arena/Bench）下才在此创建事件。
        """
        source_id = event.source_agent_id or ""
        handled = getattr(self, "_handled_actions", set())
        if (source_id, "send_message") in handled:
            return []
        target = event.data.get("target") or event.data.get("target_name", "")
        if not target:
            return []
        target_id = _resolve_agent_id(target, self.agents, self._name_to_id)
        message = self._make_derived_event(
            "agent_message",
            event,
            event.data.get("content", event.description),
        )
        message.target_agent_ids = [target_id]
        message.data = {"tone": event.data.get("tone", "neutral")}
        return [message]

    def _handle_set_goal(self, event: SimEvent) -> list[SimEvent]:
        """Set or update an active goal for the source Agent。

        State 4: 如果 tool 闭包已经创建了该目标（agent.goals 中存在匹配项），
        跳过——避免重复创建。仅在 stub 模式（Arena/Bench）下才在此创建目标。
        """
        from models.agent import Goal

        agent = self.agents.get(event.source_agent_id or "")
        if not agent:
            return []
        desc = event.data.get("description", event.description)
        # 检查 tool 闭包是否已经创建了同名目标
        for g in agent.goals:
            if g.description == desc:
                # 目标已存在——重置状态和进度（Agent 重新确认）
                g.status = "active"
                g.progress = 0.0
                logger.debug(f"WorldEngine._handle_set_goal: agent={agent.id} goal re-set '{desc}'")
                return []
        # 未找到——stub 模式（Arena/Bench），在此创建
        agent.goals.append(
            Goal(
                id=f"g{len(agent.goals) + 1}",
                description=desc,
                priority=event.data.get("priority", 1),
                status="active",
                progress=0.0,
            )
        )
        logger.info(f"WorldEngine._handle_set_goal: agent={agent.id} new goal='{desc}' (stub mode)")
        return []

    def _handle_observe(self, event: SimEvent) -> list[SimEvent]:
        """Turn observe into a thought_stream event."""
        description = f"🔍 观察: {event.data.get('target', event.description)}"
        return [self._make_derived_event("thought_stream", event, description)]

    def _handle_think_aloud(self, event: SimEvent) -> list[SimEvent]:
        """Turn think_aloud into a thought_stream event。

        State 4: 如果 tool 闭包已处理——跳过，避免重复。
        """
        source_id = event.source_agent_id or ""
        handled = getattr(self, "_handled_actions", set())
        if (source_id, "think_aloud") in handled:
            return []
        description = event.data.get("thought", event.description)
        return [self._make_derived_event("thought_stream", event, description)]

    def _handle_submit_deliverable(self, event: SimEvent) -> list[SimEvent]:
        """处理 submit_deliverable / complete_step——记录交付物，不生成额外事件。"""
        return []

    def _make_derived_event(
        self,
        event_type: str,
        source: SimEvent,
        description: str,
    ) -> SimEvent:
        """Build an event derived from a tool action."""
        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type=event_type,
            source_agent_id=source.source_agent_id,
            description=description,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    def _update_relationships(self, events: list[SimEvent]) -> list[SimEvent]:
        """Apply interaction signals and return relationship_change events."""
        changes = extract_relationship_changes(events, set(self.agents.keys()))
        if not changes:
            return []
        relationship_events = apply_relationship_changes(self.relationships, changes)
        for event in relationship_events:
            event.world_id = self.world.id
            event.tick = self.current_tick
            event.created_at = datetime.now(timezone.utc).isoformat()
        logger.info(
            f"WorldEngine._update_relationships: tick={self.current_tick}, "
            f"{len(changes)} changes, {len(relationship_events)} rel_events"
        )
        return relationship_events

    async def _persist_events(self, events: list[SimEvent]):
        """Persist a list of simulation events to SQLite."""
        if not events:
            return
        for event in events:
            self._db.add(Event.from_sim_event(event))
        await self._db.commit()

    def inject_event(
        self,
        description: str,
        event_type: str = "world_event",
        target_agent_ids: list[str] | None = None,
    ) -> SimEvent:
        """Queue one external event for the intervention console.

        The API layer persists the returned event in the same transaction as
        the intervention history record. The engine keeps it in context and
        emits it through SSE at the start of the next running tick.
        """
        targets = list(target_agent_ids or [])
        data: dict[str, Any] = {}
        if event_type == "agent_message":
            data["message"] = description
        elif event_type == "agent_action":
            data.update({"action": "导演干预", "description": description})
        event = SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type=event_type,
            source_agent_id=None,
            target_agent_ids=targets,
            description=description,
            data=data,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self.events.append(event)
        if not hasattr(self, "_pending_injects"):
            self._pending_injects: list[SimEvent] = []
        self._pending_injects.append(event)
        if event_type == "agent_action" and targets:
            self._instruction_preempt_requested = True
            for target_id in targets:
                instruction = resolve_agent_instruction(
                    description,
                    target_id,
                    self.agents,
                )
                self._pending_agent_instructions.setdefault(
                    target_id,
                    [],
                ).append(instruction)
                if len(self.agents) > 1:
                    # Delay scheduling until the next context-injection boundary.
                    # This prevents an in-progress tick from consuming the route
                    # before the instructed Agent receives its private prompt.
                    route = [target_id]
                    if instruction.social_target_id is not None:
                        route.append(instruction.social_target_id)
                    self._pending_instruction_routes.append(route)
            # A targeted whisper is a high-priority command. Stop the current
            # ordinary GroupChat turn so the private prompt is injected at the
            # next tick boundary instead of waiting for a full conversation.
            cancel_token = getattr(self, "_group_cancel_token", None)
            if cancel_token is not None:
                cancel_token.cancel()
        logger.info(
            "WorldEngine.inject_event: type={}, targets={}, description={}",
            event_type,
            targets,
            description[:80],
        )
        return event
