"""竞技记录 ORM — 保存完整结果，供战报和复盘查询使用。"""

import json

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db import Base
from models.arena import ArenaMode, ArenaResult, ArenaTranscriptEntry


class ArenaRow(Base):
    """arenas 表——持久化 1v1 与大乱斗的完整竞技结果。"""

    __tablename__ = "arenas"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    mode: Mapped[str] = mapped_column(String)
    agent_a_id: Mapped[str | None] = mapped_column(String, nullable=True)
    agent_b_id: Mapped[str | None] = mapped_column(String, nullable=True)
    participant_ids_json: Mapped[str] = mapped_column(String, default="[]")
    participant_names_json: Mapped[str] = mapped_column(String, default="{}")
    winner_id: Mapped[str] = mapped_column(String, default="")
    scores_json: Mapped[str] = mapped_column(String, default="{}")
    score_breakdown_json: Mapped[str] = mapped_column(String, default="{}")
    transcript_json: Mapped[str] = mapped_column(String, default="[]")
    judge_reasoning: Mapped[str] = mapped_column(String, default="")
    topic: Mapped[str] = mapped_column(String, default="")
    rounds: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[str] = mapped_column(String)

    @classmethod
    def from_result(cls, arena_id: str, result: ArenaResult) -> "ArenaRow":
        """把完整领域结果序列化为数据库行。"""
        participants = result.participant_ids
        return cls(
            id=arena_id,
            mode=result.mode.value,
            agent_a_id=participants[0] if len(participants) >= 1 else None,
            agent_b_id=participants[1] if len(participants) >= 2 else None,
            participant_ids_json=json.dumps(participants, ensure_ascii=False),
            participant_names_json=json.dumps(
                result.participant_names,
                ensure_ascii=False,
            ),
            winner_id=result.winner_id,
            scores_json=json.dumps(result.scores, ensure_ascii=False),
            score_breakdown_json=json.dumps(
                result.score_breakdown,
                ensure_ascii=False,
            ),
            transcript_json=json.dumps(
                [entry.model_dump() for entry in result.transcript],
                ensure_ascii=False,
            ),
            judge_reasoning=result.judge_reasoning,
            topic=result.topic,
            rounds=result.rounds,
            created_at=result.created_at,
        )

    def to_result(self) -> ArenaResult:
        """把数据库行还原为完整竞技结果。"""
        transcript_data = json.loads(self.transcript_json)
        return ArenaResult(
            winner_id=self.winner_id,
            scores=json.loads(self.scores_json),
            score_breakdown=json.loads(self.score_breakdown_json),
            judge_reasoning=self.judge_reasoning,
            transcript=[
                ArenaTranscriptEntry.model_validate(entry)
                for entry in transcript_data
            ],
            mode=ArenaMode(self.mode),
            topic=self.topic,
            rounds=self.rounds,
            participant_ids=json.loads(self.participant_ids_json),
            participant_names=json.loads(self.participant_names_json),
            created_at=self.created_at,
        )
