"""
Event 数据模型 — 模拟事件（核心通信单位）
"""

from pydantic import BaseModel, Field
from typing import Optional

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
