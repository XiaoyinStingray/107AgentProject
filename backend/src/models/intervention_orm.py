"""
Intervention ORM — 干预事件持久化。
Step 44: 每次事件注入写入 SQLite，干预历史不再丢失。
"""

from datetime import datetime, timezone

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class InterventionRow(Base):
    """interventions 表——存储用户注入的干预事件。"""

    __tablename__ = "interventions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    world_id: Mapped[str] = mapped_column(String, index=True)
    type: Mapped[str] = mapped_column(String, default="world_event")
    target_agent_id: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    description: Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "world_id": self.world_id,
            "type": self.type,
            "target_agent_id": self.target_agent_id,
            "description": self.description,
            "created_at": self.created_at,
        }
