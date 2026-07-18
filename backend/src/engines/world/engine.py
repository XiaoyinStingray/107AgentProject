"""
WorldEngine — 世界引擎：tick 推进 + 事件分发 + 关系演化。

核心接口:
    engine = WorldEngine(world, agents, db_session)
    events = await engine.tick()   # 推进一个 tick
    all_events = await engine.run(max_ticks=30)  # 运行整个模拟
"""

import json
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from models.event import Event, SimEvent
from models.world import WorldResponse
from engines.agent_factory.factory import LifeAgent
from engines.agent_factory.memory import MemoryRetriever
from engines.world.relationships import (
    apply_relationship_changes,
    extract_relationship_changes,
)


# =============================================================================
# 辅助函数
# =============================================================================

def _resolve_agent_id(name_or_id: str, agents: dict[str, LifeAgent],
                      name_map: dict[str, str] | None = None) -> str:
    """按名称或 ID 查找 Agent，返回其 ID。

    查找顺序：精确 ID 匹配 → persona.name 匹配 → AutoGen name 映射。
    都找不到时原样返回（由调用方处理）。

    Args:
        name_or_id: Agent 名称或 ID
        agents: {agent_id: LifeAgent}
        name_map: {autogen_name: agent_id} 反向映射（可选）

    Returns:
        匹配到的 agent_id，或原始输入
    """
    if name_or_id in agents:
        return name_or_id
    for aid, agent in agents.items():
        if agent.persona.name == name_or_id:
            return aid
    if name_map and name_or_id in name_map:
        return name_map[name_or_id]
    return name_or_id


# =============================================================================
# WorldEngine
# =============================================================================

class WorldEngine:
    """世界引擎：管理 tick 推进、事件生成和分发。"""

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
        self.relationships: dict[tuple[str, str], float] = {}
        self.current_tick: int = 0

        # AutoGen agent name → LifeAgent UUID 反向映射
        # （AutoGen 消息的 source 字段是 agent name，不是 UUID）
        self._name_to_id: dict[str, str] = {}
        for agent in agents:
            ag_name = agent.autogen_agent.name
            self._name_to_id[ag_name] = agent.id

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
            1. 注入世界状态（context + memories）
            2. 运行 Agent 交互（solo / group chat）
            3. 解析 tool calls → 更新世界状态
            4. 关系分析 → 更新关系分数
            5. 持久化全部事件到 SQLite
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

        # ---- 3. 应用 tool call 效果 ----
        for event in list(tick_events):
            if event.type == "agent_action":
                tick_events.extend(self._apply_action(event))

        # ---- 4. 关系分析 ----
        tick_events.extend(self._update_relationships(tick_events))

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
        """运行整个模拟。"""
        all_events: list[SimEvent] = []
        for i in range(max_ticks):
            if self.world.status == "paused":
                logger.info(f"WorldEngine.run: paused at tick {self.current_tick}")
                break
            events = await self.tick()
            all_events.extend(events)
        return all_events

    async def tick_stream(self) -> AsyncGenerator[SimEvent, None]:
        """流式推进一个 tick——实时 yield Agent 发言，末尾补全管线步骤。

        SSE 端点调用此方法，实时推送"思考气泡"给前端。
        事件流末尾自动附带 tick_boundary。
        """
        tick_events: list[SimEvent] = []

        # ---- 1. 注入世界状态 ----
        context = self._build_world_context()
        for agent in self.agents.values():
            memories = await self._retriever.retrieve(agent.id, context)
            agent.inject_context(context, memories)

        # ---- 2. 流式运行 Agent 交互 ----
        if len(self.agents) == 0:
            pass
        elif len(self.agents) == 1:
            async for event in self._stream_solo_tick(
                list(self.agents.values())[0]
            ):
                tick_events.append(event)
                yield event
        else:
            async for event in self._stream_group_tick():
                tick_events.append(event)
                yield event

        # ---- 3. 应用 tool call 效果 ----
        for event in list(tick_events):
            if event.type == "agent_action":
                tick_events.extend(self._apply_action(event))

        # ---- 4. 关系分析 ----
        tick_events.extend(self._update_relationships(tick_events))

        # ---- 5. 持久化 ----
        await self._persist_events(tick_events)

        # 推进时钟 + 事件归档
        self.current_tick += 1
        self.events.extend(tick_events)

        yield SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick - 1,
            type="tick_boundary",
            description=f"Tick {self.current_tick - 1} 完成",
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    async def _stream_solo_tick(self, agent: LifeAgent) -> AsyncGenerator[SimEvent, None]:
        """单人模式流式——暂时走同步 on_messages，后续可升级为 on_messages_stream。"""
        from autogen_agentchat.messages import TextMessage
        from autogen_core import CancellationToken

        prompt = (
            f"场景：{self.world.scenario.name}\n"
            f"请描述你现在的想法和打算做的事情。"
        )
        try:
            response = await agent.autogen_agent.on_messages(
                [TextMessage(content=prompt, source="world")],
                cancellation_token=CancellationToken(),
            )
            for evt in self._extract_events_from_response(response, agent.id):
                self.events.append(evt)
                yield evt
        except Exception as e:
            logger.error(f"stream solo error: {e}")
            err = self._make_error_event(agent.id, str(e))
            self.events.append(err)
            yield err

    async def _stream_group_tick(self) -> AsyncGenerator[SimEvent, None]:
        """多人模式——AutoGen run_stream 逐条推送 Agent 发言。"""
        initial_events = self.world.scenario.initial_events
        task = (
            f"场景：{self.world.scenario.name} — {self.world.scenario.description}\n"
            f"初始事件：{'；'.join(initial_events)}\n"
            f"请根据你的角色设定自然地互动。"
        )
        from autogen_core import CancellationToken

        try:
            team = self.build_group_chat()
            async for msg in team.run_stream(
                task=task, cancellation_token=CancellationToken()
            ):
                evt = self._stream_message_to_event(msg)
                if evt:
                    self.events.append(evt)
                    yield evt
        except Exception as e:
            logger.error(f"stream group error: {e}")
            err = self._make_error_event("world", str(e))
            self.events.append(err)
            yield err

    def _stream_message_to_event(self, msg) -> SimEvent | None:
        """流式消息转 SimEvent——TextMessage + ToolCallRequestEvent。"""
        from autogen_agentchat.messages import TextMessage, ToolCallRequestEvent

        # tool call → agent_action（stream 路径也需处理，否则 tool 效果丢失）
        if isinstance(msg, ToolCallRequestEvent):
            return self._tool_call_to_event(msg)

        # 普通发言
        if not isinstance(msg, TextMessage):
            return None

        content = getattr(msg, "content", "")
        if not content:
            return None

        raw_source = getattr(msg, "source", "world")
        source_id = self._name_to_id.get(raw_source, raw_source)
        if source_id in ("world", "user"):
            return None

        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type="agent_message",
            source_agent_id=source_id,
            description=str(content)[:500],
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    # -------------------------------------------------------------------------
    # GroupChat 构建（公开——供测试和 SSE 使用）
    # -------------------------------------------------------------------------

    def build_group_chat(self):
        """创建 AutoGen RoundRobinGroupChat。"""
        from autogen_agentchat.teams import RoundRobinGroupChat

        participants: list = [a.autogen_agent for a in self.agents.values()]
        return RoundRobinGroupChat(
            participants=participants,  # type: ignore[arg-type]
            max_turns=len(self.agents) * 3,
        )

    # -------------------------------------------------------------------------
    # 世界上下文
    # -------------------------------------------------------------------------

    def _build_world_context(self) -> str:
        """构建当前 tick 的世界上下文文本。"""
        params = self.world.scenario.environment_params
        location = params.get("location", "未知")
        agent_names = ", ".join(
            a.persona.name or a.id for a in self.agents.values()
        )

        context = (
            f"⏰ 第 {self.current_tick} 个时间段\n"
            f"📍 地点: {location}\n"
            f"👥 在场人物: {agent_names}\n"
        )

        # 天气——只在场景定义时显示，不制造虚假默认值
        weather = params.get("weather")
        if weather:
            context += f"🌤️ 天气: {weather}\n"

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
        """单人模式——Agent 自言自语 / 思考。"""
        from autogen_agentchat.messages import TextMessage
        from autogen_core import CancellationToken

        prompt = (
            f"场景：{self.world.scenario.name} — {self.world.scenario.description}\n"
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
            events = self._extract_events_from_response(response, agent.id)
        except Exception as e:
            logger.error(f"WorldEngine._run_solo_tick: agent={agent.id} error: {e}")
            events.append(self._make_error_event(agent.id, str(e)))

        return events

    async def _run_group_tick(self) -> list[SimEvent]:
        """多人模式——AutoGen RoundRobinGroupChat 驱动多 Agent 对话。"""
        initial_events = self.world.scenario.initial_events
        task = (
            f"场景：{self.world.scenario.name} — {self.world.scenario.description}\n"
            f"初始事件：{'；'.join(initial_events)}\n"
            f"现在是第 {self.current_tick} 个时间段。"
            f"请根据你的角色设定自然地互动。你可以说话、思考、行动。"
        )

        events: list[SimEvent] = []
        try:
            team = self.build_group_chat()
            result = await team.run(task=task)
            for msg in result.messages:
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
        """将 AutoGen 消息转为 SimEvent。

        支持 3 种消息类型:
        - TextMessage → agent_message
        - ToolCallRequestEvent → agent_action（tool call 请求）
        - 其他 → 跳过
        """
        from autogen_agentchat.messages import ToolCallRequestEvent

        # tool call 事件 → agent_action
        if isinstance(msg, ToolCallRequestEvent):
            return self._tool_call_to_event(msg)

        # 普通文本消息 → agent_message
        content = getattr(msg, "content", "")
        if not content:
            return None

        raw_source = getattr(msg, "source", "world")
        source_id = self._name_to_id.get(raw_source, raw_source)

        # 跳过 world/user 系统消息
        if source_id in ("world", "user"):
            return None

        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type="agent_message",
            source_agent_id=source_id,
            description=str(content)[:500],
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    def _tool_call_to_event(self, msg) -> SimEvent | None:
        """将 AutoGen ToolCallRequestEvent 转为 SimEvent(agent_action)。"""
        content = getattr(msg, "content", [])
        if not content:
            return None

        fc = content[0]  # 取第一个 function call
        tool_name = getattr(fc, "name", "")
        tool_args = {}
        try:
            tool_args = json.loads(getattr(fc, "arguments", "{}"))
        except (json.JSONDecodeError, TypeError):
            pass

        raw_source = getattr(msg, "source", "")
        source_id = self._name_to_id.get(raw_source, raw_source)

        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type="agent_action",
            source_agent_id=source_id,
            description=f"调用工具: {tool_name}({tool_args})",
            data={
                "action": tool_name,
                **tool_args,
            },
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    def _extract_events_from_response(
        self, response, agent_id: str
    ) -> list[SimEvent]:
        """从 Agent 的响应中提取事件（solo 模式）。

        遍历 Response.inner_messages，处理 TextMessage 和 ToolCallRequestEvent。
        """
        from autogen_agentchat.messages import ToolCallRequestEvent

        messages = getattr(response, "inner_messages", [])
        if not messages and hasattr(response, "chat_message"):
            messages = [response.chat_message]
        events: list[SimEvent] = []
        for msg in messages:
            # tool call → agent_action
            if isinstance(msg, ToolCallRequestEvent):
                evt = self._tool_call_to_event(msg)
                if evt:
                    events.append(evt)
                continue

            # 普通消息 → thought_stream
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
    # Tool call 应用
    # -------------------------------------------------------------------------

    def _apply_action(self, event: SimEvent) -> list[SimEvent]:
        """将 agent_action 事件施加到世界状态，返回新生成的事件。"""
        action = event.data.get("action", "")
        # tool 参数名可能为 target 或 target_name（send_message 用后者）
        target = event.data.get("target") or event.data.get("target_name", "")
        agent = self.agents.get(event.source_agent_id or "")
        new_events: list[SimEvent] = []

        if action == "send_message" and target:
            resolved = _resolve_agent_id(target, self.agents, self._name_to_id)
            new_events.append(
                SimEvent(
                    id=str(uuid.uuid4()),
                    world_id=self.world.id,
                    tick=self.current_tick,
                    type="agent_message",
                    source_agent_id=event.source_agent_id,
                    target_agent_ids=[resolved],
                    description=event.data.get("content", event.description),
                    data={"tone": event.data.get("tone", "neutral")},
                    created_at=datetime.now(timezone.utc).isoformat(),
                )
            )

        elif action == "set_goal" and agent:
            from models.agent import Goal

            agent.goals.append(
                Goal(
                    id=f"g{len(agent.goals) + 1}",
                    description=event.data.get("description", event.description),
                    priority=event.data.get("priority", 1),
                    status="active",
                )
            )
            logger.info(f"WorldEngine._apply_action: agent={agent.id} set goal")

        elif action == "observe":
            new_events.append(
                SimEvent(
                    id=str(uuid.uuid4()),
                    world_id=self.world.id,
                    tick=self.current_tick,
                    type="thought_stream",
                    source_agent_id=event.source_agent_id,
                    description=f"🔍 观察: {event.data.get('target', event.description)}",
                    created_at=datetime.now(timezone.utc).isoformat(),
                )
            )

        elif action == "think_aloud":
            new_events.append(
                SimEvent(
                    id=str(uuid.uuid4()),
                    world_id=self.world.id,
                    tick=self.current_tick,
                    type="thought_stream",
                    source_agent_id=event.source_agent_id,
                    description=event.data.get("thought", event.description),
                    created_at=datetime.now(timezone.utc).isoformat(),
                )
            )

        else:
            logger.debug(f"WorldEngine._apply_action: unhandled action={action}")

        return new_events

    # -------------------------------------------------------------------------
    # 关系演化
    # -------------------------------------------------------------------------

    def _update_relationships(self, events: list[SimEvent]) -> list[SimEvent]:
        """分析本 tick 事件中的交互信号，更新关系分数。返回 relationship_change 事件。"""
        changes = extract_relationship_changes(
            events, all_agent_ids=set(self.agents.keys())
        )
        if not changes:
            return []

        rel_events = apply_relationship_changes(self.relationships, changes)
        for evt in rel_events:
            evt.world_id = self.world.id
            evt.tick = self.current_tick
            evt.created_at = datetime.now(timezone.utc).isoformat()

        logger.info(
            f"WorldEngine._update_relationships: tick={self.current_tick}, "
            f"{len(changes)} changes, {len(rel_events)} rel_events"
        )
        return rel_events

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
