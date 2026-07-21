"""
World 数据模型 — 场景定义、世界状态
"""

from pydantic import BaseModel, Field

from .base import Timestamped


class Scenario(BaseModel):
    """场景定义"""
    name: str = Field(default="")
    description: str = Field(default="")
    time_range: str = Field(default="1-30", description="tick 范围，如 '1-30'")
    initial_events: list[str] = Field(default_factory=list)
    environment_params: dict = Field(default_factory=dict, description='e.g. {"location": "图书馆", "weather": "晴"}')


class WorldCreate(BaseModel):
    """创建 World 的请求体"""
    name: str = Field(..., min_length=1)
    scenario: Scenario = Field(default_factory=Scenario)
    agent_ids: list[str] = Field(default_factory=list)


class WorldResponse(Timestamped):
    """World 的 API 响应"""
    id: str  # 显式声明，解决 Pyright 继承解析问题
    created_at: str  # 显式声明，解决 Pyright 继承解析问题
    name: str
    scenario: Scenario
    agent_ids: list[str]
    current_tick: int = Field(default=0)
    status: str = Field(default="idle", description="idle | running | paused | finished")
