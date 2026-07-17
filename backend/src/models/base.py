"""
共享基类 — 所有模型共用的 id 和时间戳字段
"""

from pydantic import BaseModel


class HasId(BaseModel):
    """有 id 的实体基类"""
    id: str


class Timestamped(HasId):
    """有 id + created_at 的实体基类（不可变时间戳）"""
    created_at: str


class MutableTimestamped(Timestamped):
    """有 id + created_at + updated_at 的实体基类"""
    updated_at: str
