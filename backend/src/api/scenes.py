"""
场景状态 API — Agent 精灵的读写端点。

路由:
    GET  /api/scenes/{scene_id}/state    获取场景当前 Agent 状态
    POST /api/scenes/{scene_id}/state    全量替换场景 Agent 状态
    POST /api/scenes/{scene_id}/agents   添加/更新单个 Agent
    DELETE /api/scenes/{scene_id}/agents/{agent_id}  移除单个 Agent
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from engines.scene.engine import scene_engine, AgentSpriteData
from models.checkpoint_orm import CheckpointRow
from db import get_db

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


# ── 存档（Step 65 Checkpoint）──

class CheckpointCreate(BaseModel):
    name: str = ""
    agents: list[AgentSpriteSchema] = []


class CheckpointResponse(BaseModel):
    id: str
    scene_id: str
    name: str
    agents: list[AgentSpriteSchema]
    created_at: str

    class Config:
        from_attributes = True


@router.get("/{scene_id}/checkpoints", response_model=list[CheckpointResponse])
async def list_checkpoints(scene_id: str, db: AsyncSession = Depends(get_db)):
    """列出某场景的所有存档"""
    rows = await CheckpointRow.list_by_scene(db, scene_id)
    result = []
    for r in rows:
        import json
        agents_raw = json.loads(r.agents_json) if r.agents_json else []
        result.append(CheckpointResponse(
            id=r.id, scene_id=r.scene_id, name=r.name,
            agents=[AgentSpriteSchema(**a) for a in agents_raw],
            created_at=r.created_at.isoformat() if r.created_at else "",
        ))
    return result


@router.post("/{scene_id}/checkpoints", response_model=CheckpointResponse)
async def create_checkpoint(scene_id: str, body: CheckpointCreate, db: AsyncSession = Depends(get_db)):
    """创建存档（上限 30）"""
    count = await CheckpointRow.count_by_scene(db, scene_id)
    if count >= CheckpointRow.MAX_PER_SCENE:
        raise HTTPException(400, f"存档已达上限（{CheckpointRow.MAX_PER_SCENE}）")
    import json
    import uuid
    from datetime import datetime, timezone
    agents_json = json.dumps([a.model_dump() for a in body.agents], ensure_ascii=False)
    now = datetime.now(timezone.utc)
    row = CheckpointRow(
        id=str(uuid.uuid4()), scene_id=scene_id, name=body.name,
        agents_json=agents_json, created_at=now,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return CheckpointResponse(
        id=row.id, scene_id=row.scene_id, name=row.name,
        agents=[AgentSpriteSchema(**a) for a in (json.loads(row.agents_json) if row.agents_json else [])],
        created_at=row.created_at.isoformat() if row.created_at else "",
    )


@router.delete("/{scene_id}/checkpoints/{checkpoint_id}")
async def delete_checkpoint(scene_id: str, checkpoint_id: str, db: AsyncSession = Depends(get_db)):
    """删除存档"""
    ok = await CheckpointRow.delete_by_id(db, checkpoint_id)
    if not ok:
        raise HTTPException(404, "存档不存在")
    return {"ok": True}
