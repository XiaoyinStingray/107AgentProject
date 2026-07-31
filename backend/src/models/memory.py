"""
Memory 数据模型 — Agent 记忆存储。
Pydantic（API 层）+ SQLAlchemy ORM（持久层）。
"""

from datetime import datetime, timezone

from pydantic import BaseModel, Field
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from db import Base
from .base import Timestamped


# =============================================================================
# Pydantic 模型（API 层）
# =============================================================================


class MemoryCreate(BaseModel):
    """创建记忆"""
    agent_id: str
    type: str = Field(default="episodic", description="episodic | semantic")
    content: str = Field(..., min_length=1)
    importance: float = Field(default=0.5, ge=0, le=1)


class MemoryResponse(Timestamped):
    """记忆响应"""
    agent_id: str
    type: str
    content: str
    importance: float
    keywords: str = Field(default="")
    memory_type: str = Field(default="episodic")  # Step 82: episodic|semantic|lesson|reflection|skill


# =============================================================================
# SQLAlchemy ORM 模型（持久层）
# =============================================================================


class Memory(Base):
    """记忆表——SQLAlchemy ORM。

    Base.metadata.create_all 自动建表。
    与 Pydantic MemoryResponse 字段一一对应。
    """

    __tablename__ = "memories"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String, default="episodic")
    content: Mapped[str] = mapped_column(String)
    importance: Mapped[float] = mapped_column(default=0.5)
    keywords: Mapped[str] = mapped_column(String, default="")
    memory_type: Mapped[str] = mapped_column(String, default="episodic")  # Step 82: episodic|semantic|lesson|reflection|skill
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_response(self) -> MemoryResponse:
        """转为 Pydantic 响应模型。"""
        return MemoryResponse(
            id=self.id,
            agent_id=self.agent_id,
            type=self.type,
            content=self.content,
            importance=self.importance,
            keywords=self.keywords,
            memory_type=self.memory_type,
            created_at=self.created_at,
        )
