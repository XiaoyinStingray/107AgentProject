"""Agent Remix 请求、草稿与响应模型。"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

from models.agent import AgentResponse, Background, Goal, Persona


RemixAction = Literal["preview", "create"]
RemixStatus = Literal["preview", "created"]
RemixField = Literal[
    "name",
    "mbti",
    "big_five",
    "values",
    "decision_style",
    "narrative",
    "background",
    "goals",
]


class BigFivePatch(BaseModel):
    """只携带用户实际调整过的大五人格目标值。"""

    openness: float | None = Field(default=None, ge=0, le=1)
    conscientiousness: float | None = Field(default=None, ge=0, le=1)
    extraversion: float | None = Field(default=None, ge=0, le=1)
    agreeableness: float | None = Field(default=None, ge=0, le=1)
    neuroticism: float | None = Field(default=None, ge=0, le=1)

    def values_to_apply(self) -> dict[str, float]:
        """返回非空目标值，供后端强制覆盖 LLM 输出。"""
        return self.model_dump(exclude_none=True)


class RemixSpec(BaseModel):
    """用户对 Remix 的修改要求与硬约束。"""

    instruction: str = Field(default="", max_length=500)
    trait_targets: BigFivePatch = Field(default_factory=BigFivePatch)
    preserve_fields: list[RemixField] = Field(
        default_factory=lambda: ["name", "background", "goals"],
    )

    @model_validator(mode="after")
    def validate_spec(self) -> "RemixSpec":
        self.instruction = self.instruction.strip()
        self.preserve_fields = list(dict.fromkeys(self.preserve_fields))
        if not self.instruction and not self.trait_targets.values_to_apply():
            raise ValueError("instruction 和 trait_targets 至少提供一项")
        if (
            "big_five" in self.preserve_fields
            and self.trait_targets.values_to_apply()
        ):
            raise ValueError("保护 big_five 时不能同时提交 trait_targets")
        return self


class RemixDraft(BaseModel):
    """尚未持久化的静态 Agent 设定。"""

    persona: Persona
    background: Background
    goals: list[Goal] = Field(default_factory=list)


class RemixChange(BaseModel):
    """后端根据源 Agent 和最终草稿计算的字段差异。"""

    field: str
    before: str
    after: str


class RemixRequest(BaseModel):
    """同一端点支持预览和确认创建两个动作。"""

    action: RemixAction = "preview"
    spec: RemixSpec
    draft: RemixDraft | None = None

    @model_validator(mode="after")
    def validate_action_payload(self) -> "RemixRequest":
        if self.action == "preview" and self.draft is not None:
            raise ValueError("preview 请求不能携带 draft")
        if self.action == "create" and self.draft is None:
            raise ValueError("create 请求必须携带 preview 返回的 draft")
        return self


class RemixResponse(BaseModel):
    """Remix 预览或创建结果。"""

    status: RemixStatus
    source_agent_id: str
    spec: RemixSpec
    draft: RemixDraft
    changes: list[RemixChange] = Field(default_factory=list)
    summary: str = ""
    agent: AgentResponse | None = None
