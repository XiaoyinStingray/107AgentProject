"""
Agent 数据模型 — 人格、背景、目标、情绪状态
"""

from pydantic import BaseModel, Field
from typing import Optional

from .base import HasId, MutableTimestamped


# ========== 人格结构 ==========

class BigFive(BaseModel):
    """大五人格 (0-1)"""
    openness: float = Field(default=0.5, ge=0, le=1, description="开放性")
    conscientiousness: float = Field(default=0.5, ge=0, le=1, description="尽责性")
    extraversion: float = Field(default=0.5, ge=0, le=1, description="外向性")
    agreeableness: float = Field(default=0.5, ge=0, le=1, description="宜人性")
    neuroticism: float = Field(default=0.5, ge=0, le=1, description="神经质")


class DecisionStyle(BaseModel):
    """决策风格"""
    info_processing: str = Field(default="balanced", description="intuitive | analytical | balanced")
    risk_preference: str = Field(default="moderate", description="averse | moderate | seeking")
    social_tendency: str = Field(default="cooperative", description="competitive | cooperative | independent")
    stress_response: str = Field(default="adaptive", description="avoidant | reactive | adaptive | resilient")


class Persona(BaseModel):
    """Agent 人格定义"""
    name: str = Field(default="", description="LLM 生成的 2-3 字中文名")
    mbti: str = Field(default="INTJ-T")
    big_five: BigFive = Field(default_factory=BigFive)
    values: list[str] = Field(default_factory=list, description='e.g. ["成就", "自由", "安全"]')
    decision_style: DecisionStyle = Field(default_factory=DecisionStyle)
    narrative: str = Field(default="", description="200-400 字人格画像（LLM 生成）")


class Background(BaseModel):
    """背景故事"""
    hometown: str = Field(default="")
    family: str = Field(default="")
    education: str = Field(default="")
    key_events: list[str] = Field(default_factory=list)


class Goal(HasId):
    """层级化目标"""
    description: str
    priority: int = Field(default=1, description="1=最高")
    deadline: Optional[str] = Field(default=None, description="ISO datetime")
    status: str = Field(default="active", description="active | achieved | abandoned")


# ========== 情绪状态 ==========

class EmotionalState(BaseModel):
    """情绪状态 (VAD 模型)"""
    valence: float = Field(default=0.5, ge=0, le=1, description="愉悦度")
    arousal: float = Field(default=0.5, ge=0, le=1, description="唤醒度")
    dominance: float = Field(default=0.5, ge=0, le=1, description="支配感")
    label: str = Field(default="neutral", description="happy | sad | angry | anxious | excited | neutral")


# ========== API 请求/响应模型 ==========

class AgentCreate(BaseModel):
    """创建 Agent 的请求体"""
    description: str = Field(..., min_length=3, description="自然语言描述")


class AgentResponse(MutableTimestamped):
    """Agent 的 API 响应"""
    name: str
    persona: Persona
    background: Background
    goals: list[Goal] = Field(default_factory=list)
    emotional_state: EmotionalState = Field(default_factory=EmotionalState)
    energy: float = Field(default=100.0)
