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
            content=content,
            importance=importance,
            keywords=keywords,
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        self._session.add(memory)
        await self._session.commit()
        await self._session.refresh(memory)

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
    ) -> list[MemoryResponse]:
        """检索与上下文相关的记忆。

        P0 算法:
            1. 从 context 中提取关键词
            2. SQL LIKE 匹配 content 或 keywords 字段
            3. 按 importance DESC, created_at DESC 排序
            4. 返回 top_k 条

        Args:
            agent_id: Agent ID
            context: 检索上下文（如当前对话主题或事件描述）
            top_k: 返回条数（默认 5）

        Returns:
            相关记忆列表，按重要性 × 时间排序
        """
        keywords = _extract_keywords(context)

        if not keywords:
            # 没有可用的关键词 → 回退到最近的记忆
            logger.debug(f"MemoryRetriever.retrieve: no keywords from context, "
                         f"falling back to recent for agent={agent_id}")
            return await self.get_recent(agent_id, limit=top_k)

        # 构建 LIKE 条件: (content LIKE '%kw%' OR keywords LIKE '%kw%')
        conditions = []
        for kw in keywords:
            safe_kw = kw.replace("'", "''")  # SQL 注入防护
            conditions.append(
                f"(content LIKE '%{safe_kw}%' OR keywords LIKE '%{safe_kw}%')"
            )

        where_clause = " OR ".join(conditions)
        sql = (
            f"SELECT * FROM memories "
            f"WHERE agent_id = :agent_id AND ({where_clause}) "
            f"ORDER BY importance DESC, created_at DESC "
            f"LIMIT :limit"
        )

        logger.debug(f"MemoryRetriever.retrieve: agent={agent_id}, "
                      f"keywords={keywords}, top_k={top_k}")

        result = await self._session.execute(
            text(sql), {"agent_id": agent_id, "limit": top_k}
        )
        rows = result.fetchall()

        # 转为 Pydantic 响应
        memories = [
            MemoryResponse(
                id=row.id,
                agent_id=row.agent_id,
                type=row.type,
                content=row.content,
                importance=row.importance,
                keywords=row.keywords,
                created_at=row.created_at,
            )
            for row in rows
        ]

        # 关键词匹配无结果 → 回退到最近记忆
        if not memories:
            logger.debug("MemoryRetriever.retrieve: no keyword matches, "
                         "falling back to recent")
            return await self.get_recent(agent_id, limit=top_k)

        logger.debug(f"MemoryRetriever.retrieve: found {len(memories)} memories")
        return memories

    # -------------------------------------------------------------------------
    # 快捷方法
    # -------------------------------------------------------------------------

    async def get_recent(
        self, agent_id: str, limit: int = 10
    ) -> list[MemoryResponse]:
        """获取最近 N 条记忆（按时间降序）。

        Args:
            agent_id: Agent ID
            limit: 最多返回条数

        Returns:
            最近的记忆列表
        """
        sql = (
            "SELECT * FROM memories "
            "WHERE agent_id = :agent_id "
            "ORDER BY created_at DESC "
            "LIMIT :limit"
        )
        result = await self._session.execute(
            text(sql), {"agent_id": agent_id, "limit": limit}
        )
        rows = result.fetchall()

        return [
            MemoryResponse(
                id=row.id,
                agent_id=row.agent_id,
                type=row.type,
                content=row.content,
                importance=row.importance,
                keywords=row.keywords,
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
