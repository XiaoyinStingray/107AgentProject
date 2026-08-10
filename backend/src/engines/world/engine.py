"""WorldEngine orchestration for ticks, streaming, and event dispatch."""

import asyncio
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from engines.agent_factory.factory import LifeAgent
from engines.agent_factory.memory import MemoryRetriever
from engines.world.goals import WorldGoalMixin
from engines.world.instructions import (
    AgentInstruction,
    build_private_instruction_context,
)
from engines.world.messages import END_TICK_TOKEN, WorldMessageMixin
from engines.world.state import WorldStateMixin, _resolve_agent_id
from engines.world.streaming import WorldStreamingMixin
from models.event import SimEvent
from models.world import WorldResponse

if TYPE_CHECKING:
    from engines.scene.engine import SceneBridge

__all__ = ["WorldEngine", "_resolve_agent_id"]


class WorldEngine(
    WorldStreamingMixin,
    WorldGoalMixin,
    WorldMessageMixin,
    WorldStateMixin,
):
    """Manage World ticks, Agent interaction, and event persistence."""

    def __init__(
        self,
        world: WorldResponse,
        agents: list[LifeAgent],
        db_session: AsyncSession,
        act_model_client=None,
    ):
        self.world = world
        self.agents: dict[str, LifeAgent] = {agent.id: agent for agent in agents}
        self._db = db_session
        self._act_model_client = act_model_client
        self._retriever = MemoryRetriever(db_session)
        self.events: list[SimEvent] = []
        self.relationships: dict[tuple[str, str], float] = {}
        self.current_tick = 0
        self.simulation_id: str | None = None

        # === State 4: Tool 副作用基础设施 ===
        self._pending_messages: list[dict] = []
        self._thought_log: dict[str, list[dict]] = {}
        self._pending_agent_instructions: dict[
            str, list[AgentInstruction]
        ] = {}
        self._pending_instruction_routes: list[list[str]] = []
        self._pending_speaker_ids: list[str] = []
        self._instruction_preempt_requested = False
        self._goal_check_pending = False

        # === State 4: SceneBridge 注入点（scenes.py start_scene 赋值）===
        self.scene_bridge: "SceneBridge | None" = None

        # === State 4 D2: 行为指纹采集器 ===
        from engines.agent_factory.fingerprint import FingerprintCollector
        self._fingerprint_collector = FingerprintCollector()

        # === State 8: Tick 约束与暂停信号 ===
        # 0 = 正常运行, 1 = 软约束（催促收束）, 2 = 硬约束临近（强制收束）
        self.tick_pressure: int = 0
        # asyncio.Event — SSE generator pause 时使用，替代轮询 sleep
        self._pause_event: asyncio.Event | None = None
        # 连续空 tick 计数——供 context builder 注入破冰提示
        self.consecutive_empty_ticks: int = 0

        self._reset_agent_contexts(agents)
        self._name_to_id = self._build_name_map(agents)

        # === State 4: 为每个 agent 注入闭包 tools ===
        from engines.agent_factory.tools import make_agent_tools
        for agent_id, agent in self.agents.items():
            if hasattr(agent, "_patch_tools"):
                tools = make_agent_tools(self, agent_id)
                agent._patch_tools(tools)

        logger.info(
            f"WorldEngine created: world={world.name!r}, "
            f"agents={len(agents)}, tick=0"
        )

    @staticmethod
    def _reset_agent_contexts(agents: list[LifeAgent]) -> None:
        """Clear reused AutoGen message history between World runs."""
        for agent in agents:
            try:
                context = getattr(agent.autogen_agent, "_model_context", None)
                messages = getattr(context, "_messages", None)
                if messages is not None:
                    messages.clear()
            except Exception as error:
                logger.warning(f"Unable to clear Agent context {agent.id}: {error}")

    @staticmethod
    def _build_name_map(agents: list[LifeAgent]) -> dict[str, str]:
        """Map AutoGen-safe participant names back to LifeAgent UUIDs."""
        return {agent.autogen_agent.name: agent.id for agent in agents}

    # ─────────────────────────────────────────────────────────────────
    # State 4: Tool 辅助方法（被闭包 tool 调用）
    # ─────────────────────────────────────────────────────────────────

    def _find_agent_by_name(self, name: str) -> LifeAgent | None:
        """按 persona.name 或 AutoGen name 查找 Agent。"""
        for agent in self.agents.values():
            if agent.persona.name == name:
                return agent
        # 也尝试按 AutoGen name 匹配
        for agent in self.agents.values():
            if agent.autogen_agent.name == name:
                return agent
        # 尝试按 UUID 前缀匹配
        for agent_id, agent in self.agents.items():
            if agent_id.startswith(name):
                return agent
        return None

    def _get_agent_public_state(self, agent_id: str) -> str:
        """获取 Agent 的公开可观察状态。"""
        agent = self.agents.get(agent_id)
        if agent is None:
            return "未知"
        return (
            f"情绪: {agent.emotional_state.label}, "
            f"能量: {agent.energy:.0f}/100"
        )

    async def tick(self) -> list[SimEvent]:
        """Advance one complete tick and return all generated events."""
        await self._inject_world_context()
        tick_events = await self._run_agent_tick()
        tick_events.extend(await self._post_process_tick(tick_events))
        await self._finish_tick(tick_events)
        logger.info(
            f"WorldEngine.tick {self.current_tick}: "
            f"{len(tick_events)} events, agents={len(self.agents)}"
        )
        return tick_events

    async def run(self, max_ticks: int = 30) -> list[SimEvent]:
        """Run ticks until the limit or a paused World is reached。

        State 4: World 结束时触发 MemoryConsolidator 固化教训。
        """
        all_events: list[SimEvent] = []
        for _ in range(max_ticks):
            if self.world.status == "paused":
                logger.info(f"WorldEngine.run: paused at tick {self.current_tick}")
                break
            all_events.extend(await self.tick())
        # === State 4 D1+D2: Episode 结束 → 记忆固化 + 指纹持久化 ===
        await self._consolidate_memories(all_events)
        await self._persist_fingerprints()
        return all_events

    async def _consolidate_memories(self, all_events: list[SimEvent]) -> None:
        """Episode 结束后为每个 Agent 固化教训记忆。

        结果存入 _pending_consolidation_events，供 SSE generator 发射。
        """
        if not self._act_model_client:
            return
        if not hasattr(self, "_pending_consolidation_events"):
            self._pending_consolidation_events: list[dict] = []

        from engines.agent_factory.memory import MemoryConsolidator
        consolidator = MemoryConsolidator(self._act_model_client, self._db)
        start_tick = 0
        end_tick = self.current_tick
        for agent_id in self.agents:
            try:
                lessons = await consolidator.consolidate(
                    agent_id, all_events, (start_tick, end_tick),
                )
                if lessons:
                    logger.info(
                        f"WorldEngine: agent={agent_id[:8]} "
                        f"consolidated {len(lessons)} lessons"
                    )
                    name = self.agents[agent_id].persona.name or agent_id[:8]
                    self._pending_consolidation_events.append({
                        "agent_id": agent_id,
                        "agent_name": name,
                        "lesson_count": len(lessons),
                        "lessons": [
                            {"content": m.content, "importance": m.importance}
                            for m in lessons
                        ],
                    })
            except Exception as e:
                logger.warning(f"WorldEngine._consolidate_memories failed for {agent_id[:8]}: {e}")

    async def tick_stream(self) -> AsyncGenerator[SimEvent, None]:
        """Stream one tick, including derived actions and relationships.

        Pending intervention events are yielded before the tick starts
        so the frontend sees them in real time.
        """
        # Yield any pending intervention events first
        pending = getattr(self, "_pending_injects", None)
        if pending:
            while pending:
                yield pending.pop(0)

        await self._inject_world_context()
        tick_events: list[SimEvent] = []
        async for event in self._stream_agent_tick():
            tick_events.append(event)
            yield event
        derived_events = await self._post_process_tick(tick_events)
        tick_events.extend(derived_events)
        for event in derived_events:
            yield event
        completed_tick = self.current_tick
        await self._finish_tick(tick_events)
        yield self._make_tick_boundary(completed_tick)

    async def _inject_world_context(self) -> None:
        """Inject World context and retrieved memories into every Agent。

        State 4: 使用 continuous 模式——Agent 的 system prompt 只在初始化时设置，
        世界状态以 UserMessage 追加到消息历史末尾。Agent 拥有持续的意识流。
        """
        self._activate_pending_instruction_routes()
        shared_context = self._build_world_context()
        for agent in self.agents.values():
            context = self._build_agent_context(agent, shared_context)
            memories = await self._retriever.retrieve(agent.id, context)
            agent.inject_context(context, memories, mode="continuous")

    def _activate_pending_instruction_routes(self) -> None:
        """Activate speaker routes at the same tick boundary as instructions."""
        has_pending_instruction = bool(self._pending_agent_instructions)
        while self._pending_instruction_routes:
            self._pending_speaker_ids.extend(
                self._pending_instruction_routes.pop(0)
            )
        if has_pending_instruction:
            self._instruction_preempt_requested = False

    def _build_agent_context(self, agent: LifeAgent, shared_context: str) -> str:
        """Add an explicit identity lock and participant aliases to World context."""
        display_name = agent.persona.name or agent.id
        aliases = "\n".join(
            f"- {member.autogen_agent.name} = {member.persona.name or member.id}"
            for member in self.agents.values()
        )
        pending_instructions = self._pending_agent_instructions.pop(
            agent.id,
            [],
        )
        instruction_context = build_private_instruction_context(
            pending_instructions
        )
        return (
            f"{shared_context}\n"
            "# 多人互动身份协议\n"
            f"你的唯一身份：{display_name}\n"
            f"你的内部发言标识：{agent.autogen_agent.name}\n"
            f"参与者标识对应关系：\n{aliases}\n"
            f"你生成的文本中，'我'只能指{display_name}。\n"
            "对话历史中每条消息的 source 是发言者身份的唯一依据。\n"
            "每次回复前先在内部核对自己的身份、上一位发言者和当前被点名对象，"
            "不要输出核对过程。\n"
            "不得代替其他参与者回答、行动或描述其内心。\n"
            f"{instruction_context}"
            "仅当没有未回答的问题、没有点名他人继续回应且本时间段互动已自然收束时，"
            f"才在回复末尾追加 {END_TICK_TOKEN}。"
        )

    async def _run_agent_tick(self) -> list[SimEvent]:
        """Dispatch a non-streaming tick to solo or GroupChat execution."""
        if len(self.agents) == 1:
            return await self._run_solo_tick(next(iter(self.agents.values())))
        return await self._run_group_tick()

    async def _stream_agent_tick(self) -> AsyncGenerator[SimEvent, None]:
        """Dispatch a streaming tick to solo or GroupChat execution."""
        if not self.agents:
            return
        if len(self.agents) == 1:
            stream = self._stream_solo_tick(next(iter(self.agents.values())))
        else:
            stream = self._stream_group_tick()
        async for event in stream:
            yield event

    async def _post_process_tick(self, tick_events: list[SimEvent]) -> list[SimEvent]:
        """Apply actions, analyze relationships, update goals, and detect conflicts。
        State 4: 先处理 tool 闭包产生的副作用，再通过 _apply_action 生成 SSE 事件。
        使用 _handled_actions 集合避免 tool 闭包和 _apply_action 重复生成事件。
        Team 任务模式跳过关系和冲突检测。"""
        derived: list[SimEvent] = []
        self._handled_actions: set[tuple[str, str]] = set()

        # === State 4: 从 tool 副作用构建 SSE 事件 ===
        derived.extend(self._build_message_events())
        derived.extend(self._build_thought_events())

        for event in tick_events:
            if event.type == "agent_action":
                derived.extend(self._apply_action(event))
        goal_events = await self._update_goal_progress(tick_events)
        relationship_events = self._update_relationships([*tick_events, *derived])
        conflict_events = self._detect_conflict()
        return [*derived, *goal_events, *relationship_events, *conflict_events]

    def _build_message_events(self) -> list[SimEvent]:
        """从 _pending_messages 构建 agent_message SSE 事件。

        同时记录 (agent_id, "send_message") 到 _handled_actions，
        防止 _apply_action 重复生成事件。
        """
        pending = getattr(self, "_pending_messages", [])
        if not pending:
            return []
        events = []
        while pending:
            msg = pending.pop(0)
            target_id = msg.get("to", "")
            content = msg.get("content", "")
            source_id = msg.get("from", "")
            self._handled_actions.add((source_id, "send_message"))
            event = SimEvent(
                id=str(uuid.uuid4()),
                world_id=self.world.id,
                tick=self.current_tick,
                type="agent_message",
                source_agent_id=source_id,
                target_agent_ids=[target_id] if target_id else [],
                description=f"{msg.get('from_name', '?')} 对 {msg.get('to_name', '?')} 说: {content}",
                data={"tone": msg.get("tone", "neutral"), "message": content},
                created_at=datetime.now(timezone.utc).isoformat(),
            )
            events.append(event)
        return events

    def _build_thought_events(self) -> list[SimEvent]:
        """从 _thought_log 构建 thought_stream SSE 事件。

        同时记录 (agent_id, "think_aloud") 到 _handled_actions。
        """
        thought_log = getattr(self, "_thought_log", {})
        if not thought_log:
            return []
        events = []
        for agent_id, thoughts in thought_log.items():
            while thoughts:
                t = thoughts.pop(0)
                self._handled_actions.add((agent_id, "think_aloud"))
                events.append(SimEvent(
                    id=str(uuid.uuid4()),
                    world_id=self.world.id,
                    tick=t.get("tick", self.current_tick),
                    type="thought_stream",
                    source_agent_id=agent_id,
                    description=t.get("thought", ""),
                    created_at=datetime.now(timezone.utc).isoformat(),
                ))
        return events

    def _detect_conflict(self) -> list[SimEvent]:
        """检测 Agent 间的目标冲突，生成 conflict_detected 事件。"""
        from engines.world.conflict import (
            build_conflict_events,
            detect_goal_conflicts,
        )

        if len(self.agents) < 2:
            return []
        agent_names = {
            aid: agent.persona.name or aid
            for aid, agent in self.agents.items()
        }
        conflicts = detect_goal_conflicts(self.agents)
        return build_conflict_events(
            conflicts, self.world.id, self.current_tick, agent_names,
        )

    async def _finish_tick(self, tick_events: list[SimEvent]) -> None:
        """Persist and archive a completed tick, then advance the clock。

        State 4: 每 tick 采集行为指纹 + 持久化笔记 + 增量记忆固化。
        """
        await self._persist_events(tick_events)
        self.events.extend(tick_events)

        # === State 4 D2: 行为指纹采集 ===
        self._collect_fingerprints(tick_events)

        # === State 4 Step 78: 持久化 Agent 笔记 ===
        await self._persist_agent_notes()

        # === State 4 D1: 增量记忆固化（每 10 tick，fire-and-forget 不阻塞 SSE） ===
        if self.current_tick > 0 and self.current_tick % 10 == 0:
            import asyncio as _asyncio
            _asyncio.ensure_future(self._incremental_consolidation(tick_events))

        self.current_tick += 1
        self.world.current_tick = self.current_tick

    # ── State 4 D2: 行为指纹采集 ────────────────────────────

    def _collect_fingerprints(self, tick_events: list[SimEvent]) -> None:
        """每 tick 为每个 Agent 采集行为轨迹。"""
        for agent_id, agent in self.agents.items():
            tools_called: list[str] = []
            messages: list[dict] = []
            targets: list[str] = []

            for e in tick_events:
                if e.source_agent_id == agent_id:
                    if e.type == "agent_action":
                        tools_called.append(e.data.get("action", ""))
                    elif e.type == "agent_message":
                        messages.append({"content": e.description})
                        if e.target_agent_ids:
                            targets.extend(e.target_agent_ids)

            emotion_before = getattr(
                getattr(agent, "emotional_state", None), "label", "neutral"
            )
            emotion_after = emotion_before

            self._fingerprint_collector.collect(
                agent_id=agent_id,
                tick=self.current_tick,
                tools_called=tools_called,
                messages=messages,
                emotion_before=emotion_before,
                emotion_after=emotion_after,
                targets=targets,
            )

    # ── State 4 Step 78: 笔记持久化 ──────────────────────────

    async def _persist_agent_notes(self) -> None:
        """将 Agent 的内存笔记持久化到 SQLite。"""
        import json as _json
        from sqlalchemy import update as _upd
        from models.agent_orm import AgentRow

        for agent_id, agent in self.agents.items():
            if not hasattr(agent, "_notes") or not agent._notes:
                continue
            try:
                notes_json = _json.dumps(agent._notes, ensure_ascii=False)
                await self._db.execute(
                    _upd(AgentRow)
                    .where(AgentRow.id == agent_id)
                    .values(notes_json=notes_json)
                )
            except Exception as e:
                logger.warning(f"Failed to persist notes for {agent_id[:8]}: {e}")
        await self._db.commit()

    # ── State 4 D2: 指纹持久化 ────────────────────────────────

    async def _persist_fingerprints(self) -> None:
        """World 结束时将行为指纹持久化到 AgentRow。"""
        import json as _json
        from sqlalchemy import update as _upd
        from models.agent_orm import AgentRow

        for agent_id in self.agents:
            fp = self._fingerprint_collector.analyze(agent_id)
            fp_dict = fp.to_dict()
            try:
                await self._db.execute(
                    _upd(AgentRow)
                    .where(AgentRow.id == agent_id)
                    .values(fingerprint_json=_json.dumps(fp_dict, ensure_ascii=False))
                )
            except Exception as e:
                logger.warning(f"Failed to persist fingerprint for {agent_id[:8]}: {e}")
        await self._db.commit()

    # ── State 4 D1: 增量记忆固化 ─────────────────────────────

    async def _incremental_consolidation(self, tick_events: list[SimEvent]) -> None:
        """每 10 tick 做一次轻量记忆固化。"""
        if not self._act_model_client:
            return
        from engines.agent_factory.memory import MemoryConsolidator
        consolidator = MemoryConsolidator(self._act_model_client, self._db)
        recent = self.events[-50:] + tick_events
        start = max(0, self.current_tick - 10)
        for agent_id in self.agents:
            try:
                await consolidator.consolidate(agent_id, recent, (start, self.current_tick))
            except Exception as e:
                logger.debug(f"Incremental consolidation skipped for {agent_id[:8]}: {e}")

    def _make_tick_boundary(self, tick: int) -> SimEvent:
        """Build the terminal boundary event for one streamed tick."""
        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=tick,
            type="tick_boundary",
            description=f"Tick {tick} 完成",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
