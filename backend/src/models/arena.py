"""竞技场请求、领域结果与 API 响应类型。"""

from datetime import datetime, timezone
from enum import Enum

from pydantic import BaseModel, Field, field_validator, model_validator


MIN_BATTLE_ROYALE_AGENTS = 6
MAX_BATTLE_ROYALE_AGENTS = 8
MAX_ARENA_RESPONSE_CONTENT = 2000


class ArenaMode(str, Enum):
    """竞技场支持的比赛模式。"""

    DEBATE = "debate"
    INTERVIEW = "interview"
    PITCH = "pitch"
    BATTLE_ROYALE = "battle_royale"


class ArenaTranscriptEntry(BaseModel):
    """一条带有明确发言者身份的竞技记录。"""

    turn: int = Field(ge=0)
    round: int = Field(ge=1)
    speaker_id: str
    speaker: str
    content: str
    stage_score: float | None = Field(default=None, ge=4, le=40)
    stage_rank: int | None = Field(default=None, ge=1)
    advanced: bool | None = None


class ArenaCreateRequest(BaseModel):
    """创建一场 1v1 竞技所需的请求数据。"""

    mode: ArenaMode = ArenaMode.DEBATE
    agent_a_id: str = Field(min_length=1)
    agent_b_id: str = Field(min_length=1)
    topic: str = Field(min_length=1, max_length=500)
    rounds: int = Field(default=3, ge=1, le=5)

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, value: str) -> str:
        """拒绝只包含空白字符的竞技主题。"""
        topic = value.strip()
        if not topic:
            raise ValueError("竞技主题不能为空")
        return topic

    @model_validator(mode="after")
    def validate_duel(self) -> "ArenaCreateRequest":
        """确保 1v1 请求使用不同 Agent 和双人竞技模式。"""
        if self.agent_a_id == self.agent_b_id:
            raise ValueError("1v1 竞技必须选择两个不同的 Agent")
        if self.mode == ArenaMode.BATTLE_ROYALE:
            raise ValueError("大乱斗请使用 battle_royale 端点")
        return self


class BattleRoyaleRequest(BaseModel):
    """创建一场 6–8 人自由淘汰赛所需的请求数据。"""

    agent_ids: list[str] = Field(
        min_length=MIN_BATTLE_ROYALE_AGENTS,
        max_length=MAX_BATTLE_ROYALE_AGENTS,
    )
    topic: str = Field(min_length=1, max_length=500)

    @field_validator("agent_ids")
    @classmethod
    def validate_agent_ids(cls, value: list[str]) -> list[str]:
        """拒绝空 ID 和重复参赛者。"""
        cleaned = [agent_id.strip() for agent_id in value]
        if any(not agent_id for agent_id in cleaned):
            raise ValueError("Agent ID 不能为空")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("大乱斗不能重复选择同一个 Agent")
        return cleaned

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, value: str) -> str:
        """拒绝只包含空白字符的大乱斗主题。"""
        topic = value.strip()
        if not topic:
            raise ValueError("竞技主题不能为空")
        return topic


class ArenaResult(BaseModel):
    """引擎生成并完整保存的竞技结果。"""

    winner_id: str
    scores: dict[str, float]
    score_breakdown: dict[str, dict[str, float]] = Field(default_factory=dict)
    judge_reasoning: str = ""
    transcript: list[ArenaTranscriptEntry] = Field(default_factory=list)
    mode: ArenaMode = ArenaMode.DEBATE
    topic: str = ""
    rounds: int = Field(default=3, ge=1)
    participant_ids: list[str] = Field(default_factory=list)
    participant_names: dict[str, str] = Field(default_factory=dict)
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class ArenaResultResponse(BaseModel):
    """返回给前端的竞技结果，保留既有字段并补充参赛者快照。"""

    id: str
    mode: ArenaMode
    winner_id: str
    scores: dict[str, float]
    score_breakdown: dict[str, dict[str, float]]
    judge_reasoning: str
    transcript: list[ArenaTranscriptEntry]
    topic: str
    rounds: int
    participant_ids: list[str]
    participant_names: dict[str, str]
    created_at: str

    @classmethod
    def from_result(
        cls,
        arena_id: str,
        result: ArenaResult,
    ) -> "ArenaResultResponse":
        """从完整结果创建限制单条发言长度的 API 响应。"""
        transcript = [
            entry.model_copy(
                update={"content": entry.content[:MAX_ARENA_RESPONSE_CONTENT]}
            )
            for entry in result.transcript
        ]
        return cls(
            id=arena_id,
            mode=result.mode,
            winner_id=result.winner_id,
            scores=result.scores,
            score_breakdown=result.score_breakdown,
            judge_reasoning=result.judge_reasoning,
            transcript=transcript,
            topic=result.topic,
            rounds=result.rounds,
            participant_ids=result.participant_ids,
            participant_names=result.participant_names,
            created_at=result.created_at,
        )


class ArenaReportResponse(BaseModel):
    """结构化 Markdown 战报响应。"""

    arena_id: str
    title: str
    markdown: str
