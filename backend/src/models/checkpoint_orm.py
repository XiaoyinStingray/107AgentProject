"""
存档 ORM — 场景快照持久化（Step 65）

每个场景最多 30 个存档。删除旧场景时同步清理。
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, select, func, delete
from sqlalchemy.orm import Mapped, mapped_column
from db import Base, AsyncSession


class CheckpointRow(Base):
    __tablename__ = "checkpoints"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    scene_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), default="")
    agents_json: Mapped[str] = mapped_column(Text, default="[]")  # AgentSpriteData[] JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))

    @staticmethod
    async def list_by_scene(db: AsyncSession, scene_id: str) -> list["CheckpointRow"]:
        result = await db.execute(
            select(CheckpointRow)
            .where(CheckpointRow.scene_id == scene_id)
            .order_by(CheckpointRow.created_at.desc())
        )
        return list(result.scalars().all())

    @staticmethod
    async def count_by_scene(db: AsyncSession, scene_id: str) -> int:
        result = await db.execute(
            select(func.count()).where(CheckpointRow.scene_id == scene_id)
        )
        return result.scalar() or 0

    @staticmethod
    async def delete_by_scene_and_id(
        db: AsyncSession,
        scene_id: str,
        checkpoint_id: str,
    ) -> bool:
        """Delete one checkpoint only when it belongs to the requested scene."""
        result = await db.execute(
            delete(CheckpointRow).where(
                CheckpointRow.id == checkpoint_id,
                CheckpointRow.scene_id == scene_id,
            )
        )
        await db.commit()
        return getattr(result, "rowcount", 0) > 0

    MAX_PER_SCENE = 30
