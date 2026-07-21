"""
叙事 API 路由 — NarrativeEngine 的 REST 端点。

路由:
    POST /api/narratives/story   生成第一人称短篇小说
    POST /api/narratives/diary   生成 Agent 日记
    POST /api/narratives/letter  生成未来的信
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from api.agents import get_agent_store, AgentStore
from db import async_session
from engines.narrative.engine import NarrativeEngine, NarrativeRequest, NarrativeStyle
from models.event import Event

router = APIRouter(prefix="/api/narratives", tags=["narratives"])


# =============================================================================
# 请求/响应体
# =============================================================================


class NarrativeGenRequest(BaseModel):
    """叙事生成请求——前端最小输入。"""
    agent_id: str
    world_id: str
    target: str | None = None  # letter 收信人 / podcast 主题


class NarrativeGenResponse(BaseModel):
    """叙事生成结果。"""
    title: str
    content: str
    style: str
    agent_id: str
    generated_at: str


# =============================================================================
# NarrativeEngine 单例
# =============================================================================

_narrative_engine: NarrativeEngine | None = None


def get_narrative_engine() -> NarrativeEngine:
    """NarrativeEngine module-level singleton。"""
    global _narrative_engine
    if _narrative_engine is None:
        from llm.client import create_model_client
        _narrative_engine = NarrativeEngine(create_model_client())
    return _narrative_engine


# =============================================================================
# 通用处理函数
# =============================================================================


async def _generate_narrative(
    style: NarrativeStyle,
    req: NarrativeGenRequest,
    store: AgentStore,
    engine: NarrativeEngine,
) -> NarrativeGenResponse:
    """通用叙事生成逻辑——三种端点共用。"""

    # 1. 取 Agent persona
    agent = store.get(req.agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail=f"Agent not found: {req.agent_id}")

    # 2. 取 World 事件（从 SQLite events 表）
    async with async_session() as session:
        stmt = (
            select(Event)
            .where(Event.world_id == req.world_id)
            .order_by(Event.tick, Event.created_at)
        )
        result = await session.execute(stmt)
        orm_events = result.scalars().all()

    sim_events = [e.to_response() for e in orm_events]

    # 3. 调 NarrativeEngine
    narrative_req = NarrativeRequest(
        style=style,
        agent_id=req.agent_id,
        events=sim_events,
        persona=agent.persona,
        target=req.target,
    )
    result = await engine.generate(narrative_req)

    # 4. 返回
    return NarrativeGenResponse(
        title=result.title,
        content=result.content,
        style=result.style.value,
        agent_id=result.agent_id,
        generated_at=result.generated_at,
    )


# =============================================================================
# 路由
# =============================================================================


@router.post("/story", response_model=NarrativeGenResponse)
async def generate_story(
    req: NarrativeGenRequest,
    store: AgentStore = Depends(get_agent_store),
    engine: NarrativeEngine = Depends(get_narrative_engine),
):
    """生成第一人称短篇小说（800-1500 字）。"""
    try:
        return await _generate_narrative(NarrativeStyle.STORY, req, store, engine)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"叙事生成失败: {str(e)}")


@router.post("/diary", response_model=NarrativeGenResponse)
async def generate_diary(
    req: NarrativeGenRequest,
    store: AgentStore = Depends(get_agent_store),
    engine: NarrativeEngine = Depends(get_narrative_engine),
):
    """生成 Agent 日记（300-500 字）。"""
    try:
        return await _generate_narrative(NarrativeStyle.DIARY, req, store, engine)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"叙事生成失败: {str(e)}")


@router.post("/letter", response_model=NarrativeGenResponse)
async def generate_letter(
    req: NarrativeGenRequest,
    store: AgentStore = Depends(get_agent_store),
    engine: NarrativeEngine = Depends(get_narrative_engine),
):
    """生成未来的信。"""
    try:
        return await _generate_narrative(NarrativeStyle.LETTER, req, store, engine)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"叙事生成失败: {str(e)}")
