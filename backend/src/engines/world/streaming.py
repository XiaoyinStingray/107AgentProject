"""Streaming interaction methods mixed into WorldEngine."""

from collections.abc import AsyncGenerator

from loguru import logger

from models.event import SimEvent


class WorldStreamingMixin:
    """Provide streaming solo and GroupChat event conversion."""

    async def _stream_solo_tick(self, agent) -> AsyncGenerator[SimEvent, None]:
        """Stream one solo response as thought, action, and message events."""
        from autogen_agentchat.messages import TextMessage
        from autogen_core import CancellationToken

        prompt = (
            f"你现在正在经历：{self.world.scenario.name}。\n"
            "作为一个真实的人，你此刻心里在想什么、想做什么？\n"
            "直接说出你的内心想法——不要分析自己、不要提到\"作为XX人格\"、"
            "不要提\"我需要以XX的身份\"。你就是你。"
        )
        try:
            response = await agent.autogen_agent.on_messages(
                [TextMessage(content=prompt, source="world")],
                cancellation_token=CancellationToken(),
            )
            for event in self._extract_events_from_response(response, agent.id):
                yield event
        except Exception as error:
            logger.error(f"stream solo error: {error}")
            yield self._make_error_event(agent.id, str(error))

    async def _stream_group_tick(self) -> AsyncGenerator[SimEvent, None]:
        """Stream one target-aware multi-Agent SelectorGroupChat tick."""
        from autogen_core import CancellationToken

        try:
            team = self.build_group_chat()
            async for message in team.run_stream(
                task=self._build_group_task(),
                cancellation_token=CancellationToken(),
            ):
                event = self._stream_message_to_event(message)
                if event:
                    yield event
        except Exception as error:
            logger.error(f"stream group error: {error}")
            yield self._make_error_event("world", str(error))

    def _stream_message_to_event(self, message) -> SimEvent | None:
        """Convert a supported AutoGen stream message into a SimEvent."""
        from autogen_agentchat.messages import TextMessage, ToolCallRequestEvent

        if isinstance(message, ToolCallRequestEvent):
            return self._tool_call_to_event(message)
        if not isinstance(message, TextMessage):
            return None

        content = self._clean_group_content(str(getattr(message, "content", "")))
        source = getattr(message, "source", "world")
        source_id = self._name_to_id.get(source, source)
        if not content or source_id in ("world", "user"):
            return None
        if self._has_identity_conflict(source_id, content):
            logger.warning(f"Dropped identity-conflicting stream message from {source_id}")
            return None
        return self._make_message_event(source_id, content)
