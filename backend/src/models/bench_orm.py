"""
Bench ORM — LLM 评测记录持久化。
Step 58: 标准化套件评测，六维评分 + 分析报告。
"""

from datetime import datetime, timezone
import json

from sqlalchemy import String, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class BenchRun(Base):
    """bench_runs 表——一次评测会话。"""

    __tablename__ = "bench_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    llm_api_key: Mapped[str] = mapped_column(String, default="")
    llm_base_url: Mapped[str] = mapped_column(String, default="")
    llm_model: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="running")
    total_tasks: Mapped[int] = mapped_column(Integer, default=27)
    completed_tasks: Mapped[int] = mapped_column(Integer, default=0)
    scores_json: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    report: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "llm_model": self.llm_model,
            "status": self.status,
            "total_tasks": self.total_tasks,
            "completed_tasks": self.completed_tasks,
            "scores": json.loads(self.scores_json) if self.scores_json else None,
            "report": self.report,
            "created_at": self.created_at,
        }


class BenchResult(Base):
    """bench_results 表——单条评测记录（一个 Agent × 一个场景 × 一次重复）。"""

    __tablename__ = "bench_results"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    run_id: Mapped[str] = mapped_column(String, index=True)
    agent_template: Mapped[str] = mapped_column(String, default="")
    scenario: Mapped[str] = mapped_column(String, default="")
    repeat_index: Mapped[int] = mapped_column(Integer, default=0)
    events_json: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    scores_json: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    status: Mapped[str] = mapped_column(String, default="done")
    error: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "run_id": self.run_id,
            "agent_template": self.agent_template,
            "scenario": self.scenario,
            "repeat_index": self.repeat_index,
            "scores": json.loads(self.scores_json) if self.scores_json else None,
            "status": self.status,
            "error": self.error,
            "created_at": self.created_at,
        }


class BenchTemplate(Base):
    """bench_templates 表——自定义评测套件模板（Step 69）。"""

    __tablename__ = "bench_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    agents_json: Mapped[str] = mapped_column(Text, default="[]")      # [{id, name, mbti, ...}]
    scenarios_json: Mapped[str] = mapped_column(Text, default="[]")   # [{name, description, ...}]
    repeats: Mapped[int] = mapped_column(Integer, default=3)
    created_at: Mapped[str] = mapped_column(
        String, default=lambda: datetime.now(timezone.utc).isoformat()
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "agents": json.loads(self.agents_json) if self.agents_json else [],
            "scenarios": json.loads(self.scenarios_json) if self.scenarios_json else [],
            "repeats": self.repeats,
            "created_at": self.created_at,
        }
