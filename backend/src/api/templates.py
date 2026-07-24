"""Agent 模板库 API。"""

from fastapi import APIRouter

from engines.persona.template_library import load_agent_templates
from models.agent_template import AgentTemplate


router = APIRouter(prefix="/api/templates", tags=["agent-templates"])


@router.get("", response_model=list[AgentTemplate])
async def list_agent_templates():
    """返回只读的 Agent 描述种子模板。"""
    return list(load_agent_templates())
