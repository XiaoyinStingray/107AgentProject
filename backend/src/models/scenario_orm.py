"""
场景 ORM — SQLite 持久化模型。
存储用户自定义场景（内置场景从 BUILTIN_SCENARIOS 常量加载，不存 DB）。
"""

import json
from datetime import datetime, timezone

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class ScenarioRow(Base):
    """custom_scenarios 表——仅存储用户自定义场景。"""

    __tablename__ = "custom_scenarios"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String, default="")
    time_range: Mapped[str] = mapped_column(String, default="1-20")
    initial_events_json: Mapped[str] = mapped_column(String, default="[]")
    environment_params_json: Mapped[str] = mapped_column(String, default="{}")
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_scenario(self) -> dict:
        """反序列化为 Scenario 兼容的 dict。"""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "time_range": self.time_range,
            "initial_events": json.loads(self.initial_events_json),
            "environment_params": json.loads(self.environment_params_json),
        }
