"""
World ORM — SQLite 持久化模型。

存储 WorldResponse 的序列化数据（scenario/agent_ids/status/tick），
运行时 WorldEngine 仍持有内存中的 WorldResponse 实例，
关键状态变更同步回 DB。
"""

import json
from datetime import datetime, timezone

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class WorldRow(Base):
    """worlds 表——存储 World 元数据快照。"""

    __tablename__ = "worlds"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    scenario_json: Mapped[str] = mapped_column(String, default="{}")
    agent_ids_json: Mapped[str] = mapped_column(String, default="[]")
    current_tick: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String, default="idle")
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    # ---- 序列化辅助 ----

    def to_dict(self) -> dict:
        """反序列化为 WorldResponse 兼容的 dict。"""
        return {
            "id": self.id,
            "name": self.name,
            "scenario": json.loads(self.scenario_json),
            "agent_ids": json.loads(self.agent_ids_json),
            "current_tick": self.current_tick,
            "status": self.status,
            "created_at": self.created_at,
        }

    @classmethod
    def from_response(cls, data: dict) -> "WorldRow":
        """从 WorldResponse.model_dump() 创建 ORM 行。"""
        return cls(
            id=data["id"],
            name=data.get("name", ""),
            scenario_json=json.dumps(data.get("scenario", {}), ensure_ascii=False),
            agent_ids_json=json.dumps(data.get("agent_ids", []), ensure_ascii=False),
            current_tick=data.get("current_tick", 0),
            status=data.get("status", "idle"),
            created_at=data.get("created_at", datetime.now(timezone.utc).isoformat()),
        )
