"""
场景状态 API — Agent 精灵的读写端点。

路由:
    GET  /api/scenes/{scene_id}/state    获取场景当前 Agent 状态
    POST /api/scenes/{scene_id}/state    全量替换场景 Agent 状态
    POST /api/scenes/{scene_id}/agents   添加/更新单个 Agent
    DELETE /api/scenes/{scene_id}/agents/{agent_id}  移除单个 Agent
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from engines.scene.engine import scene_engine, AgentSpriteData

router = APIRouter(prefix="/api/scenes", tags=["scenes"])


# ── Schema ──────────────────────────────────────────────

class AgentSpriteSchema(BaseModel):
    agentId: str
    name: str
    emoji: str
    color: str
    tileX: int
    tileY: int
    action: str = "idle"
    emotion: str = "neutral"


class SceneStateResponse(BaseModel):
    sceneId: str
    agents: list[AgentSpriteSchema]


# ── 助手 ────────────────────────────────────────────────

def _to_data(schema: AgentSpriteSchema) -> AgentSpriteData:
    return AgentSpriteData(
        agentId=schema.agentId,
        name=schema.name,
        emoji=schema.emoji,
        color=schema.color,
        tileX=schema.tileX,
        tileY=schema.tileY,
        action=schema.action,
        emotion=schema.emotion,
    )


def _to_schema(data: AgentSpriteData) -> AgentSpriteSchema:
    return AgentSpriteSchema(
        agentId=data.agentId,
        name=data.name,
        emoji=data.emoji,
        color=data.color,
        tileX=data.tileX,
        tileY=data.tileY,
        action=data.action,
        emotion=data.emotion,
    )


# ── 端点 ────────────────────────────────────────────────

@router.get("/{scene_id}/state", response_model=SceneStateResponse)
async def get_scene_state(scene_id: str):
    """获取场景当前 Agent 状态"""
    agents = scene_engine.get_state(scene_id)
    return SceneStateResponse(
        sceneId=scene_id,
        agents=[_to_schema(a) for a in agents],
    )


@router.post("/{scene_id}/state", response_model=SceneStateResponse)
async def update_scene_state(scene_id: str, body: list[AgentSpriteSchema]):
    """全量替换场景 Agent 状态（前端投放/切换场景时调用）"""
    agents_data = [_to_data(a) for a in body]
    result = scene_engine.update_state(scene_id, agents_data)
    return SceneStateResponse(
        sceneId=scene_id,
        agents=[_to_schema(a) for a in result],
    )


@router.post("/{scene_id}/agents", response_model=SceneStateResponse)
async def add_scene_agent(scene_id: str, body: AgentSpriteSchema):
    """添加/更新单个 Agent"""
    result = scene_engine.add_agent(scene_id, _to_data(body))
    return SceneStateResponse(
        sceneId=scene_id,
        agents=[_to_schema(a) for a in result],
    )


@router.delete("/{scene_id}/agents/{agent_id}", response_model=SceneStateResponse)
async def remove_scene_agent(scene_id: str, agent_id: str):
    """移除单个 Agent"""
    result = scene_engine.remove_agent(scene_id, agent_id)
    return SceneStateResponse(
        sceneId=scene_id,
        agents=[_to_schema(a) for a in result],
    )
