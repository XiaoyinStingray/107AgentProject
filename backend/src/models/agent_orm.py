"""
Agent ORM — SQLite 持久化模型。

存储 AgentResponse 的序列化数据（persona/background/goals/emotional_state），
读取时通过 AgentFactory.create_from_persona() 重建 LifeAgent 实例。
"""

import json
from datetime import datetime, timezone

from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class AgentRow(Base):
    """agents 表——存储 Agent 的完整快照。"""

    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    persona_json: Mapped[str] = mapped_column(String, default="{}")
    background_json: Mapped[str] = mapped_column(String, default="{}")
    goals_json: Mapped[str] = mapped_column(String, default="[]")
    emotional_json: Mapped[str] = mapped_column(String, default="{}")
    energy: Mapped[float] = mapped_column(Float, default=100.0)
    notes_json: Mapped[str] = mapped_column(String, default="[]")  # Step 78: 私有笔记 JSON
    fingerprint_json: Mapped[str] = mapped_column(String, default="{}")  # Step 83: 行为指纹
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )
    updated_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    # ---- 序列化辅助 ----

    def to_dict(self) -> dict:
        """反序列化为 AgentResponse 兼容的 dict。"""
        return {
            "id": self.id,
            "name": self.name,
            "persona": json.loads(self.persona_json),
            "background": json.loads(self.background_json),
            "goals": json.loads(self.goals_json),
            "emotional_state": json.loads(self.emotional_json),
            "energy": self.energy,
            "notes_json": self.notes_json,
            "fingerprint_json": self.fingerprint_json,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }

    @classmethod
    def from_response(cls, data: dict) -> "AgentRow":
        """从 AgentResponse.model_dump() 创建 ORM 行。"""
        return cls(
            id=data["id"],
            name=data.get("name", ""),
            persona_json=json.dumps(data.get("persona", {}), ensure_ascii=False),
            background_json=json.dumps(data.get("background", {}), ensure_ascii=False),
            goals_json=json.dumps(data.get("goals", []), ensure_ascii=False),
            emotional_json=json.dumps(data.get("emotional_state", {}), ensure_ascii=False),
            energy=data.get("energy", 100.0),
            notes_json=data.get("notes_json", "[]"),
            fingerprint_json=data.get("fingerprint_json", "{}"),
            created_at=data.get("created_at", datetime.now(timezone.utc).isoformat()),
            updated_at=data.get("updated_at", datetime.now(timezone.utc).isoformat()),
        )
