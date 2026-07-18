"""
叙事引擎 — 事件日志 → 自然语言叙事（小说/日记/信/播客）。

核心接口:
    engine = NarrativeEngine(model_client)
    result = await engine.generate(NarrativeRequest(...))
    # → NarrativeResponse(title=..., content=..., style=...)
"""

from datetime import datetime, timezone
from enum import StrEnum

from loguru import logger

from models.agent import Persona
from models.event import SimEvent
from engines.narrative.templates import (
    DIARY_PROMPT,
    LETTER_PROMPT,
    PODCAST_PROMPT,
    STORY_PROMPT,
)


# =============================================================================
# 类型定义
# =============================================================================


class NarrativeStyle(StrEnum):
    STORY = "story"
    DIARY = "diary"
    LETTER = "letter"
    PODCAST = "podcast"


class NarrativeRequest:
    """叙事请求——输入参数。"""

    def __init__(
        self,
        style: NarrativeStyle,
        agent_id: str,
        events: list[SimEvent],
        persona: Persona,
        target: str | None = None,
    ):
        self.style = style
        self.agent_id = agent_id
        self.events = events
        self.persona = persona
        self.target = target


class NarrativeResponse:
    """叙事结果。"""

    def __init__(
        self,
        title: str,
        content: str,
        style: NarrativeStyle,
        agent_id: str,
        generated_at: str | None = None,
    ):
        self.title = title
        self.content = content
        self.style = style
        self.agent_id = agent_id
        self.generated_at = generated_at or datetime.now(timezone.utc).isoformat()


# =============================================================================
# NarrativeEngine
# =============================================================================


_TEMPLATES: dict[NarrativeStyle, str] = {
    NarrativeStyle.STORY: STORY_PROMPT,
    NarrativeStyle.DIARY: DIARY_PROMPT,
    NarrativeStyle.LETTER: LETTER_PROMPT,
    NarrativeStyle.PODCAST: PODCAST_PROMPT,
}


class NarrativeEngine:
    """叙事引擎——事件序列 → LLM → 自然语言叙事。"""

    def __init__(self, model_client):
        self._client = model_client

    async def generate(self, req: NarrativeRequest) -> NarrativeResponse:
        """根据请求生成叙事文本。

        Args:
            req: 包含风格、Agent、事件、Persona 的叙事请求

        Returns:
            NarrativeResponse: 含标题、正文、风格的叙事结果
        """
        prompt = self._build_prompt(req)
        logger.info(
            f"NarrativeEngine.generate: style={req.style}, "
            f"agent={req.agent_id}, events={len(req.events)}"
        )

        from autogen_core.models import SystemMessage, UserMessage

        response = await self._client.create(
            messages=[
                SystemMessage(content="你是一个专业的叙事作家。"),
                UserMessage(content=prompt, source="narrative_engine"),
            ],
        )
        raw = response.content

        title, content = _parse_narrative(raw)
        return NarrativeResponse(
            title=title,
            content=content.strip(),
            style=req.style,
            agent_id=req.agent_id,
        )

    def _build_prompt(self, req: NarrativeRequest) -> str:
        """根据风格选择模板并填充参数。"""
        template = _TEMPLATES[req.style]
        events_text = _format_events(req.events)
        return template.format(
            persona_narrative=req.persona.narrative or req.persona.name or "未知角色",
            events=events_text,
            target=req.target or "",
        )


# =============================================================================
# 辅助函数
# =============================================================================


def _format_events(events: list[SimEvent]) -> str:
    """将事件列表转为可读的时间线文本。"""
    if not events:
        return "（无记录的事件）"

    lines: list[str] = []
    for i, evt in enumerate(events, 1):
        tick_label = f"[Tick {evt.tick}]"
        desc = evt.description or "(无描述)"
        lines.append(f"{i}. {tick_label} {desc}")

    return "\n".join(lines)


def _parse_narrative(raw: str) -> tuple[str, str]:
    """从 LLM 原始返回中提取标题和正文。

    支持格式:
    - 标题：xxx\n\n正文...
    - ### 标题\n\n正文...
    - 直接正文（无标题）
    """
    text = raw.strip()

    # 尝试解析 "标题：xxx" 格式
    for prefix in ("标题：", "标题:", "## ", "# "):
        if text.startswith(prefix):
            parts = text.split("\n", 1)
            title = parts[0][len(prefix):].strip()
            body = parts[1].strip() if len(parts) > 1 else ""
            return title, body

    # 尝试在首行中找标题模式
    first_line = text.split("\n")[0]
    if first_line and ("：" in first_line or ":" in first_line) and len(first_line) < 50:
        parts = text.split("\n", 1)
        return parts[0].strip(), parts[1].strip() if len(parts) > 1 else ""

    # 无标题——用首 30 字
    title = text[:30] + ("..." if len(text) > 30 else "")
    return title, text
