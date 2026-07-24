"""World context, action, relationship, and persistence mixin."""

import uuid
from datetime import datetime, timezone
from typing import Any

from loguru import logger

from engines.world.relationships import (
    apply_relationship_changes,
    extract_relationship_changes,
)
from engines.world.resources import build_resource_context
from models.event import Event, SimEvent


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
        recent = self._recent_events_text(3)
        if recent:
            context += f"📋 最近事件:\n{recent}"
        # 目标完成提示——Agent 会看到自己的成就并被鼓励设定新目标
        goal_hints = self._build_goal_context()
        if goal_hints:
            context += goal_hints
        return context

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

    def _recent_events_text(self, count: int = 3) -> str:
        """Return a compact summary of the most recent World events."""
        recent = self.events[-count:]
        return "\n".join(f"  - {event.description}" for event in recent)

    def _apply_action(self, event: SimEvent) -> list[SimEvent]:
        """Apply one agent_action event and return derived events."""
        action = event.data.get("action", "")
        handlers = {
            "send_message": self._handle_send_message,
            "set_goal": self._handle_set_goal,
            "observe": self._handle_observe,
            "think_aloud": self._handle_think_aloud,
        }
        handler = handlers.get(action)
        if not handler:
            logger.debug(f"WorldEngine._apply_action: unhandled action={action}")
            return []
        return handler(event)

    def _handle_send_message(self, event: SimEvent) -> list[SimEvent]:
        """Turn send_message into a targeted agent_message event."""
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
        """Set or update an active goal for the source Agent."""
        from models.agent import Goal

        agent = self.agents.get(event.source_agent_id or "")
        if not agent:
            return []
        desc = event.data.get("description", event.description)
        # 同名目标 → 更新（防止重复）
        for g in agent.goals:
            if g.description == desc:
                g.status = "active"
                g.progress = 0.0
                logger.info(f"WorldEngine._handle_set_goal: agent={agent.id} re-set goal='{desc}'")
                return []
        # 新目标
        agent.goals.append(
            Goal(
                id=f"g{len(agent.goals) + 1}",
                description=desc,
                priority=event.data.get("priority", 1),
                status="active",
                progress=0.0,
            )
        )
        logger.info(f"WorldEngine._handle_set_goal: agent={agent.id} new goal='{desc}'")
        return []

    def _handle_observe(self, event: SimEvent) -> list[SimEvent]:
        """Turn observe into a thought_stream event."""
        description = f"🔍 观察: {event.data.get('target', event.description)}"
        return [self._make_derived_event("thought_stream", event, description)]

    def _handle_think_aloud(self, event: SimEvent) -> list[SimEvent]:
        """Turn think_aloud into a thought_stream event."""
        description = event.data.get("thought", event.description)
        return [self._make_derived_event("thought_stream", event, description)]

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

    def inject_event(self, description: str):
        """Inject one external world_event for the intervention console.

        The event is appended to the engine's event list, persisted,
        and queued for SSE delivery at the start of the next tick.
        """
        event = SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type="world_event",
            source_agent_id=None,
            description=description,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        self.events.append(event)
        if not hasattr(self, "_pending_injects"):
            self._pending_injects: list[SimEvent] = []
        self._pending_injects.append(event)
        logger.info(f"WorldEngine.inject_event: {description[:80]}")
