"""只读 Agent 模板 JSON 加载器。"""

import json
from functools import lru_cache
from pathlib import Path

from models.agent_template import AgentTemplate


_TEMPLATE_PATH = Path(__file__).resolve().parent / "data" / "agent_templates.json"


@lru_cache(maxsize=1)
def load_agent_templates() -> tuple[AgentTemplate, ...]:
    """读取并验证静态模板；缓存不可变结果避免重复 IO。"""
    with _TEMPLATE_PATH.open("r", encoding="utf-8") as file:
        raw_templates = json.load(file)

    templates = tuple(AgentTemplate.model_validate(item) for item in raw_templates)
    ids = [template.id for template in templates]
    if len(templates) < 30:
        raise ValueError("Agent 模板数量必须至少为 30")
    if len(ids) != len(set(ids)):
        raise ValueError("Agent 模板 ID 必须唯一")
    return templates
