"""
叙事引擎 单元测试 — Mock LLM。
"""

import pytest

from models.agent import (
    Background,
    BigFive,
    DecisionStyle,
    Goal,
    Persona,
)
from models.event import SimEvent
from engines.narrative.engine import (
    NarrativeEngine,
    NarrativeRequest,
    NarrativeStyle,
)


# =============================================================================
# Mock LLM
# =============================================================================

class _FakeResult:
    def __init__(self, c): self.content = c


class MockLLM:
    def __init__(self, response: str | None = None):
        self._fixed = response
        self.last_messages = None

    async def create(self, messages, **kw):
        self.last_messages = messages
        if self._fixed:
            return _FakeResult(self._fixed)
        return _FakeResult("标题：测试故事\n\n这是测试正文。")


# =============================================================================
# Helpers
# =============================================================================

def make_persona() -> Persona:
    return Persona(
        name="小明", mbti="INTJ-T",
        big_five=BigFive(), decision_style=DecisionStyle(),
        narrative="小明是一个内向但坚韧的学生，来自小镇，独自在大城市求学。",
        values=["成就", "独立"],
    )


def make_events(n: int = 3) -> list[SimEvent]:
    return [
        SimEvent(
            id=f"e{i}", world_id="w1", tick=i,
            type="agent_message",
            source_agent_id="a1", description=desc,
            created_at="2026-01-01",
        )
        for i, desc in enumerate([
            "小明在图书馆遇到了新朋友小红",
            "小红帮小明复习高数",
            "两人一起参加了编程比赛",
        ][:n])
    ]


# =============================================================================
# 引擎基础
# =============================================================================

class TestNarrativeEngine:
    @pytest.mark.asyncio
    async def test_generate_story(self):
        engine = NarrativeEngine(MockLLM())
        req = NarrativeRequest(
            style=NarrativeStyle.STORY,
            agent_id="a1", events=make_events(), persona=make_persona(),
        )
        result = await engine.generate(req)
        assert result.style == NarrativeStyle.STORY
        assert result.title == "测试故事"
        assert "测试正文" in result.content
        assert result.agent_id == "a1"

    @pytest.mark.asyncio
    async def test_generate_diary(self):
        engine = NarrativeEngine(MockLLM("今天是个好日子。\n\n阳光很好，心情也不错。"))
        req = NarrativeRequest(
            style=NarrativeStyle.DIARY,
            agent_id="a1", events=make_events(), persona=make_persona(),
        )
        result = await engine.generate(req)
        assert result.style == NarrativeStyle.DIARY
        assert "好日子" in result.content

    @pytest.mark.asyncio
    async def test_generate_letter(self):
        engine = NarrativeEngine(MockLLM("标题：给小红的一封信\n\n亲爱的小红：\n你好。"))
        req = NarrativeRequest(
            style=NarrativeStyle.LETTER,
            agent_id="a1", events=make_events(), persona=make_persona(),
            target="小红",
        )
        result = await engine.generate(req)
        assert result.style == NarrativeStyle.LETTER
        assert result.title == "给小红的一封信"

    @pytest.mark.asyncio
    async def test_generate_podcast(self):
        engine = NarrativeEngine(MockLLM("标题：小镇青年的编程之路\n\n大家好，欢迎收听本期节目。"))
        req = NarrativeRequest(
            style=NarrativeStyle.PODCAST,
            agent_id="a1", events=make_events(), persona=make_persona(),
            target="编程与成长",
        )
        result = await engine.generate(req)
        assert result.style == NarrativeStyle.PODCAST
        assert result.title == "小镇青年的编程之路"

    @pytest.mark.asyncio
    async def test_generate_parallel(self):
        engine = NarrativeEngine(MockLLM("标题：图书馆的对话\n\n小明：你好，小红。\n小红：你好，小明。"))
        req = NarrativeRequest(
            style=NarrativeStyle.PARALLEL,
            agent_id="a1", events=make_events(), persona=make_persona(),
            target="小红",
        )
        result = await engine.generate(req)
        assert result.style == NarrativeStyle.PARALLEL
        assert result.title == "图书馆的对话"
        assert "小明" in result.content


# =============================================================================
# 边界情况
# =============================================================================

class TestEdgeCases:
    @pytest.mark.asyncio
    async def test_empty_events(self):
        engine = NarrativeEngine(MockLLM("今天没有特别的事发生。"))
        req = NarrativeRequest(
            style=NarrativeStyle.DIARY,
            agent_id="a1", events=[], persona=make_persona(),
        )
        result = await engine.generate(req)
        assert len(result.content) > 0

    @pytest.mark.asyncio
    async def test_no_narrative_in_persona(self):
        """persona.narrative 为空时用 name 回退。"""
        persona = make_persona()
        persona.narrative = ""
        engine = NarrativeEngine(MockLLM("标题：平凡的一天\n\n内容。"))
        req = NarrativeRequest(
            style=NarrativeStyle.STORY,
            agent_id="a1", events=make_events(), persona=persona,
        )
        result = await engine.generate(req)
        assert len(result.content) > 0

    @pytest.mark.asyncio
    async def test_parse_no_title(self):
        """LLM 不返回标题时自动生成。"""
        engine = NarrativeEngine(MockLLM("这是一段没有标题的正文内容，描述了一个普通的故事。"))
        req = NarrativeRequest(
            style=NarrativeStyle.STORY,
            agent_id="a1", events=make_events(), persona=make_persona(),
        )
        result = await engine.generate(req)
        assert len(result.title) > 0
        assert "没有标题" in result.content


# =============================================================================
# _format_events
# =============================================================================

class TestFormatEvents:
    def test_format_events_readable(self):
        from engines.narrative.engine import _format_events

        events = make_events(2)
        text = _format_events(events)
        assert "图书馆" in text
        assert "Tick" in text
        assert "1." in text and "2." in text

    def test_format_empty_events(self):
        from engines.narrative.engine import _format_events

        text = _format_events([])
        assert "无记录" in text
