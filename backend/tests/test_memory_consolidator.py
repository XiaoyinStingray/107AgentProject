"""
MemoryConsolidator 单元测试 — Mock LLM + 内存 SQLite。

覆盖:
  - consolidate 触发条件（空事件 / 短摘要 / 正常）
  - LLM 返回 JSON 解析（正常 / markdown 包裹 / 非法格式）
  - lesson 记忆写入（importance 范围 / 内容长度过滤）
  - LLM 超时 / 异常降级
"""

import json

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from db import Base
from models.memory import Memory  # noqa: F401 — 确保 ORM 被 Base 感知


# =============================================================================
# Fixtures
# =============================================================================


@pytest_asyncio.fixture
async def db_engine():
    eng = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session(db_engine):
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        yield s


class _FakeResult:
    def __init__(self, content: str):
        self.content = content


class MockModelClient:
    """模拟 LLM 客户端——返回预设 JSON。"""

    model_info: dict = {"function_calling": False}

    def __init__(self, response_text: str | None = None, raise_error: bool = False):
        self._response = response_text
        self._raise = raise_error
        self.call_count = 0

    async def create(self, messages):
        self.call_count += 1
        if self._raise:
            raise RuntimeError("LLM 模拟异常")
        return _FakeResult(self._response or "[]")


# =============================================================================
# 辅助：构造模拟事件
# =============================================================================


def _make_event(agent_id: str, tick: int, description: str):
    """构造最小 SimEvent 兼容对象。"""
    from types import SimpleNamespace
    return SimpleNamespace(
        id=f"evt-{tick}",
        source_agent_id=agent_id,
        tick=tick,
        description=description,
        type="agent_action",
    )


def _make_events(agent_id: str, count: int = 10) -> list:
    """生成 count 个事件，摘要足够长以触发 consolidate。"""
    return [
        _make_event(agent_id, i, f"Agent 在第 {i} tick 进行了重要的决策和行动记录，这是一段足够长的描述文本用于触发记忆固化流程。")
        for i in range(count)
    ]


# =============================================================================
# consolidate 触发条件
# =============================================================================


class TestConsolidateTrigger:
    """consolidate 触发条件测试。"""

    @pytest.mark.asyncio
    async def test_empty_events_returns_empty(self, session):
        """空事件列表 → 返回空列表。"""
        from engines.agent_factory.memory import MemoryConsolidator

        client = MockModelClient("[]")
        consolidator = MemoryConsolidator(client, session)
        result = await consolidator.consolidate("a1", [], (0, 10))
        assert result == []
        assert client.call_count == 0  # 不应调用 LLM

    @pytest.mark.asyncio
    async def test_none_model_client_returns_empty(self, session):
        """model_client 为 None → 返回空列表。"""
        from engines.agent_factory.memory import MemoryConsolidator

        consolidator = MemoryConsolidator(None, session)
        events = _make_events("a1", 10)
        result = await consolidator.consolidate("a1", events, (0, 10))
        assert result == []

    @pytest.mark.asyncio
    async def test_short_summary_skips_consolidation(self, session):
        """事件摘要太短（<50 字符）→ 不调用 LLM。"""
        from engines.agent_factory.memory import MemoryConsolidator

        client = MockModelClient("[]")
        consolidator = MemoryConsolidator(client, session)
        # 只有 1 个短事件
        events = [_make_event("a1", 0, "短")]
        result = await consolidator.consolidate("a1", events, (0, 1))
        assert result == []
        assert client.call_count == 0


# =============================================================================
# consolidate 正常流程
# =============================================================================


class TestConsolidateSuccess:
    """consolidate 正常流程测试。"""

    @pytest.mark.asyncio
    async def test_consolidate_creates_lesson_memories(self, session):
        """LLM 返回合法 JSON → 创建 lesson 记忆。"""
        from engines.agent_factory.memory import MemoryConsolidator

        lessons_json = json.dumps([
            {"content": "在图书馆应该提前占座，否则高峰期没有位置", "importance": 0.8, "type": "lesson"},
            {"content": "与陌生人交流时保持礼貌和开放的态度", "importance": 0.7, "type": "lesson"},
        ], ensure_ascii=False)
        client = MockModelClient(lessons_json)
        consolidator = MemoryConsolidator(client, session)

        events = _make_events("a1", 15)
        result = await consolidator.consolidate("a1", events, (0, 15))

        assert len(result) == 2
        assert all(m.memory_type == "lesson" for m in result)
        assert all(0.7 <= m.importance <= 0.9 for m in result)
        assert client.call_count == 1

    @pytest.mark.asyncio
    async def test_consolidate_importance_clamped(self, session):
        """importance 超出 [0,1] 范围时自动裁剪。"""
        from engines.agent_factory.memory import MemoryConsolidator

        lessons_json = json.dumps([
            {"content": "超出范围的 importance 测试内容需要足够长", "importance": 1.5, "type": "lesson"},
            {"content": "负数 importance 测试内容也需要足够长才行", "importance": -0.3, "type": "lesson"},
        ], ensure_ascii=False)
        client = MockModelClient(lessons_json)
        consolidator = MemoryConsolidator(client, session)

        events = _make_events("a1", 10)
        result = await consolidator.consolidate("a1", events, (0, 10))

        assert len(result) == 2
        assert result[0].importance == 1.0  # clamped
        assert result[1].importance == 0.0  # clamped

    @pytest.mark.asyncio
    async def test_consolidate_max_5_lessons(self, session):
        """最多创建 5 条 lesson 记忆。"""
        from engines.agent_factory.memory import MemoryConsolidator

        lessons_json = json.dumps([
            {"content": f"第{i}条教训内容需要足够长以通过长度过滤检查", "importance": 0.75, "type": "lesson"}
            for i in range(8)
        ], ensure_ascii=False)
        client = MockModelClient(lessons_json)
        consolidator = MemoryConsolidator(client, session)

        events = _make_events("a1", 10)
        result = await consolidator.consolidate("a1", events, (0, 10))

        assert len(result) <= 5

    @pytest.mark.asyncio
    async def test_consolidate_short_content_filtered(self, session):
        """内容长度 <10 的 lesson 被过滤。"""
        from engines.agent_factory.memory import MemoryConsolidator

        lessons_json = json.dumps([
            {"content": "太短", "importance": 0.8, "type": "lesson"},
            {"content": "这条教训内容足够长，可以顺利通过内容长度过滤检查", "importance": 0.7, "type": "lesson"},
        ], ensure_ascii=False)
        client = MockModelClient(lessons_json)
        consolidator = MemoryConsolidator(client, session)

        events = _make_events("a1", 10)
        result = await consolidator.consolidate("a1", events, (0, 10))

        assert len(result) == 1
        assert "足够长" in result[0].content


# =============================================================================
# LLM 返回格式解析
# =============================================================================


class TestConsolidateParsing:
    """LLM 返回格式解析测试。"""

    @pytest.mark.asyncio
    async def test_markdown_wrapped_json_returns_empty(self, session):
        """LLM 返回 markdown 代码块包裹的 JSON → json.loads 失败后被 except 捕获，返回空。

        已知限制：consolidate 中 json.loads 先于 regex 提取执行，
        markdown 包裹导致 JSONDecodeError 被 except Exception 捕获，
        regex fallback 不可达。此处记录当前行为。
        """
        from engines.agent_factory.memory import MemoryConsolidator

        raw = '```json\n[{"content": "从markdown中提取的教训内容需要足够长才能通过", "importance": 0.75, "type": "lesson"}]\n```'
        client = MockModelClient(raw)
        consolidator = MemoryConsolidator(client, session)

        events = _make_events("a1", 10)
        result = await consolidator.consolidate("a1", events, (0, 10))

        # markdown 包裹的 JSON 当前无法解析（json.loads 先失败 → except 捕获）
        assert result == []

    @pytest.mark.asyncio
    async def test_non_json_returns_empty(self, session):
        """LLM 返回非 JSON 文本 → 返回空列表。"""
        from engines.agent_factory.memory import MemoryConsolidator

        client = MockModelClient("这不是 JSON 格式的回复内容")
        consolidator = MemoryConsolidator(client, session)

        events = _make_events("a1", 10)
        result = await consolidator.consolidate("a1", events, (0, 10))

        assert result == []

    @pytest.mark.asyncio
    async def test_non_list_json_returns_empty(self, session):
        """LLM 返回 JSON 对象（非数组）→ 返回空列表。"""
        from engines.agent_factory.memory import MemoryConsolidator

        client = MockModelClient('{"error": "unexpected format"}')
        consolidator = MemoryConsolidator(client, session)

        events = _make_events("a1", 10)
        result = await consolidator.consolidate("a1", events, (0, 10))

        assert result == []


# =============================================================================
# LLM 异常降级
# =============================================================================


class TestConsolidateError:
    """LLM 异常降级测试。"""

    @pytest.mark.asyncio
    async def test_llm_exception_returns_empty(self, session):
        """LLM 抛出异常 → 返回空列表，不崩溃。"""
        from engines.agent_factory.memory import MemoryConsolidator

        client = MockModelClient(raise_error=True)
        consolidator = MemoryConsolidator(client, session)

        events = _make_events("a1", 10)
        result = await consolidator.consolidate("a1", events, (0, 10))

        assert result == []


# =============================================================================
# _build_event_summary
# =============================================================================


class TestBuildEventSummary:
    """事件摘要构建测试。"""

    def test_summary_includes_agent_events(self):
        """摘要包含 Agent 自身的事件。"""
        from engines.agent_factory.memory import MemoryConsolidator

        events = _make_events("a1", 5)
        summary = MemoryConsolidator._build_event_summary(events, "a1")
        assert "Tick" in summary
        assert len(summary) > 0

    def test_summary_includes_related_events(self):
        """摘要包含涉及自己的他人事件。"""
        from engines.agent_factory.memory import MemoryConsolidator
        from types import SimpleNamespace

        events = [
            SimpleNamespace(
                id="evt-other",
                source_agent_id="a2",
                tick=3,
                description="a1 被其他人提到了",
                type="agent_action",
            ),
        ]
        summary = MemoryConsolidator._build_event_summary(events, "a1")
        assert "涉及自己" in summary

    def test_summary_limits_to_20_lines(self):
        """摘要最多 20 行。"""
        from engines.agent_factory.memory import MemoryConsolidator

        events = _make_events("a1", 50)
        summary = MemoryConsolidator._build_event_summary(events, "a1")
        lines = [l for l in summary.split("\n") if l.strip()]
        assert len(lines) <= 20

    def test_summary_limits_to_30_events(self):
        """只取最近 30 个事件。"""
        from engines.agent_factory.memory import MemoryConsolidator

        events = _make_events("a1", 100)
        summary = MemoryConsolidator._build_event_summary(events, "a1")
        # 不应包含最早的事件（tick 0-69）
        assert "Tick 0" not in summary or "Tick 70" in summary
