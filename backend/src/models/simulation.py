"""
Simulation 数据模型 — 模拟运行记录
"""

from pydantic import BaseModel, Field
from typing import Optional


class SimulationResponse(BaseModel):
    """模拟运行响应"""
    id: str
    world_id: str
    started_at: str
    ended_at: Optional[str] = Field(default=None)
    total_ticks: int = Field(default=0)
    status: str = Field(default="running", description="running | paused | finished | error")
