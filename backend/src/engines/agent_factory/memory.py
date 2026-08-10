"""
MemoryRetriever — 记忆的写入与检索。

P0 策略：关键词匹配 + importance 排序 + 时间衰退（近期的优先）。
P2 升级：加向量检索。

用法:
    retriever = MemoryRetriever(db_session)
    await retriever.add_memory(agent_id, "在图书馆遇到了新朋友", type_="episodic")
    memories = await retriever.retrieve(agent_id, "图书馆 社交", top_k=5)
"""

import re
import uuid
from datetime import datetime, timezone

from loguru import logger
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from models.memory import Memory, MemoryResponse


# =============================================================================
# 关键词提取
# =============================================================================

# 按任意非字母数字字符切分（中英文标点、空格、特殊符号均匹配）
_KEYWORD_SPLIT_PATTERN = re.compile(r"[\W_]+")

# 停用词——这些词不参与匹配
_STOP_WORDS: set[str] = {
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一",
    "一个", "这", "那", "他", "她", "它", "们", "也", "与", "及", "或",
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "to", "of", "in", "for",
    "on", "with", "at", "by", "from", "as", "into", "through", "during",
}


def _extract_keywords(text: str, min_len: int = 2) -> list[str]:
    """从文本中提取关键词——用于 SQL LIKE 匹配。

    策略:
        1. 按中英文分隔符切分
        2. 过滤长度 < min_len 的词
        3. 过滤停用词

    Args:
        text: 任意文本（中文/英文混排）
        min_len: 最小关键词长度（默认 2）

    Returns:
        去重后的关键词列表
    """
    parts = _KEYWORD_SPLIT_PATTERN.split(text)
    seen: set[str] = set()
    keywords: list[str] = []
    for w in parts:
        w = w.strip().lower()
        if len(w) < min_len or w in _STOP_WORDS or w in seen:
            continue
        seen.add(w)
        keywords.append(w)
    return keywords


# =============================================================================
# MemoryRetriever
# =============================================================================


class MemoryRetriever:
    """记忆检索器——P0 关键词匹配 + importance 排序。

    用法:
        retriever = MemoryRetriever(db_session)
        mem = await retriever.add_memory("a1", "遇到了新朋友", type_="episodic")
        results = await retriever.retrieve("a1", "朋友 社交", top_k=5)
    """

    def __init__(self, session: AsyncSession):
        """注入数据库 session。

        Args:
            session: SQLAlchemy AsyncSession（由调用方管理生命周期）
        """
        self._session = session

    # -------------------------------------------------------------------------
    # 写入
    # -------------------------------------------------------------------------

    async def add_memory(
        self,
        agent_id: str,
        content: str,
        type_: str = "episodic",
        importance: float = 0.5,
    ) -> MemoryResponse:
        """添加一条记忆并返回持久化后的 MemoryResponse。

        Args:
            agent_id: 所属 Agent 的 ID
            content: 记忆内容
            type_: 类型（episodic / semantic）
            importance: 重要性 0-1（默认 0.5）

        Returns:
            MemoryResponse: 持久化后的记忆记录
        """
        # 自动提取关键词
        keywords = " ".join(_extract_keywords(content))

        memory = Memory(
            id=str(uuid.uuid4()),
            agent_id=agent_id,
            type=type_,
            memory_type=type_,  # State 4: 同步 memory_type 列
            content=content,
            importance=importance,
            keywords=keywords,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        self._session.add(memory)
        try:
            await self._session.commit()
            await self._session.refresh(memory)
        except Exception:
            # 重复 ID 或事务状态异常 → 回滚并跳过
            await self._session.rollback()
            logger.warning(
                f"MemoryRetriever.add: skipped duplicate memory for agent={agent_id[:8]}"
            )
            # 返回一个虚拟响应，避免调用方崩溃
            return MemoryResponse(
                id=memory.id,
                agent_id=agent_id,
                type=type_,
                content=content,
                importance=importance,
                keywords=keywords,
                created_at=memory.created_at,
            )

        logger.debug(f"MemoryRetriever.add: agent={agent_id}, type={type_}, "
                      f"importance={importance}, keywords={keywords[:50]}")
        return memory.to_response()

    # -------------------------------------------------------------------------
    # 检索
    # -------------------------------------------------------------------------

    async def retrieve(
        self,
        agent_id: str,
        context: str,
        top_k: int = 5,
        types: list[str] | None = None,
    ) -> list[MemoryResponse]:
        """检索与上下文相关的记忆。

        P0 算法:
            1. 从 context 中提取关键词
            2. SQL LIKE 匹配 content 或 keywords 字段
            3. 可选按 memory_type 过滤（types=["lesson", "episodic"] 或 None=全部）
            4. lesson 类型优先展示（importance 更高）
            5. 按 importance DESC, created_at DESC 排序
            6. 返回 top_k 条

        Args:
            agent_id: Agent ID
            context: 检索上下文
            top_k: 返回条数（默认 5）
            types: memory_type 过滤列表（可选，None=全部）

        Returns:
            相关记忆列表，lesson 类型优先
        """
        keywords = _extract_keywords(context)

        if not keywords:
            logger.debug(f"MemoryRetriever.retrieve: no keywords from context, "
                         f"falling back to recent for agent={agent_id}")
            return await self.get_recent(agent_id, limit=top_k, types=types)

        # 构建 LIKE 条件
        conditions = []
        for kw in keywords:
            safe_kw = kw.replace("'", "''")
            conditions.append(
                f"(content LIKE '%{safe_kw}%' OR keywords LIKE '%{safe_kw}%')"
            )

        where_clause = " OR ".join(conditions)

        # types 过滤
        type_filter = ""
        if types:
            escaped = [f"'{t.replace(chr(39), chr(39)+chr(39))}'" for t in types]
            type_filter = f" AND memory_type IN ({','.join(escaped)})"

        # lesson 类型优先排序
        sql = (
            f"SELECT *, CASE WHEN memory_type = 'lesson' THEN 1 ELSE 0 END AS _lesson_priority "
            f"FROM memories "
            f"WHERE agent_id = :agent_id AND ({where_clause}){type_filter} "
            f"ORDER BY _lesson_priority DESC, importance DESC, created_at DESC "
            f"LIMIT :limit"
        )

        logger.debug(f"MemoryRetriever.retrieve: agent={agent_id}, "
                      f"keywords={keywords}, top_k={top_k}, types={types}")

        result = await self._session.execute(
            text(sql), {"agent_id": agent_id, "limit": top_k}
        )
        rows = result.fetchall()

        memories = [
            MemoryResponse(
                id=row.id,
                agent_id=row.agent_id,
                type=row.type,
                content=row.content,
                importance=row.importance,
                keywords=row.keywords,
                memory_type=getattr(row, "memory_type", "episodic"),
                created_at=row.created_at,
            )
            for row in rows
        ]

        if not memories:
            logger.debug("MemoryRetriever.retrieve: no keyword matches, falling back to recent")
            return await self.get_recent(agent_id, limit=top_k, types=types)

        logger.debug(f"MemoryRetriever.retrieve: found {len(memories)} memories")
        return memories

    # -------------------------------------------------------------------------
    # 快捷方法
    # -------------------------------------------------------------------------

    async def get_recent(
        self, agent_id: str, limit: int = 10,
        types: list[str] | None = None,
    ) -> list[MemoryResponse]:
        """获取最近 N 条记忆（按时间降序）。

        Args:
            agent_id: Agent ID
            limit: 最多返回条数
            types: memory_type 过滤（可选，None=全部）

        Returns:
            最近的记忆列表
        """
        type_filter = ""
        params: dict = {"agent_id": agent_id, "limit": limit}
        if types:
            # 用参数化避免 SQL 注入
            placeholders = ", ".join([f":type_{i}" for i in range(len(types))])
            type_filter = f" AND memory_type IN ({placeholders})"
            for i, t in enumerate(types):
                params[f"type_{i}"] = t

        sql = (
            "SELECT * FROM memories "
            "WHERE agent_id = :agent_id"
            + type_filter +
            " ORDER BY created_at DESC "
            "LIMIT :limit"
        )
        result = await self._session.execute(text(sql), params)
        rows = result.fetchall()

        return [
            MemoryResponse(
                id=row.id,
                agent_id=row.agent_id,
                type=row.type,
                content=row.content,
                importance=row.importance,
                keywords=row.keywords,
                memory_type=getattr(row, "memory_type", "episodic"),
                created_at=row.created_at,
            )
            for row in rows
        ]

    async def delete_by_agent(self, agent_id: str) -> int:
        """删除某个 Agent 的所有记忆（Agent 被删除时调用）。

        Args:
            agent_id: Agent ID

        Returns:
            删除的记录数
        """
        result = await self._session.execute(
            text("DELETE FROM memories WHERE agent_id = :agent_id"),
            {"agent_id": agent_id},
        )
        await self._session.commit()
        count: int = getattr(result, "rowcount", -1) or 0
        logger.info(f"MemoryRetriever.delete_by_agent: agent={agent_id}, "
                     f"deleted {count} records")
        return count


# =============================================================================
# MemoryConsolidator — Step 82: 情景记忆固化
# =============================================================================

CONSOLIDATION_PROMPT = """你是一个记忆反思系统。根据以下 Agent 在最近 {tick_count} 个 tick 中的关键经历，
提取 2-5 条"教训"（lesson）。

关键事件摘要：
{event_summary}

请反思：
1. Agent 学到了什么？（最多 3 条教训）
2. Agent 做对了什么？（最多 2 条成功经验）
3. Agent 下次遇到类似情况应该怎么做？

返回 JSON 数组格式（只返回 JSON，不要其他文字）：
[
  {{"content": "教训内容（20-100字）", "importance": 0.7-0.9, "type": "lesson"}},
  ...
]"""


class MemoryConsolidator:
    """记忆固化器——Episode 结束后 LLM 反思 → 提取教训 → 写入 lesson 记忆。

    用法:
        consolidator = MemoryConsolidator(model_client, db_session)
        lessons = await consolidator.consolidate(agent_id, events, (0, 10))
    """

    def __init__(self, model_client, db_session):
        self._model_client = model_client
        self._retriever = MemoryRetriever(db_session)

    async def consolidate(
        self,
        agent_id: str,
        events: list,
        tick_range: tuple[int, int],
    ) -> list:
        """LLM 反思关键经历 → 提取 2-5 条 lesson 记忆。

        Args:
            agent_id: Agent UUID
            events: 本 episode 的 SimEvent 列表
            tick_range: (start_tick, end_tick)

        Returns:
            新创建的 lesson MemoryResponse 列表
        """
        if not events or not self._model_client:
            return []

        # 1. 构建事件摘要
        tick_count = tick_range[1] - tick_range[0] + 1
        event_summary = self._build_event_summary(events, agent_id)

        if len(event_summary) < 50:
            logger.debug(f"MemoryConsolidator: not enough events for agent={agent_id[:8]}")
            return []

        # 2. LLM 反思
        try:
            prompt = CONSOLIDATION_PROMPT.format(
                tick_count=tick_count,
                event_summary=event_summary[:3000],
            )
            from autogen_core.models import UserMessage
            import asyncio
            import json as _json

            result = await asyncio.wait_for(
                self._model_client.create(
                    messages=[UserMessage(content=prompt, source="consolidator")],
                ),
                timeout=15.0,
            )
            text = result.content if hasattr(result, "content") else str(result)

            # 提取 JSON
            lessons_data = _json.loads(text) if isinstance(text, str) else text
            if isinstance(lessons_data, str):
                # LLM 可能包在 markdown 代码块中
                import re
                match = re.search(r"\[.*\]", lessons_data, re.DOTALL)
                if match:
                    lessons_data = _json.loads(match.group(0))

            if not isinstance(lessons_data, list):
                return []

        except Exception as e:
            logger.warning(f"MemoryConsolidator LLM failed: {e}")
            return []

        # 3. 写入 lesson 记忆
        new_memories = []
        for item in lessons_data[:5]:
            if not isinstance(item, dict):
                continue
            content = item.get("content", "")
            if not content or len(content) < 10:
                continue
            importance = float(item.get("importance", 0.7))
            importance = max(0.0, min(1.0, importance))

            mem = await self._retriever.add_memory(
                agent_id=agent_id,
                content=content,
                type_="lesson",
                importance=importance,
            )
            new_memories.append(mem)

        logger.info(
            f"MemoryConsolidator: agent={agent_id[:8]} "
            f"generated {len(new_memories)} lesson memories"
        )
        return new_memories

    @staticmethod
    def _build_event_summary(events: list, agent_id: str) -> str:
        """从事件列表构建摘要文本。"""
        lines = []
        for e in events[-30:]:  # 最近 30 个事件
            if hasattr(e, "source_agent_id") and e.source_agent_id == agent_id:
                desc = getattr(e, "description", str(e))[:120]
                lines.append(f"- [Tick {getattr(e, 'tick', '?')}] {desc}")
            elif hasattr(e, "description"):
                desc = e.description[:120]
                if agent_id in desc:
                    lines.append(f"- [Tick {getattr(e, 'tick', '?')}] (涉及自己) {desc}")
        return "\n".join(lines[-20:])  # 最多 20 行
