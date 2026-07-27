"""
Plan ORM — 任务计划持久化。
Step 52: Team 执行时创建 Plan，tick 间更新进度，重启可恢复。
"""

from datetime import datetime, timezone
import json

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class PlanRow(Base):
    """plans 表——一个 Team 同时只有一个活跃 Plan。"""

    __tablename__ = "plans"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    team_id: Mapped[str] = mapped_column(String, index=True, nullable=False)
    task: Mapped[str] = mapped_column(Text, default="")
    steps: Mapped[str] = mapped_column(Text, default="[]")  # JSON array of PlanStep
    status: Mapped[str] = mapped_column(String, default="executing")  # executing | paused | finished
    world_id: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    report: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)  # JSON: {title, content}
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    @classmethod
    def from_decomposition(cls, plan_id: str, team_id: str, task: str,
                           steps: list[dict]) -> "PlanRow":
        return cls(
            id=plan_id,
            team_id=team_id,
            task=task,
            steps=json.dumps(steps, ensure_ascii=False),
        )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "team_id": self.team_id,
            "task": self.task,
            "steps": json.loads(self.steps),
            "status": self.status,
            "world_id": self.world_id,
            "created_at": self.created_at,
            "report": json.loads(self.report) if self.report else None,
        }
