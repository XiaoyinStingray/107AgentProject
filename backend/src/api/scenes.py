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


# ── 交互端点（Step 64c Mock → 66-S LLM）──

class InteractRequest(BaseModel):
    """Agent 间互动请求"""
    from_agent: str = Field(alias="from")
    to_agent: str = Field(alias="to")
    scene: str
    message: str = ""


class InteractResponse(BaseModel):
    from_agent: str
    to_agent: str
    message: str

    class Config:
        populate_by_name = True


@router.post("/{scene_id}/interact", response_model=InteractResponse)
async def scene_interact(scene_id: str, body: InteractRequest):
    """
    Agent 间互动端点（当前 Mock，66-S 切换 LLM）。
    返回一句符合性格×场景的对话。
    """
    mock_replies = {
        "library": "这里好安静…",
        "dorm": "外卖什么时候到？",
        "classroom": "这题你会吗？",
        "art": "你也在创作吗？",
        "lab": "数据跑完了吗？",
        "sakura": "花好美啊…",
    }
    return InteractResponse(
        from_agent=body.from_agent,
        to_agent=body.to_agent,
        message=mock_replies.get(body.scene, "嗯…"),
    )
