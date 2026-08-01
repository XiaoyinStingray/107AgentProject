"""
场景状态 API — Agent 精灵的读写端点。

路由:
    GET  /api/scenes/{scene_id}/state    获取场景当前 Agent 状态
    POST /api/scenes/{scene_id}/state    全量替换场景 Agent 状态
    POST /api/scenes/{scene_id}/agents   添加/更新单个 Agent
    DELETE /api/scenes/{scene_id}/agents/{agent_id}  移除单个 Agent
"""

import json as _json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

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
    emotion: str = "neutral"  # 66-S: 说话方的当前情绪


class InteractResponse(BaseModel):
    from_agent: str
    to_agent: str
    message: str
    emotion: Optional[str] = None  # 66-S: 生成的对话触发的情绪
    source: str = "mock"           # "llm" | "mock"

    class Config:
        populate_by_name = True


@router.post("/{scene_id}/interact", response_model=InteractResponse)
async def scene_interact(scene_id: str, body: InteractRequest):
    """
    Agent 间互动端点（66-S 升级：LLM优先 + mock兜底）。
    返回一句符合性格×场景的对话，附情绪检测结果。
    """
    logger.info(f"[api] POST /scenes/{scene_id}/interact from={body.from_agent} to={body.to_agent}")
    result = await scene_engine.generate_dialogue(
        from_name=body.from_agent,
        to_name=body.to_agent,
        scene_id=body.scene,
        message=body.message,
        emotion=body.emotion,
    )
    logger.info(f"[api] result source={result.get('source','?')}: {result['message'][:40]}...")
    return InteractResponse(
        from_agent=body.from_agent,
        to_agent=body.to_agent,
        message=result["message"],
        emotion=result.get("emotion"),
        source=result.get("source", "mock"),
    )


# ── Step 98: 主动搭话话题生成 ──

class ProactiveTopicRequest(BaseModel):
    agent_name: str
    scene: str


class ProactiveTopicResponse(BaseModel):
    topic: str
    source: str = "mock"  # "llm" | "mock"


@router.post("/{scene_id}/proactive-topic", response_model=ProactiveTopicResponse)
async def generate_proactive_topic(scene_id: str, body: ProactiveTopicRequest):
    """
    Step 98: 为 Agent 主动搭话生成话题。
    LLM 优先，mock 兜底（返回 null 由前端用预设池）。
    """
    # 预设兜底话题池（按场景）
    FALLBACK_TOPICS = {
        "library": [
            "你在看什么书？封面好有意思",
            "好安静啊——你是来复习的吗？",
            "你有没有想过…如果每一本书都是一个世界？",
            "这个角落的光线刚刚好。",
            "这里的 WiFi 密码是多少来着？",
        ],
        "dorm": [
            "外卖到了！你点了什么？",
            "今晚打游戏吗？三缺一！",
            "好像要下雨了…你有没有闻到雨的味道？",
            "你昨天晚上说梦话了。",
            "窗外的鸟好吵——不过也挺好听的。",
        ],
        "classroom": [
            "这课好无聊啊…你觉得呢？",
            "下课去食堂吗？一起？",
            "你有没有想过…如果考试突然取消会怎样？",
            "老师刚才说的那个你听懂了吗？",
            "笔记借我抄抄呗～",
        ],
        "art": [
            "天哪这里好棒！你经常来吗？",
            "钢琴声好好听，你知道是什么曲子吗？",
            "这里的氛围好适合发呆…",
            "颜色好像在说话——你感觉到了吗？",
            "你有没有画过画？哪怕是随便涂两笔？",
        ],
        "lab": [
            "数据跑完了吗？我的还在跑…",
            "你发现了什么有意思的现象？",
            "你有没有想过…实验失败也是一种成功？",
            "试剂颜色好漂亮——虽然可能不太对。",
            "小心那个烧杯——不过它确实很好看。",
        ],
        "sakura": [
            "天哪好美！！快帮我拍照！",
            "我想在樱花树下野餐——一起吗？",
            "你有没有想过…花瓣最后会飘到哪里去？",
            "时间好像慢了。想在这里坐一整天。",
            "春天真的好短。不过正因如此才珍贵吧。",
        ],
    }

    scene_topics = FALLBACK_TOPICS.get(scene_id, FALLBACK_TOPICS["library"])
    import random
    topic = random.choice(scene_topics)

    # 尝试 LLM 生成
    try:
        from llm.client import create_model_client
        client = create_model_client()
        prompt = (
            f"你是{body.agent_name}，你在「{body.scene}」场景中。"
            f"用一句话主动跟一个路过的人搭话。"
            f"要自然、带点好奇、不要像客服、不要超过20个字。"
        )
        result = await client.create(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.9,
            max_tokens=60,
        )
        llm_topic = result.content.strip().strip("\"'")
        if llm_topic and len(llm_topic) > 2:
            logger.info(f"[proactive-topic] LLM: {llm_topic[:40]}")
            return ProactiveTopicResponse(topic=llm_topic, source="llm")
    except Exception as e:
        logger.warning(f"[proactive-topic] LLM failed, using mock: {e}")

    return ProactiveTopicResponse(topic=topic, source="mock")


# ── 66-S: 随机事件端点 ──

class RandomEventResponse(BaseModel):
    id: str
    text: str
    target: str
    emotion: str
    intensity: int


@router.get("/{scene_id}/random-event", response_model=Optional[RandomEventResponse])
async def get_random_event(scene_id: str):
    """获取场景随机事件（66-S）。前端定时轮询或 SSE 推送。"""
    event = scene_engine.get_random_event(scene_id)
    if event is None:
        return None
    return RandomEventResponse(
        id=event.id,
        text=event.text,
        target=event.target,
        emotion=event.emotion,
        intensity=event.intensity,
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
<<<<<<< Updated upstream
    ok = await CheckpointRow.delete_by_scene_and_id(
        db,
        scene_id,
        checkpoint_id,
    )
=======
    ok = await CheckpointRow.delete_by_id(db, checkpoint_id, scene_id)
>>>>>>> Stashed changes
    if not ok:
        raise HTTPException(404, "存档不存在")
    return {"ok": True}


# ── State 4 Step 81: 场景启动（创建 WorldEngine + 返回 world_id）──


class StartSceneRequest(BaseModel):
    agent_ids: list[str] = Field(..., min_length=1)


class StartSceneResponse(BaseModel):
    world_id: str
    scene_id: str
    status: str


@router.post("/{scene_id}/start", response_model=StartSceneResponse)
async def start_scene(scene_id: str, body: StartSceneRequest):
    """为场景创建 WorldEngine 并返回 world_id 供 SSE 连接。

    State 4 Step 81: 将 M11 场景从本地模拟切换为 WorldEngine 驱动。
    前端使用返回的 world_id 连接 /api/worlds/{world_id}/stream。
    """
    if scene_id not in ["library", "dorm", "classroom", "art", "lab", "sakura"]:
        raise HTTPException(400, f"未知场景: {scene_id}")

    from api.worlds import _rebuild_agents_from_db, _build_world_engine
    from api.sse import register_world
    from models.world import Scenario, WorldResponse
    from models.world_orm import WorldRow
    from models.scenario_orm import ScenarioRow
    from db import async_session
    from sqlalchemy import select
    import uuid

    # 1. 重建 Agent
    agents = await _rebuild_agents_from_db(body.agent_ids)

    # 2. 查找或创建场景 World
    async with async_session() as session:
        result = await session.execute(
            select(ScenarioRow).where(ScenarioRow.name == f"scene_{scene_id}")
        )
        scenario_row = result.scalar_one_or_none()

        scenario = (
            Scenario(**scenario_row.to_scenario())
            if scenario_row is not None
            else Scenario(
                name=f"scene_{scene_id}",
                description=f"M11 游戏化场景：{scene_id}",
                environment_params={"scene_id": scene_id},
            )
        )
        world_row = WorldRow(
            id=str(uuid.uuid4()),
            name=f"Scene: {scene_id}",
            scenario_json=_json.dumps(
                scenario.model_dump(),
                ensure_ascii=False,
            ),
            agent_ids_json=_json.dumps(body.agent_ids),
            world_type="scene",
            status="running",
        )
        session.add(world_row)
        await session.commit()
        world_data = WorldResponse(**world_row.to_dict())

    # 3. 构建 WorldEngine + 注入 SceneBridge
    engine = await _build_world_engine(world_data)
    engine.world.status = "running"

    # 注入 SceneBridge
    from engines.scene.engine import SceneBridge
    engine.scene_bridge = SceneBridge(scene_id, engine)
    engine.scene_bridge.sync_to_scene()

    # 4. 注册到 SSE
    register_world(world_data.id, engine)

    logger.info(f"Scene started: {scene_id} → world={world_data.id}, agents={len(agents)}")
    return StartSceneResponse(
        world_id=world_data.id,
        scene_id=scene_id,
        status="running",
    )



