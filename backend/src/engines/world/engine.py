"""
WorldEngine — 世界引擎：tick 推进 + 事件分发 + （关系演化 — Step 10）。

核心接口:
    engine = WorldEngine(world, agents, db_session)
    events = await engine.tick()   # 推进一个 tick
    all_events = await engine.run(max_ticks=30)  # 运行整个模拟

依赖:
    - engines.agent_factory: LifeAgent
    - engines.agent_factory.memory: MemoryRetriever
    - models.event: SimEvent, Event (ORM)
    - models.world: WorldResponse
    - autogen_agentchat: AssistantAgent, RoundRobinGroupChat
"""

import uuid
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from models.event import Event, SimEvent
from models.world import WorldResponse
from engines.agent_factory.factory import LifeAgent
from engines.agent_factory.memory import MemoryRetriever


# =============================================================================
# WorldEngine
# =============================================================================


class WorldEngine:
    """世界引擎：管理 tick 推进、事件生成和分发。

    每个 World 对应一个 WorldEngine 实例。
    Step 09 实现核心 tick 流程；Step 10 补全关系演化。

    用法:
        engine = WorldEngine(world, agents, db_session)
        events = await engine.tick()
    """

    def __init__(
        self,
        world: WorldResponse,
        agents: list[LifeAgent],
        db_session: AsyncSession,
    ):
        self.world = world
        self.agents: dict[str, LifeAgent] = {a.id: a for a in agents}
        self._db = db_session
        self._retriever = MemoryRetriever(db_session)
        self.events: list[SimEvent] = []
        self.current_tick: int = 0

        logger.info(
            f"WorldEngine created: world={world.name!r}, "
            f"agents={len(agents)}, tick=0"
        )

    # -------------------------------------------------------------------------
    # 公开接口 — tick & run
    # -------------------------------------------------------------------------

    async def tick(self) -> list[SimEvent]:
        """推进一个 tick，返回本 tick 产生的所有事件。

        流程:
            1. 注入当前世界状态到每个 Agent（context + memories）
            2. 运行 Agent 交互（solo 或 group chat）
            3. 解析 tool calls → 更新世界状态（Step 10 补全）
            4. 更新关系（Step 10 补全）
            5. 持久化事件到 SQLite

        Returns:
            本 tick 产生的 SimEvent 列表
        """
        tick_events: list[SimEvent] = []

        # ---- 1. 注入世界状态 ----
        context = self._build_world_context()
        for agent in self.agents.values():
            memories = await self._retriever.retrieve(agent.id, context)
            agent.inject_context(context, memories)

        # ---- 2. 运行 Agent 交互 ----
        if len(self.agents) == 1:
            tick_events += await self._run_solo_tick(
                list(self.agents.values())[0]
            )
        else:
            tick_events += await self._run_group_tick()

        # ---- 3. 应用 tool call 效果（Step 10 补全）——-
        for event in tick_events:
            if event.type == "agent_action":
                self._apply_action(event)

        # ---- 4. 更新关系（Step 10 补全）——-
        self._update_relationships(tick_events)

        # ---- 5. 持久化 ----
        await self._persist_events(tick_events)

        # 推进时钟
        self.current_tick += 1
        self.events.extend(tick_events)

        logger.info(
            f"WorldEngine.tick {self.current_tick}: "
            f"{len(tick_events)} events, agents={len(self.agents)}"
        )
        return tick_events

    async def run(self, max_ticks: int = 30) -> list[SimEvent]:
        """运行整个模拟——逐 tick 推进直到达到 max_ticks 或被暂停。

        Args:
            max_ticks: 最大 tick 数（默认 30）

        Returns:
            全部事件列表
        """
        all_events: list[SimEvent] = []
        for i in range(max_ticks):
            if self.world.status == "paused":
                logger.info(f"WorldEngine.run: paused at tick {self.current_tick}")
                break
            events = await self.tick()
            all_events.extend(events)
            logger.debug(f"WorldEngine.run: tick {i + 1}/{max_ticks} done")
        return all_events

    # -------------------------------------------------------------------------
    # 世界上下文
    # -------------------------------------------------------------------------

    def _build_world_context(self) -> str:
        """构建当前 tick 的世界上下文文本——注入每个 Agent 的 system prompt。

        从 Scenario.environment_params 提取位置/天气等环境参数。
        """
        params = self.world.scenario.environment_params
        location = params.get("location", "未知")
        weather = params.get("weather", "晴")
        agent_names = ", ".join(
            a.persona.name or a.id for a in self.agents.values()
        )

        context = (
            f"⏰ 第 {self.current_tick} 个时间段\n"
            f"📍 地点: {location}\n"
            f"🌤️ 天气: {weather}\n"
            f"👥 在场人物: {agent_names}\n"
        )

        # 附加最近 3 个事件作为上下文
        recent = self._recent_events_text(3)
        if recent:
            context += f"📋 最近事件:\n{recent}"

        return context

    def _recent_events_text(self, n: int = 3) -> str:
        """最近 N 个事件的文本摘要。"""
        if not self.events:
            return ""
        recent = self.events[-n:]
        return "\n".join(f"  - {e.description}" for e in recent)

    # -------------------------------------------------------------------------
    # Agent 交互
    # -------------------------------------------------------------------------

    async def _run_solo_tick(self, agent: LifeAgent) -> list[SimEvent]:
        """单人模式——Agent 自言自语 / 思考。

        给 Agent 一个"请描述你现在的想法和行动"的提示，
        让 Agent 通过 think_aloud / observe 等 tool 产生事件流。
        """
        from autogen_agentchat.messages import TextMessage
        from autogen_core import CancellationToken

        prompt = (
            f"现在是第 {self.current_tick} 个时间段。"
            f"请描述你现在的想法、感受和打算做的事情。"
            f"使用 think_aloud 记录你的想法，使用 set_goal 设定目标，"
            f"使用 observe 观察周围环境。"
        )

        events: list[SimEvent] = []
        try:
            response = await agent.autogen_agent.on_messages(
                [TextMessage(content=prompt, source="world")],
                cancellation_token=CancellationToken(),
            )
            events = self._extract_events_from_response(
                response, agent.id
            )
        except Exception as e:
            logger.error(f"WorldEngine._run_solo_tick: agent={agent.id} error: {e}")
            events.append(self._make_error_event(agent.id, str(e)))

        return events

    async def _run_group_tick(self) -> list[SimEvent]:
        """多人模式——AutoGen RoundRobinGroupChat 驱动多 Agent 对话。

        创建一个自动轮流发言的 GroupChat，初始任务来自世界上下文。
        """
        from autogen_agentchat.teams import RoundRobinGroupChat

        participants: list = [a.autogen_agent for a in self.agents.values()]
        team = RoundRobinGroupChat(
            participants=participants,  # type: ignore[arg-type] — AutoGen 协变类型未标注
            max_turns=len(self.agents) * 3,
        )

        task = (
            f"场景：{self.world.scenario.name} — {self.world.scenario.description}\n"
            f"现在是第 {self.current_tick} 个时间段。"
            f"请根据你的角色设定自然地互动。你可以说话、思考、行动。"
        )

        events: list[SimEvent] = []
        try:
            result = await team.run(task=task)
            # result 是 TaskResult，其中 messages 包含了所有 Agent 的消息
            for msg in result.messages:
                source_id = getattr(msg, "source", "world")
                if source_id == "world":
                    continue
                evt = self._convert_message_to_event(msg)
                if evt:
                    events.append(evt)
        except Exception as e:
            logger.error(f"WorldEngine._run_group_tick error: {e}")
            events.append(self._make_error_event("world", str(e)))

        return events

    # -------------------------------------------------------------------------
    # 消息转换
    # -------------------------------------------------------------------------

    def _convert_message_to_event(self, msg) -> SimEvent | None:
        """将 AutoGen 消息转为 SimEvent。"""
        content = getattr(msg, "content", "")
        if not content:
            return None

        source = getattr(msg, "source", "world")
        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type="agent_message",
            source_agent_id=source,
            description=str(content)[:500],
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    def _extract_events_from_response(
        self, response, agent_id: str
    ) -> list[SimEvent]:
        """从 Agent 的响应中提取事件（solo 模式）。

        AutoGen 0.7 的 on_messages 返回 Response 对象，其中 inner_messages 是消息列表。
        """
        messages = getattr(response, "inner_messages", [])
        if not messages and hasattr(response, "chat_message"):
            messages = [response.chat_message]

        events: list[SimEvent] = []
        for msg in messages:
            content = getattr(msg, "content", "")
            if content:
                events.append(
                    SimEvent(
                        id=str(uuid.uuid4()),
                        world_id=self.world.id,
                        tick=self.current_tick,
                        type="thought_stream",
                        source_agent_id=agent_id,
                        description=str(content)[:500],
                        created_at=datetime.now(timezone.utc).isoformat(),
                    )
                )
        return events

    def _make_error_event(self, agent_id: str, error: str) -> SimEvent:
        """生成错误事件——当 Agent 调用失败时。"""
        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type="world_event",
            source_agent_id=None,
            description=f"⚠️ 错误 (agent={agent_id}): {error[:300]}",
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    # -------------------------------------------------------------------------
    # Tool call 应用（Step 10 补全）
    # -------------------------------------------------------------------------

    def _apply_action(self, event: SimEvent):
        """将 agent_action 事件施加到世界状态。

        Step 10 实现：解析 tool call 结果，更新 Agent 状态、发送消息等。
        当前 stub——仅记录日志。
        """
        logger.debug(f"WorldEngine._apply_action (stub): {event.description[:100]}")

    # -------------------------------------------------------------------------
    # 关系演化（Step 10 补全）
    # -------------------------------------------------------------------------

    def _update_relationships(self, events: list[SimEvent]):
        """根据本 tick 的事件更新 Agent 间关系。

        Step 10 实现：分析消息和行动中的人际信号，更新关系分数。
        当前 stub——仅记录日志。
        """
        msg_count = sum(1 for e in events if e.type == "agent_message")
        if msg_count > 0:
            logger.debug(
                f"WorldEngine._update_relationships (stub): "
                f"{msg_count} messages in tick {self.current_tick}"
            )

    # -------------------------------------------------------------------------
    # 持久化
    # -------------------------------------------------------------------------

    async def _persist_events(self, events: list[SimEvent]):
        """将事件列表写入 SQLite events 表。"""
        if not events:
            return
        for evt in events:
            orm = Event.from_sim_event(evt)
            self._db.add(orm)
        await self._db.commit()
        logger.debug(
            f"WorldEngine._persist_events: {len(events)} events saved"
        )

    # -------------------------------------------------------------------------
    # 注入事件（用户干预——M7 干预台）
    # -------------------------------------------------------------------------

    def inject_event(self, description: str):
        """注入外部事件（用户干预）。"""
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
        logger.info(f"WorldEngine.inject_event: {description[:80]}")
