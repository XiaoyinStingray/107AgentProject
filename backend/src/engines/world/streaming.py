"""Streaming interaction methods mixed into WorldEngine."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator
from typing import Any

from loguru import logger

from config import settings
from models.event import SimEvent


class WorldStreamingMixin:
    """Provide streaming solo and GroupChat event conversion.

    This is a Mixin — the following attributes/methods are provided by
    the host class (WorldEngine) via sibling mixins:
        world, _name_to_id, _extract_events_from_response,
        _make_error_event, build_group_chat, _build_group_task,
        _tool_call_to_event, _clean_group_content,
        _has_identity_conflict, _make_message_event
    """

    # Mixin host-class attribute stubs (satisfied by WorldEngine at runtime)
    world: Any
    _name_to_id: dict[str, str]
    _extract_events_from_response: Any
    _make_error_event: Any
    build_group_chat: Any
    _build_group_task: Any
    _tool_call_to_event: Any
    _clean_group_content: Any
    _has_identity_conflict: Any
    _make_message_event: Any

    async def _stream_solo_tick(self, agent) -> AsyncGenerator[SimEvent, None]:
        """Stream one solo response as thought, action, and message events.

        使用 polling 模式等待 LLM 响应——每 0.5s 检查一次 world.status，
        用户暂停时即时取消当前 LLM 调用，不再等整个响应完成。
        """
        from autogen_agentchat.messages import TextMessage
        from autogen_core import CancellationToken

        prompt = (
            f"你现在正在经历：{self.world.scenario.name}。\n"
            "作为一个真实的人，你此刻心里在想什么、想做什么？\n"
            "直接说出你的内心想法——不要分析自己、不要提到\"作为XX人格\"、"
            "不要提\"我需要以XX的身份\"。你就是你。"
        )
        try:
            task = asyncio.ensure_future(
                agent.autogen_agent.on_messages(
                    [TextMessage(content=prompt, source="world")],
                    cancellation_token=CancellationToken(),
                )
            )
            # Poll every 0.5s — allow instant pause even during LLM generation
            while not task.done():
                if (
                    self.world.status == "paused"
                    or getattr(self, "_instruction_preempt_requested", False)
                ):
                    task.cancel()
                    try:
                        await task
                    except (asyncio.CancelledError, Exception):
                        pass
                    reason = (
                        "paused"
                        if self.world.status == "paused"
                        else "priority instruction"
                    )
                    logger.info(
                        f"Solo tick cancelled ({reason}) for agent {agent.id}"
                    )
                    return
                await asyncio.wait([task], timeout=0.5)
            response = task.result()
            for event in self._extract_events_from_response(response, agent.id):
                yield event
                if self.world.status == "paused":
                    break
        except asyncio.TimeoutError:
            logger.warning(f"Solo tick timed out for agent {agent.id}")
            yield self._make_error_event(agent.id, "LLM 调用超时，Agent 跳过本轮")
        except asyncio.CancelledError:
            logger.info(f"Solo tick cancelled for agent {agent.id}")
        except Exception as error:
            logger.error(f"stream solo error: {error}")
            yield self._make_error_event(agent.id, str(error))

    async def _stream_group_tick(self) -> AsyncGenerator[SimEvent, None]:
        """Stream one target-aware multi-Agent SelectorGroupChat tick.

        Stores a CancellationToken on the engine so that the SSE pause
        endpoint can cancel mid-generation LLM calls (keyed to world.status).
        Outer tick_stream still post-processes, persists and emits
        a tick_boundary for the partial tick.
        """
        from autogen_core import CancellationToken

        stream = None
        self._group_cancel_token = CancellationToken()
        try:
            team = self.build_group_chat()
            stream = team.run_stream(
                task=self._build_group_task(),
                cancellation_token=self._group_cancel_token,
            )
            async for message in stream:
                if getattr(self, "_instruction_preempt_requested", False):
                    self._group_cancel_token.cancel()
                    break
                if self.world.status == "paused":
                    self._group_cancel_token.cancel()
                    break
                event = self._stream_message_to_event(message)
                if event:
                    yield event
        except asyncio.CancelledError:
            logger.info("Group tick cancelled (paused)")
        except Exception as error:
            logger.error(f"stream group error: {error}")
            yield self._make_error_event("world", str(error))
        finally:
            self._group_cancel_token = None
            if stream is not None:
                try:
                    await stream.aclose()
                except Exception:
                    pass  # best-effort cleanup of AutoGen internal tasks

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
