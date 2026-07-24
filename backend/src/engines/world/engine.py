"""WorldEngine orchestration for ticks, streaming, and event dispatch."""

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from engines.agent_factory.factory import LifeAgent
from engines.agent_factory.memory import MemoryRetriever
from engines.world.messages import END_TICK_TOKEN, WorldMessageMixin
from engines.world.state import WorldStateMixin, _resolve_agent_id
from engines.world.streaming import WorldStreamingMixin
from models.event import SimEvent
from models.world import WorldResponse

__all__ = ["WorldEngine", "_resolve_agent_id"]


class WorldEngine(WorldStreamingMixin, WorldMessageMixin, WorldStateMixin):
    """Manage World ticks, Agent interaction, and event persistence."""

    def __init__(
        self,
        world: WorldResponse,
        agents: list[LifeAgent],
        db_session: AsyncSession,
    ):
        self.world = world
        self.agents: dict[str, LifeAgent] = {agent.id: agent for agent in agents}
        self._db = db_session
        self._retriever = MemoryRetriever(db_session)
        self.events: list[SimEvent] = []
        self.relationships: dict[tuple[str, str], float] = {}
        self.current_tick = 0
        self.simulation_id: str | None = None
        self._reset_agent_contexts(agents)
        self._name_to_id = self._build_name_map(agents)
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
        """Run ticks until the limit or a paused World is reached."""
        all_events: list[SimEvent] = []
        for _ in range(max_ticks):
            if self.world.status == "paused":
                logger.info(f"WorldEngine.run: paused at tick {self.current_tick}")
                break
            all_events.extend(await self.tick())
        return all_events

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
        """Inject World context and retrieved memories into every Agent."""
        shared_context = self._build_world_context()
        for agent in self.agents.values():
            context = self._build_agent_context(agent, shared_context)
            memories = await self._retriever.retrieve(agent.id, context)
            agent.inject_context(context, memories)

    def _build_agent_context(self, agent: LifeAgent, shared_context: str) -> str:
        """Add an explicit identity lock and participant aliases to World context."""
        display_name = agent.persona.name or agent.id
        aliases = "\n".join(
            f"- {member.autogen_agent.name} = {member.persona.name or member.id}"
            for member in self.agents.values()
        )
        return (
            f"{shared_context}\n"
            "# 多人互动身份协议\n"
            f"你的唯一身份：{display_name}\n"
            f"你的内部发言标识：{agent.autogen_agent.name}\n"
            f"参与者标识对应关系：\n{aliases}\n"
            f"你生成的文本中，‘我’只能指{display_name}。\n"
            "对话历史中每条消息的 source 是发言者身份的唯一依据。\n"
            "每次回复前先在内部核对自己的身份、上一位发言者和当前被点名对象，"
            "不要输出核对过程。\n"
            "不得代替其他参与者回答、行动或描述其内心。\n"
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
        """Apply actions, analyze relationships, and update goal progress."""
        derived: list[SimEvent] = []
        for event in tick_events:
            if event.type == "agent_action":
                derived.extend(self._apply_action(event))
        goal_events = await self._update_goal_progress(tick_events)
        relationship_events = self._update_relationships([*tick_events, *derived])
        return [*derived, *goal_events, *relationship_events]

    async def _update_goal_progress(self, tick_events: list[SimEvent]) -> list[SimEvent]:
        """用 LLM 判断 Agent 是否在推进目标。每 2 tick 检测一次。
        返回 goal_update 事件供 SSE 推送。"""
        if self.current_tick % 2 != 0:
            return []  # 隔 tick 检测，省 LLM 调用
        goal_events: list[SimEvent] = []
        for agent in self.agents.values():
            if not hasattr(agent, "goals") or not agent.goals:
                continue
            active_goals = [g for g in agent.goals if g.status in ("active", "in_progress")]
            if not active_goals:
                continue
            # 收集该 Agent 近 2 tick 的输出
            texts: list[str] = []
            for e in tick_events:
                if e.source_agent_id != agent.id:
                    continue
                if e.type in ("thought_stream", "agent_message"):
                    content = e.data.get("content", e.description) if e.data else e.description
                    texts.append(str(content))
            if not texts:
                continue
            combined = " ".join(texts)[:800]
            # LLM 批量检测
            scores = await self._llm_check_goals(agent.persona.name or agent.id, active_goals, combined)
            for goal in active_goals:
                score = scores.get(goal.description, 0.0)
                if score <= 0.3:
                    continue  # 无关，不推进
                old_progress = goal.progress
                goal.progress = min(1.0, goal.progress + score)
                goal.status = "achieved" if goal.progress >= 1.0 else "in_progress"
                display_name = agent.persona.name or agent.id
                desc_text = (
                    f"🎉 {display_name} 达成目标「{goal.description}」！"
                    if goal.status == "achieved"
                    else f"🎯 {display_name} 推进目标「{goal.description}」({goal.progress:.0%})"
                )
                if goal.status != "in_progress" or old_progress == 0:
                    logger.info(
                        f"Goal progress: agent={agent.id} "
                        f"goal='{goal.description}' status={goal.status} "
                        f"progress={goal.progress:.2f} score={score:.2f}"
                    )
                    import uuid as _uuid
                    from datetime import datetime as _dt, timezone as _tz
                    goal_events.append(SimEvent(
                        id=str(_uuid.uuid4()),
                        world_id=self.world.id,
                        tick=self.current_tick,
                        type="goal_update",
                        timestamp=_dt.now(_tz.utc).isoformat(),
                        source_agent_id=agent.id,
                        target_agent_ids=[],
                        description=desc_text,
                        data={
                            "goal_id": goal.id,
                            "description": goal.description,
                            "status": goal.status,
                            "progress": goal.progress,
                        },
                        created_at=_dt.now(_tz.utc).isoformat(),
                    ))
        return goal_events

    async def _llm_check_goals(self, name: str, goals: list, text: str) -> dict[str, float]:
        """LLM 批量判断多个目标的进展。返回 {goal_description: 0.0-1.0}。"""
        if not goals or not text:
            return {}
        goal_list = "\n".join(f"{i+1}. {g.description}" for i, g in enumerate(goals))
        prompt = (
            f"Agent「{name}」有以下目标：\n{goal_list}\n\n"
            f"Agent 最近的发言/思考：\n{text}\n\n"
            f"对每个目标，判断 Agent 是否在推进它。返回 JSON 数组：\n"
            f'[{{"index":1,"score":0.0}}, ...]\n'
            f"score: 0=完全无关, 0.3=间接提及, 0.5=在努力推进, 0.8=接近完成, 1.0=已经达成。\n"
            f"保守打分——只有明确证据才给高分。只返回 JSON 数组，不要其他文字。"
        )
        try:
            from llm.client import create_model_client
            from autogen_core.models import UserMessage
            client = create_model_client()
            import json as _json
            result = await client.create(
                messages=[UserMessage(content=prompt, source="goal_checker")],
                json_output=True,
            )
            raw = str(result.content).strip()
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            items = _json.loads(raw)
            if not isinstance(items, list):
                logger.warning(f"_llm_check_goals: expected list, got {type(items).__name__}: {raw[:120]}")
                return {}
            scores: dict[str, float] = {}
            for it in items:
                if not isinstance(it, dict) or "index" not in it:
                    continue
                idx = int(it["index"]) - 1
                if 0 <= idx < len(goals):
                    scores[goals[idx].description] = float(it.get("score", 0.0))
            return scores
        except Exception as exc:
            logger.warning(f"_llm_check_goals failed for agent={name}: {exc}")
            return {}


    async def _finish_tick(self, tick_events: list[SimEvent]) -> None:
        """Persist and archive a completed tick, then advance the clock."""
        await self._persist_events(tick_events)
        self.events.extend(tick_events)
        self.current_tick += 1
        self.world.current_tick = self.current_tick

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
