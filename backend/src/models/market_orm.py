"""
Market ORM — Agent Team 市场。
Step 56: 发布/浏览/下载/评分 Team 配置。
"""

from datetime import datetime, timezone
import json

from sqlalchemy import String, Text, Integer, Float
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class MarketItem(Base):
    """market_items 表——发布到市场的 Team 配置。"""

    __tablename__ = "market_items"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    team_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String, default="[]")  # JSON array
    author: Mapped[str] = mapped_column(String, default="匿名")
    downloads: Mapped[int] = mapped_column(Integer, default=0)
    rating_total: Mapped[float] = mapped_column(Float, default=0.0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    @property
    def rating(self) -> float:
        if self.rating_count == 0:
            return 0.0
        return round(self.rating_total / self.rating_count, 1)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "team_id": self.team_id,
            "name": self.name,
            "description": self.description,
            "tags": json.loads(self.tags),
            "author": self.author,
            "downloads": self.downloads,
            "rating": self.rating,
            "rating_count": self.rating_count,
            "created_at": self.created_at,
        }
