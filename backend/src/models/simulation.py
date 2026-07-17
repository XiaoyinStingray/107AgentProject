"""
Simulation 数据模型 — 模拟运行记录
"""

from pydantic import Field
from typing import Optional

from .base import HasId


class SimulationResponse(HasId):
    """模拟运行响应（started_at 语义不同于 created_at，不继承 Timestamped）"""
    world_id: str
    started_at: str
    ended_at: Optional[str] = Field(default=None)
    total_ticks: int = Field(default=0)
    status: str = Field(default="running", description="running | paused | finished | error")
