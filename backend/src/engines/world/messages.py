"""AutoGen message conversion methods mixed into WorldEngine."""

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from loguru import logger

from models.event import SimEvent

END_TICK_TOKEN = "[END_TICK]"


def _build_action_description(tool_name: str, arguments: dict) -> str:
    """Build a human-readable description for a tool-call action event."""
    if tool_name == "think_aloud":
        thought = arguments.get("thought", "")
        return thought if thought else ""
    if tool_name == "set_goal":
        desc = arguments.get("description", "")
        return f"设定目标: {desc}" if desc else ""
    if tool_name == "observe":
        target = arguments.get("target", "")
        return f"观察: {target}" if target else ""
    if tool_name == "send_message":
        target = arguments.get("target", arguments.get("target_name", ""))
        msg = arguments.get("content", "")
        if target and msg:
            return f"对{target}说: {msg}"
        if msg:
            return msg
        return ""
    if tool_name in ("complete_step", "submit_deliverable"):
        step_title = arguments.get("step_title", "")
        result = arguments.get("result") or arguments.get("deliverable", "")
        return f"📤 提交交付物：{step_title}" + (f" — {result[:80]}..." if result else "")
    if tool_name == "finish_task":
        summary = arguments.get("summary", "")
        return "🏁 任务完成" + (f" — {summary[:80]}" if summary else "")
    return f"执行了 {tool_name}" if tool_name else ""


SELECTOR_PROMPT = """你负责为多人角色扮演选择下一位最自然的发言者。
候选角色及说明：
{roles}

对话历史：
{history}

请从 {participants} 中只返回一个内部角色标识，不要解释。
对话历史中的 source 是发言者身份的唯一依据，不得根据正文猜测或改写上一位发言者。
优先选择被最新消息点名、提问或邀请回应的角色；否则根据情境选择最自然的角色。
"""


class WorldMessageMixin:
    """Provide GroupChat construction and AutoGen message conversion.

    This is a Mixin — the following attributes are provided by
    the host class (WorldEngine) at runtime.
    """

    # Mixin host-class attribute stubs (satisfied by WorldEngine at runtime)
    world: Any
    agents: dict[str, Any]
    current_tick: int
    _name_to_id: dict[str, str]
    _act_model_client: Any

    def build_group_chat(self):
        """Create a target-aware AutoGen SelectorGroupChat for World Agents。"""
        from autogen_agentchat.conditions import TextMentionTermination
        from autogen_agentchat.teams import SelectorGroupChat

        participants: list = [agent.autogen_agent for agent in self.agents.values()]
        first_agent = next(iter(self.agents.values()))
        return SelectorGroupChat(
            participants=participants,  # type: ignore[arg-type]
            model_client=self._act_model_client or first_agent.model_client,
            selector_prompt=SELECTOR_PROMPT,
            selector_func=self._select_addressed_speaker,
            allow_repeated_speaker=False,
            termination_condition=TextMentionTermination(END_TICK_TOKEN),
            max_turns=len(self.agents) * 3,
        )

    def _select_addressed_speaker(self, messages) -> str | None:
        """Route an explicit single-name address without another LLM call."""
        if not messages:
            return next(iter(self.agents.values())).autogen_agent.name
        latest = messages[-1]
        source = getattr(latest, "source", "")
        if source in ("user", "world"):
            return next(iter(self.agents.values())).autogen_agent.name
        content = str(getattr(latest, "content", ""))
        matches = [
            agent.autogen_agent.name
            for agent in self.agents.values()
            if agent.autogen_agent.name != source
            and (agent.persona.name or agent.id) in content
        ]
        return matches[0] if len(matches) == 1 else None

    def _has_identity_conflict(self, source_id: str, content: str) -> bool:
        """Reject obvious self/other identity contradictions before persistence。
        Team 任务模式下放宽检查——Agent 在讨论中提及同事名字是正常的。"""
        if hasattr(self, "team_task") and self.team_task:
            return False  # Team 模式不检查身份冲突
        source_agent = self.agents.get(source_id)
        if source_agent is None:
            return False
        own_name = source_agent.persona.name
        if own_name and own_name in content:
            self_introductions = (
                f"我叫{own_name}",
                f"我是{own_name}",
                f"我的名字是{own_name}",
            )
            if not any(marker in content for marker in self_introductions):
                return True
        for agent_id, agent in self.agents.items():
            other_name = agent.persona.name
            if agent_id == source_id or not other_name:
                continue
            if any(
                marker in content
                for marker in (
                    f"我叫{other_name}",
                    f"我是{other_name}",
                    f"我的名字是{other_name}",
                )
            ):
                return True
        return False

    @staticmethod
    def _clean_group_content(content: str) -> str:
        """Remove internal team-control markers and tool-call leaks from user-visible dialogue."""
        import re

        content = content.replace(END_TICK_TOKEN, "").strip()
        # Strip residual tool-call patterns that the LLM may embed in text
        content = re.sub(
            r"调用工具:\s*\w+\(.*?\)", "", content, flags=re.DOTALL
        ).strip()
        return content

    def _build_group_task(self) -> str:
        """Build one shared task with explicit multiplayer identity rules。
        Team 模式下注入跨 tick 对话历史，保持上下文连贯。"""
        # Team 模式：注入历史对话
        if hasattr(self, "team_task") and self.team_task:
            base = "继续团队协作。参考以下最近的对话历史，接着上次的进度继续讨论。\n"
            history = getattr(self, "_team_chat_history", None)
            if history:
                recent = "\n".join(
                    "[{}]: {}".format(
                        getattr(m, "source", "?"),
                        str(getattr(m, "content", ""))[:200],
                    )
                    for m in history[-10:]
                )
                base += "\n--- 最近对话 ---\n{}\n---\n".format(recent)
            base += "\n继续推进当前阶段的任务。完成你的部分后请调用 submit_deliverable 提交。"
            return base

        initial_events = self.world.scenario.initial_events
        return (
            f"场景：{self.world.scenario.name} — {self.world.scenario.description}\n"
            f"初始事件：{'；'.join(initial_events)}\n"
            f"现在是第 {self.current_tick} 个时间段。\n"
            "请根据你的角色设定自然地互动。你可以说话、思考、行动。\n"
            "每次发言只能使用系统消息指定的唯一身份，正文中的'我'只能指你自己。\n"
            "不得代替其他参与者回答、行动或描述其内心。"
        )

    async def _run_solo_tick(self, agent) -> list[SimEvent]:
        """Run one non-streaming solo Agent tick."""
        from autogen_agentchat.messages import TextMessage
        from autogen_core import CancellationToken

        prompt = (
            f"场景：{self.world.scenario.name} — {self.world.scenario.description}\n"
            f"现在是第 {self.current_tick} 个时间段。"
            "请描述你现在的想法、感受和打算做的事情。"
            "使用 think_aloud 记录你的想法，使用 set_goal 设定目标，"
            "使用 observe 观察周围环境。"
        )
        try:
            response = await agent.autogen_agent.on_messages(
                [TextMessage(content=prompt, source="world")],
                cancellation_token=CancellationToken(),
            )
            return self._extract_events_from_response(response, agent.id)
        except Exception as error:
            logger.error(f"WorldEngine._run_solo_tick: agent={agent.id} error: {error}")
            return [self._make_error_event(agent.id, str(error))]

    async def _run_group_tick(self) -> list[SimEvent]:
        """Run one non-streaming multi-Agent GroupChat tick."""
        try:
            result = await self.build_group_chat().run(task=self._build_group_task())
            return [
                event
                for message in result.messages
                if (event := self._convert_message_to_event(message))
            ]
        except Exception as error:
            logger.error(f"WorldEngine._run_group_tick error: {error}")
            return [self._make_error_event("world", str(error))]

    def _convert_message_to_event(self, message) -> SimEvent | None:
        """Convert an AutoGen message or tool request into a SimEvent."""
        from autogen_agentchat.messages import ToolCallRequestEvent

        if isinstance(message, ToolCallRequestEvent):
            return self._tool_call_to_event(message)
        content = self._clean_group_content(str(getattr(message, "content", "")))
        source = getattr(message, "source", "world")
        source_id = self._name_to_id.get(source, source)
        if not content or source_id in ("world", "user"):
            return None
        if self._has_identity_conflict(source_id, content):
            logger.warning(f"Dropped identity-conflicting message from {source_id}")
            return None
        return self._make_message_event(source_id, content)

    def _make_message_event(self, source_id: str, content: str) -> SimEvent:
        """Build an agent_message event with the current World metadata."""
        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type="agent_message",
            source_agent_id=source_id,
            description=content,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    def _tool_call_to_event(self, message) -> SimEvent | None:
        """Convert the first AutoGen tool call into an agent_action event."""
        content = getattr(message, "content", [])
        if not content:
            return None
        function_call = content[0]
        try:
            arguments = json.loads(getattr(function_call, "arguments", "{}"))
        except (json.JSONDecodeError, TypeError):
            arguments = {}
        source = getattr(message, "source", "")
        source_id = self._name_to_id.get(source, source)
        tool_name = getattr(function_call, "name", "")
        description = _build_action_description(tool_name, arguments)
        if not description:
            return None
        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type="agent_action",
            source_agent_id=source_id,
            description=description,
            data={"action": tool_name, **arguments},
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    def _extract_events_from_response(self, response, agent_id: str) -> list[SimEvent]:
        """Extract inner thought/action events and the final chat message."""
        events = [
            event
            for message in (getattr(response, "inner_messages", []) or [])
            if (event := self._inner_message_to_event(message, agent_id))
        ]
        final_event = self._final_message_to_event(response, agent_id)
        if final_event:
            events.append(final_event)
        return events

    def _inner_message_to_event(self, message, agent_id: str) -> SimEvent | None:
        """Convert one inner AutoGen message into thought or action."""
        from autogen_agentchat.messages import TextMessage, ToolCallRequestEvent

        if isinstance(message, ToolCallRequestEvent):
            return self._tool_call_to_event(message)
        content = getattr(message, "content", "")
        if not content or not isinstance(message, TextMessage):
            return None
        return self._make_agent_event("thought_stream", agent_id, str(content))

    def _final_message_to_event(self, response, agent_id: str) -> SimEvent | None:
        """Convert the final AutoGen response into spoken Agent text."""
        message = getattr(response, "chat_message", None)
        content = getattr(message, "content", "") if message else ""
        if not content:
            return None
        return self._make_agent_event("agent_message", agent_id, str(content))

    def _make_agent_event(self, event_type: str, agent_id: str, text: str) -> SimEvent:
        """Build a typed Agent event with current World metadata."""
        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type=event_type,
            source_agent_id=agent_id,
            description=text,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    def _make_error_event(self, agent_id: str, error: str) -> SimEvent:
        """Build a non-fatal world_event for an Agent execution failure."""
        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type="world_event",
            source_agent_id=None,
            description=f"⚠️ 错误 (agent={agent_id}): {error[:300]}",
            created_at=datetime.now(timezone.utc).isoformat(),
        )
