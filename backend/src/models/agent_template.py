"""只读 Agent 模板模型。"""

from pydantic import BaseModel, Field


class AgentTemplate(BaseModel):
    """用于驱动现有 Agent 创建链路的描述种子。"""

    id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1)
    category: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    seed_prompt: str = Field(..., min_length=3)
    tags: list[str] = Field(default_factory=list)
