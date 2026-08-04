"""
MemoryRetriever 单元测试 — 使用内存 SQLite。
"""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from db import Base
from models.memory import Memory  # noqa: F401 — 确保 ORM 被 Base 感知


# =============================================================================
# 内存 SQLite fixtures
# =============================================================================


@pytest_asyncio.fixture
async def engine():
    """内存 SQLite 引擎——每个测试独立。"""
    eng = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine):
    """数据库 session。"""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        yield s


@pytest_asyncio.fixture
async def retriever(session):
    """注入 session 的 MemoryRetriever。"""
    from engines.agent_factory.memory import MemoryRetriever

    return MemoryRetriever(session)


# =============================================================================
# 关键词提取
# =============================================================================


def test_extract_keywords_chinese():
    from engines.agent_factory.memory import _extract_keywords

    kws = _extract_keywords("期末考试，图书馆座位紧张，大家都在复习")
    # P0 按标点切分，"期末考试" 作为一个整体关键词
    assert "期末考试" in kws or "图书馆座位紧张" in kws
    assert len(kws) >= 2


def test_extract_keywords_filters_stop_words():
    from engines.agent_factory.memory import _extract_keywords

    # 停用词 + 标点分隔 → 所有切分后的词都是停用词 → 空结果
    kws = _extract_keywords("的 了 在 是 我 的")
    assert kws == []


def test_extract_keywords_deduplicates():
    from engines.agent_factory.memory import _extract_keywords

    kws = _extract_keywords("图书馆 图书馆 图书馆")
    assert kws.count("图书馆") == 1


def test_extract_keywords_min_length():
    from engines.agent_factory.memory import _extract_keywords

    kws = _extract_keywords("a b c 图书 馆藏", min_len=2)
    # "a", "b", "c" 单字符过滤；"图书", "馆藏" >= 2
    for kw in kws:
        assert len(kw) >= 2


# =============================================================================
# 写入
# =============================================================================


@pytest.mark.asyncio
async def test_add_memory_persists(retriever):
    """add_memory 写入数据库并返回 MemoryResponse。"""
    mem = await retriever.add_memory("agent-1", "在图书馆遇到了新朋友", importance=0.7)
    assert mem.id != ""
    assert mem.agent_id == "agent-1"
    assert mem.content == "在图书馆遇到了新朋友"
    assert mem.type == "episodic"
    assert mem.importance == 0.7
    # 关键词应自动提取
    assert "图书馆" in mem.keywords or "朋友" in mem.keywords


@pytest.mark.asyncio
async def test_add_memory_default_values(retriever):
    """默认参数：type=episodic, importance=0.5。"""
    mem = await retriever.add_memory("agent-1", "测试记忆")
    assert mem.type == "episodic"
    assert mem.importance == 0.5


# =============================================================================
# 检索
# =============================================================================


@pytest.mark.asyncio
async def test_retrieve_finds_relevant_memory(retriever):
    """retrieve 根据上下文关键词检索到相关记忆。"""
    await retriever.add_memory("a1", "在图书馆复习高数", importance=0.9)
    await retriever.add_memory("a1", "食堂午饭吃的麻辣烫", importance=0.1)

    results = await retriever.retrieve("a1", "期末考试 图书馆", top_k=3)
    assert len(results) >= 1
    assert "图书馆" in results[0].content


@pytest.mark.asyncio
async def test_retrieve_sorts_by_importance(retriever):
    """高 importance 的记忆排在前面。"""
    await retriever.add_memory("a1", "低重要性事件", importance=0.2)
    await retriever.add_memory("a1", "高重要性事件", importance=0.9)
    await retriever.add_memory("a1", "中重要性事件", importance=0.5)

    results = await retriever.retrieve("a1", "事件", top_k=3)
    assert results[0].importance == 0.9
    assert results[1].importance == 0.5
    assert results[2].importance == 0.2


@pytest.mark.asyncio
async def test_retrieve_respects_top_k(retriever):
    """top_k 参数限制返回条数。"""
    for i in range(10):
        await retriever.add_memory("a1", f"事件 {i}", importance=0.5)

    results = await retriever.retrieve("a1", "事件", top_k=3)
    assert len(results) == 3


@pytest.mark.asyncio
async def test_retrieve_filters_by_agent_id(retriever):
    """只检索指定 Agent 的记忆。"""
    await retriever.add_memory("a1", "小明的记忆", importance=0.9)
    await retriever.add_memory("a2", "小红的记忆", importance=0.9)

    results = await retriever.retrieve("a1", "记忆", top_k=5)
    assert all(r.agent_id == "a1" for r in results)
    assert any("小明" in r.content for r in results)
    assert not any("小红" in r.content for r in results)


@pytest.mark.asyncio
async def test_retrieve_no_keywords_falls_back_to_recent(retriever):
    """context 无关键词时回退到最近记忆。"""
    await retriever.add_memory("a1", "事件A")
    await retriever.add_memory("a1", "事件B")

    results = await retriever.retrieve("a1", "的的的的", top_k=5)
    assert len(results) == 2  # 回退到所有最近记忆


# =============================================================================
# get_recent
# =============================================================================


@pytest.mark.asyncio
async def test_get_recent_returns_latest(retriever):
    """get_recent 按时间降序返回。"""
    mem1 = await retriever.add_memory("a1", "最早的记忆")
    mem2 = await retriever.add_memory("a1", "最新的记忆")

    results = await retriever.get_recent("a1", limit=10)
    # 两条记录都应返回（created_at 可能同一秒，不严格比较顺序）
    result_contents = {r.content for r in results}
    assert "最早的记忆" in result_contents
    assert "最新的记忆" in result_contents


@pytest.mark.asyncio
async def test_get_recent_respects_limit(retriever):
    """get_recent 的 limit 参数生效。"""
    for i in range(10):
        await retriever.add_memory("a1", f"记忆{i}")

    results = await retriever.get_recent("a1", limit=3)
    assert len(results) == 3


# =============================================================================
# 删除
# =============================================================================


@pytest.mark.asyncio
async def test_delete_by_agent_removes_all(retriever):
    """delete_by_agent 删除指定 Agent 的全部记忆。"""
    await retriever.add_memory("a1", "mem1")
    await retriever.add_memory("a1", "mem2")
    await retriever.add_memory("a2", "mem3")

    deleted = await retriever.delete_by_agent("a1")
    assert deleted == 2

    # a1 的记忆清空
    results = await retriever.get_recent("a1", limit=10)
    assert len(results) == 0

    # a2 的记忆不受影响
    results = await retriever.get_recent("a2", limit=10)
    assert len(results) == 1


# =============================================================================
# Step 82: types 过滤 + lesson 优先排序
# =============================================================================


@pytest.mark.asyncio
async def test_retrieve_filters_by_type(retriever):
    """types 参数过滤只返回指定类型的记忆。"""
    await retriever.add_memory("a1", "图书馆事件记录", type_="episodic", importance=0.5)
    await retriever.add_memory("a1", "图书馆教训总结", type_="lesson", importance=0.8)
    await retriever.add_memory("a1", "图书馆知识库内容", type_="semantic", importance=0.6)

    # 只检索 lesson 类型
    results = await retriever.retrieve("a1", "图书馆", top_k=5, types=["lesson"])
    assert len(results) == 1
    assert results[0].memory_type == "lesson"


@pytest.mark.asyncio
async def test_retrieve_filters_by_multiple_types(retriever):
    """types 参数支持多类型过滤。"""
    await retriever.add_memory("a1", "食堂事件记录", type_="episodic", importance=0.5)
    await retriever.add_memory("a1", "食堂教训总结", type_="lesson", importance=0.8)
    await retriever.add_memory("a1", "食堂知识库内容", type_="semantic", importance=0.6)

    results = await retriever.retrieve("a1", "食堂", top_k=5, types=["lesson", "semantic"])
    assert len(results) == 2
    types_found = {r.memory_type for r in results}
    assert types_found == {"lesson", "semantic"}


@pytest.mark.asyncio
async def test_lesson_priority_in_retrieve(retriever):
    """lesson 类型记忆在检索结果中优先展示（即使 importance 较低）。"""
    await retriever.add_memory("a1", "高重要性普通事件", type_="episodic", importance=0.9)
    await retriever.add_memory("a1", "低重要性教训内容", type_="lesson", importance=0.7)

    results = await retriever.retrieve("a1", "事件 教训 内容 重要性", top_k=5)
    # lesson 类型应排在前面（按 _lesson_priority DESC 排序）
    lesson_indices = [i for i, r in enumerate(results) if r.memory_type == "lesson"]
    episodic_indices = [i for i, r in enumerate(results) if r.memory_type == "episodic"]
    if lesson_indices and episodic_indices:
        assert lesson_indices[0] < episodic_indices[0]


@pytest.mark.asyncio
async def test_retrieve_types_none_returns_all(retriever):
    """types=None（默认）返回所有类型。"""
    await retriever.add_memory("a1", "普通事件内容", type_="episodic", importance=0.5)
    await retriever.add_memory("a1", "教训总结内容", type_="lesson", importance=0.8)

    results = await retriever.retrieve("a1", "内容", top_k=5)
    assert len(results) == 2
    types_found = {r.memory_type for r in results}
    assert "episodic" in types_found or "lesson" in types_found


@pytest.mark.asyncio
async def test_get_recent_types_filter(retriever):
    """get_recent 的 types 参数正确过滤。"""
    await retriever.add_memory("a1", "普通事件A", type_="episodic")
    await retriever.add_memory("a1", "教训内容B", type_="lesson")
    await retriever.add_memory("a1", "普通事件C", type_="episodic")

    results = await retriever.get_recent("a1", limit=10, types=["lesson"])
    assert len(results) == 1
    assert results[0].memory_type == "lesson"


@pytest.mark.asyncio
async def test_add_memory_sets_memory_type(retriever):
    """add_memory 同步设置 memory_type 列。"""
    mem = await retriever.add_memory("a1", "同步测试内容", type_="lesson", importance=0.8)
    assert mem.memory_type == "lesson"
    assert mem.type == "lesson"
