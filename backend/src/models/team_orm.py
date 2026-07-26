"""
Team ORM — Agent 团队持久化。
Step 51: Team CRUD + 角色推荐，为 Step 52 工作流引擎提供数据基础。
"""

from datetime import datetime, timezone
import json

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class TeamRow(Base):
    """teams 表——存储用户组建的 Agent 团队。

    agent_ids 存 JSON 数组，与 World 的 agent_ids_json 策略一致（多对多，不建关联表）。
    roles 存 JSON 数组 [{agent_id, role, reason}]，用户可覆盖 LLM 推荐。
    """

    __tablename__ = "teams"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    agent_ids: Mapped[str] = mapped_column(Text, default="[]")  # JSON array
    roles: Mapped[str] = mapped_column(Text, default="[]")       # JSON array of {agent_id, role, reason}
    status: Mapped[str] = mapped_column(String, default="idle")  # idle | executing | paused | finished
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    @classmethod
    def from_create(cls, team_id: str, name: str, description: str,
                    agent_ids: list[str], roles: list[dict]) -> "TeamRow":
        """工厂方法——从创建请求构造 ORM 行。"""
        return cls(
            id=team_id,
            name=name,
            description=description,
            agent_ids=json.dumps(agent_ids, ensure_ascii=False),
            roles=json.dumps(roles, ensure_ascii=False),
        )

    def to_dict(self) -> dict:
        """转为字典，供 API 响应使用。JSON 字段反序列化为 Python 对象。"""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "agent_ids": json.loads(self.agent_ids),
            "roles": json.loads(self.roles),
            "status": self.status,
            "created_at": self.created_at,
        }
