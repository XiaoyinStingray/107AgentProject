"""World context, action, relationship, and persistence mixin."""

import uuid
from datetime import datetime, timezone
from typing import Any

from loguru import logger

from engines.world.relationships import (
    apply_relationship_changes,
    extract_relationship_changes,
    assess_tick_relationships_llm,
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
    # Tool 副作用基础设施（stubs: engine.py __init__ 覆盖）
    _pending_agent_instructions: Any  # dict[str, list[AgentInstruction]]
    _pending_instruction_routes: Any  # list[list[str]]
    _instruction_preempt_requested: Any
    _group_cancel_token: Any
    # LLM 客户端引用
    _act_model_client: Any
    # State 8: LLM 关系评估延迟结果
    _pending_llm_relationships: Any
    _llm_relation_task: Any

    def _build_world_context(self) -> str:
        """Build the current tick context injected into every Agent."""
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
        # State 8: Tick 压力——软约束/硬约束的收束提示 + 空 tick 破冰
        pressure = self._build_tick_pressure_context()
        if pressure:
            context += pressure
        icebreaker = self._build_icebreaker_context()
        if icebreaker:
            context += icebreaker
        return context

    def _build_tick_pressure_context(self) -> str:
        """根据当前 tick_pressure 级别生成收束提示。

        pressure=1（软约束）：催促 Agent 开始收束对话。
        pressure=2（硬约束临近）：强制要求立即结束。
        """
        pressure = getattr(self, "tick_pressure", 0)
        if pressure <= 0:
            return ""

        if pressure >= 2:
            return (
                "\n⚠️ 本场景即将结束——这是最后的时间段。\n"
                "请立即做一次简短的告别或总结（10-20字），"
                "表达你对当前互动的最终想法。\n"
                "不要再开启新话题或提出新问题。\n"
                "请在你的回复末尾加上结束标记，通知系统本轮对话已完成。\n"
            )

        # pressure == 1: 软约束
        return (
            "\n⏳ 本场景已进入尾声阶段。\n"
            "请在接下来的对话中自然地收束话题——"
            "可以做一次简短的总结、告别或对未来的展望。\n"
            "避免展开新的长篇讨论。\n"
        )

    def _build_icebreaker_context(self) -> str:
        """当对话停滞（连续空 tick）时注入破冰提示。

        只对多人剧场生效——单人模式有自己的节奏控制。
        """
        empty_count = getattr(self, "consecutive_empty_ticks", 0)
        if empty_count <= 0 or len(self.agents) < 2:
            return ""

        if empty_count == 1:
            # 首次空 tick——温和提醒
            names = ", ".join(
                agent.persona.name or agent.id for agent in self.agents.values()
            )
            return (
                "\n💬 上一个时间段没有人说话。\n"
                f"在场的人物有：{names}。\n"
                "请根据你的角色和当前场景，主动发起一段对话——"
                "可以是对当前处境的感受、对他人的观察，或者一个简单的问候。\n"
            )
        # 连续 2+ 空 tick——更强的破冰 + 外部事件暗示
        return (
            "\n🔔 已经沉默了一段时间。\n"
            "请立即发起互动——对在场的人说点什么。\n"
            "如果实在无话可说，可以描述你此刻的内心感受（用 think_aloud），"
            "或者观察周围环境（用 observe）。\n"
            "不要让对话中断。\n"
        )

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
        """Apply interaction signals and return relationship_change events。

        State 8: 每 3 tick 触发 LLM 深度关系评估（fire-and-forget），
        结果在后续 tick 的 post-processing 中通过 _pending_llm_relationships 合并。
        关键词检测在每个 tick 即时生效。
        """
        # 关键词检测（快速路径——所有 tick）
        kw_changes = extract_relationship_changes(events, set(self.agents.keys()))

        # 合并上一轮 LLM 评估的延迟结果
        pending_llm = getattr(self, "_pending_llm_relationships", None) or []
        if pending_llm:
            self._pending_llm_relationships = []

        # 合并去重（LLM 结果优先级更高）
        all_changes: dict[tuple[str, str], tuple[str, str, str, float]] = {}
        for c in kw_changes:
            all_changes[(c[0], c[1])] = c
        for c in pending_llm:
            all_changes[(c[0], c[1])] = c

        # 触发本轮 LLM 评估（fire-and-forget，结果下一 tick 生效）
        if self.current_tick > 0 and self.current_tick % 3 == 0:
            agent_names = {
                aid: agent.persona.name or aid
                for aid, agent in self.agents.items()
            }
            model_client = getattr(self, "_act_model_client", None)
            if model_client and len(agent_names) >= 2:
                import asyncio as _asyncio
                # 如果上一轮评估还在跑就先取消（避免重叠写 _pending_llm_relationships）
                prev_task = getattr(self, "_llm_relation_task", None)
                if prev_task and not prev_task.done():
                    prev_task.cancel()
                self._llm_relation_task = _asyncio.ensure_future(
                    self._run_llm_relationship_assessment(
                        events, agent_names, model_client
                    )
                )

        changes = list(all_changes.values())
        if not changes:
            return []
        relationship_events = apply_relationship_changes(self.relationships, changes)
        for event in relationship_events:
            event.world_id = self.world.id
            event.tick = self.current_tick
            event.created_at = datetime.now(timezone.utc).isoformat()
        logger.info(
            f"WorldEngine._update_relationships: tick={self.current_tick}, "
            f"kw={len(kw_changes)}, pending_llm={len(pending_llm)}, "
            f"merged={len(changes)}, rel_events={len(relationship_events)}"
        )
        return relationship_events

    async def _run_llm_relationship_assessment(
        self,
        events: list[SimEvent],
        agent_names: dict[str, str],
        model_client: Any,
    ) -> None:
        """Fire-and-forget: 运行 LLM 关系评估，结果存入 _pending_llm_relationships。"""
        try:
            llm_changes = await assess_tick_relationships_llm(
                events, agent_names, model_client,
                self.world.id, self.current_tick,
            )
            if not hasattr(self, "_pending_llm_relationships"):
                self._pending_llm_relationships = []
            self._pending_llm_relationships = llm_changes
        except Exception:
            pass  # LLM 评估失败不影响主流程

    async def _persist_events(self, events: list[SimEvent]):
        """Persist a list of simulation events to SQLite (idempotent).

        Uses INSERT OR IGNORE semantics — duplicate event IDs are silently
        skipped instead of crashing the transaction.
        """
        if not events:
            return

        for event in events:
            orm = Event.from_sim_event(event)
            try:
                self._db.add(orm)
                await self._db.flush()
            except Exception:
                # 重复 ID 或约束冲突 → 跳过，不中断后续事件
                await self._db.rollback()
                logger.warning(
                    f"_persist_events: skipped duplicate event {event.id[:8]} "
                    f"(tick={event.tick}, type={event.type})"
                )
        # 全部成功后统一提交（避免 rollback 后再 commit 导致事务状态冲突）
        try:
            await self._db.commit()
        except Exception:
            await self._db.rollback()

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
