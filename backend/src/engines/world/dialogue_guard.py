"""Generic dialogue progress and natural-completion protection for Worlds."""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict, deque
from dataclasses import dataclass
from difflib import SequenceMatcher

from models.event import SimEvent


_CLOSURE_PATTERNS = (
    "再见",
    "回见",
    "明天见",
    "明早见",
    "下次见",
    "改天聊",
    "晚安",
    "拜拜",
    "先走了",
    "先撤了",
    "散了吧",
    "告辞",
    "不聊了",
    "先到这里",
    "今天先这样",
    "各自离开",
    "各自散开",
    "简单道别",
    "道别收尾",
    "回去休息",
    "早点休息",
    "goodbye",
    "see you",
)
_OPEN_PROMPT_PATTERN = re.compile(
    r"[?？]|(?:你呢|怎么看|如何|要不要|可以吗|行吗|好吗|对吗|是不是)\s*[。.!！]*$"
)
_STAGE_DIRECTION_PATTERN = re.compile(r"（[^）]{0,120}）|\([^)]{0,120}\)")
_SPEAKER_PREFIX_PATTERN = re.compile(r"^[^:：]{1,24}对[^:：]{1,24}说[:：]\s*")
_NON_WORD_PATTERN = re.compile(r"[^\w\u3400-\u9fff]+", re.UNICODE)


@dataclass(frozen=True)
class DialogueAssessment:
    """Result of inspecting one completed World tick."""

    should_finish: bool = False
    reason: str | None = None
    hint: str = ""
    repeated_agent_ids: tuple[str, ...] = ()
    all_messages_repeated: bool = False
    all_messages_closing: bool = False


def normalize_dialogue(text: str) -> str:
    """Normalize visible dialogue for language-agnostic near-duplicate checks."""
    normalized = unicodedata.normalize("NFKC", text or "").lower().strip()
    normalized = _SPEAKER_PREFIX_PATTERN.sub("", normalized)
    normalized = _STAGE_DIRECTION_PATTERN.sub("", normalized)
    return _NON_WORD_PATTERN.sub("", normalized)


def is_near_duplicate(current: str, previous: str) -> bool:
    """Return True for exact or strongly similar repeated utterances."""
    if not current or not previous:
        return False
    if current == previous:
        return True
    shorter, longer = sorted((current, previous), key=len)
    if len(shorter) < 4:
        return False
    if shorter in longer and len(shorter) / len(longer) >= 0.78:
        return True
    return SequenceMatcher(None, current, previous).ratio() >= 0.82


def is_closing_utterance(text: str) -> bool:
    """Detect a short, non-questioning farewell or explicit scene wind-down."""
    raw = unicodedata.normalize("NFKC", text or "").lower().strip()
    if not raw or _OPEN_PROMPT_PATTERN.search(raw):
        return False
    normalized = normalize_dialogue(raw)
    return any(normalize_dialogue(pattern) in normalized for pattern in _CLOSURE_PATTERNS)


class DialogueProgressGuard:
    """Track cross-tick repetition without hard-coding one recorded sentence."""

    def __init__(self, history_per_agent: int = 4) -> None:
        self._recent_by_agent: dict[str, deque[str]] = defaultdict(
            lambda: deque(maxlen=history_per_agent)
        )
        self._consecutive_repeated_message_ticks = 0
        self._consecutive_closing_message_ticks = 0

    @staticmethod
    def _message_text(event: SimEvent) -> str:
        data_message = event.data.get("message") if event.data else None
        return str(data_message or event.description or "")

    def annotate_message(self, event: SimEvent) -> SimEvent:
        """Attach repeat/closure metadata before the event is streamed/persisted."""
        if event.type != "agent_message" or not event.source_agent_id:
            return event
        text = self._message_text(event)
        normalized = normalize_dialogue(text)
        history = self._recent_by_agent[event.source_agent_id]
        repeated = any(is_near_duplicate(normalized, previous) for previous in history)
        closing = is_closing_utterance(text)
        event.data = {
            **event.data,
            "dialogue_repeated": repeated,
            "dialogue_closing": closing,
        }
        if normalized:
            history.append(normalized)
        return event

    def assess_tick(self, events: list[SimEvent]) -> DialogueAssessment:
        """Decide whether one tick progressed, needs replanning, or should end."""
        messages = [event for event in events if event.type == "agent_message"]
        if not messages:
            return DialogueAssessment()

        all_repeated = all(
            bool(event.data.get("dialogue_repeated")) for event in messages
        )
        all_closing = all(
            bool(event.data.get("dialogue_closing")) for event in messages
        )
        repeated_agent_ids = tuple(dict.fromkeys(
            event.source_agent_id
            for event in messages
            if event.source_agent_id and event.data.get("dialogue_repeated")
        ))
        closing_agent_ids = {
            event.source_agent_id
            for event in messages
            if event.source_agent_id and event.data.get("dialogue_closing")
        }

        if all_repeated:
            self._consecutive_repeated_message_ticks += 1
        else:
            self._consecutive_repeated_message_ticks = 0

        if all_closing:
            self._consecutive_closing_message_ticks += 1
        else:
            self._consecutive_closing_message_ticks = 0

        if (
            self._consecutive_closing_message_ticks >= 2
            or (all_closing and len(closing_agent_ids) >= 2)
        ):
            return DialogueAssessment(
                should_finish=True,
                reason="natural_completion",
                repeated_agent_ids=repeated_agent_ids,
                all_messages_repeated=all_repeated,
                all_messages_closing=True,
            )
        if self._consecutive_repeated_message_ticks >= 2:
            return DialogueAssessment(
                should_finish=True,
                reason="conversation_repeating",
                repeated_agent_ids=repeated_agent_ids,
                all_messages_repeated=True,
                all_messages_closing=all_closing,
            )

        hint = ""
        if all_closing:
            hint = (
                "\n🧭 上一轮互动已出现自然收束信号。"
                "如果仍有未完成的场景目标，请推进一个具体行动；"
                "否则不要再次重复告别。\n"
            )
        elif repeated_agent_ids:
            hint = (
                "\n🧭 上一轮出现了近似重复表达。"
                "请换一位合适的参与者回应，并推进新的行动、信息或决定；"
                "不要复述刚才的句子。\n"
            )

        return DialogueAssessment(
            hint=hint,
            repeated_agent_ids=repeated_agent_ids,
            all_messages_repeated=all_repeated,
            all_messages_closing=all_closing,
        )
