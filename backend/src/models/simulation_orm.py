"""
Simulation ORM — 模拟运行记录持久化。
Step 45: 从内存 dict 迁移到 SQLite，重启不丢数据。
"""

from datetime import datetime, timezone

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class SimulationRow(Base):
    """simulations 表——存储每次模拟运行的元数据。"""

    __tablename__ = "simulations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    world_id: Mapped[str] = mapped_column(String, index=True)
    started_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )
    ended_at: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    total_ticks: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="running")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "world_id": self.world_id,
            "started_at": self.started_at,
            "ended_at": self.ended_at,
            "total_ticks": self.total_ticks,
            "status": self.status,
        }
