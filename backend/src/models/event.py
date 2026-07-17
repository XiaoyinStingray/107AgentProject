"""
Event 数据模型 — 模拟事件（核心通信单位）
Pydantic（API 层）+ SQLAlchemy ORM（持久层）。
"""

import json
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, Field
from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db import Base
from .base import Timestamped


class SimEvent(Timestamped):
    """模拟事件——这是核心通信单位"""
    world_id: str
    tick: int
    type: str = Field(..., description="thought_stream | agent_message | agent_action | world_event | relationship_change | tick_boundary")
    source_agent_id: Optional[str] = Field(default=None)
    target_agent_ids: list[str] = Field(default_factory=list)
    description: str = Field(default="")
    data: dict = Field(default_factory=dict, description="附加结构数据")


class ThoughtEvent(SimEvent):
    """Agent 思维流事件——SSE 推送的实时思考过程"""
    type: str = "thought_stream"
    phase: str = Field(default="think", description="observe | think | decide | act")
    content: str = Field(default="")
    tokens_used: int = Field(default=0)


class AgentMessageEvent(SimEvent):
    """Agent 间消息"""
    type: str = "agent_message"
    message: str = Field(default="")
    subtext: str = Field(default="", description="真实想法（可能与说的话不同）")
    tone: str = Field(default="neutral")


class AgentActionEvent(SimEvent):
    """Agent 行动（tool call 结果）"""
    type: str = "agent_action"
    action: str = Field(default="")
    target: str = Field(default="")
    result: str = Field(default="")


# =============================================================================
# SQLAlchemy ORM 模型（持久层）
# =============================================================================


class Event(Base):
    """事件表——SQLAlchemy ORM。

    target_agent_ids 和 data 以 JSON 字符串存储（SQLite 无原生数组/字典类型）。
    to_response() 反序列化回 SimEvent。
    """

    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    world_id: Mapped[str] = mapped_column(String, index=True)
    tick: Mapped[int] = mapped_column(Integer, default=0)
    type: Mapped[str] = mapped_column(String)
    source_agent_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    target_agent_ids: Mapped[str] = mapped_column(String, default="[]")
    description: Mapped[str] = mapped_column(String, default="")
    data: Mapped[str] = mapped_column(String, default="{}")
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_response(self) -> SimEvent:
        """转为 Pydantic 响应模型。"""
        return SimEvent(
            id=self.id,
            world_id=self.world_id,
            tick=self.tick,
            type=self.type,
            source_agent_id=self.source_agent_id,
            target_agent_ids=_parse_json_list(self.target_agent_ids),
            description=self.description,
            data=_parse_json_dict(self.data),
            created_at=self.created_at,
        )

    @classmethod
    def from_sim_event(cls, event: SimEvent) -> "Event":
        """从 Pydantic SimEvent 创建 ORM 实例。"""
        return cls(
            id=event.id,
            world_id=event.world_id,
            tick=event.tick,
            type=event.type,
            source_agent_id=event.source_agent_id,
            target_agent_ids=json.dumps(event.target_agent_ids, ensure_ascii=False),
            description=event.description,
            data=json.dumps(event.data, ensure_ascii=False),
            created_at=event.created_at,
        )


def _parse_json_list(raw: str) -> list:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return []


def _parse_json_dict(raw: str) -> dict:
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}
