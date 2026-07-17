"""
Memory 数据模型 — Agent 记忆存储
"""

from pydantic import BaseModel, Field


class MemoryCreate(BaseModel):
    """创建记忆"""
    agent_id: str
    type: str = Field(default="episodic", description="episodic | semantic")
    content: str = Field(..., min_length=1)
    importance: float = Field(default=0.5, ge=0, le=1)


class MemoryResponse(BaseModel):
    """记忆响应"""
    id: str
    agent_id: str
    type: str
    content: str
    importance: float
    keywords: str = Field(default="")
    created_at: str
