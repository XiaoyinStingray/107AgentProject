"""
竞技场 API 路由 — ArenaEngine 的 REST 端点。

路由:
    POST /api/arenas/debate    运行一场 1v1 辩论
    GET  /api/arenas/{id}      获取竞技结果
    GET  /api/arenas           列出竞技历史
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from pydantic import BaseModel

from api.agents import get_agent_store, AgentStore
from engines.arena.engine import ArenaEngine, ArenaMode, ArenaResult

router = APIRouter(prefix="/api/arenas", tags=["arenas"])


# =============================================================================
# 请求/响应体
# =============================================================================


class ArenaCreateRequest(BaseModel):
    mode: str = "debate"  # "debate" | "interview" | "pitch"
    agent_a_id: str
    agent_b_id: str
    topic: str
    rounds: int = 3


class ArenaResultResponse(BaseModel):
    id: str
    mode: str
    winner_id: str
    scores: dict[str, float]
    judge_reasoning: str
    transcript: list[dict]
    topic: str
    rounds: int
    created_at: str


# =============================================================================
# ArenaEngine 单例 + 结果存储
# =============================================================================

_arena_engine: ArenaEngine | None = None
_results: dict[str, ArenaResult] = {}


def get_arena_engine() -> ArenaEngine:
    global _arena_engine
    if _arena_engine is None:
        from llm.client import create_model_client

        _arena_engine = ArenaEngine(create_model_client())
    return _arena_engine


# =============================================================================
# 路由
# =============================================================================


@router.post("/debate", response_model=ArenaResultResponse, status_code=201)
async def run_debate(
    req: ArenaCreateRequest,
    store: AgentStore = Depends(get_agent_store),
    engine: ArenaEngine = Depends(get_arena_engine),
):
    """运行一场 1v1 辩论——两个 Agent 轮转发言，LLM 裁判独立评分。"""

    # 取 Agent 实例
    agent_a = store.get(req.agent_a_id)
    if agent_a is None:
        raise HTTPException(status_code=404, detail=f"Agent not found: {req.agent_a_id}")
    agent_b = store.get(req.agent_b_id)
    if agent_b is None:
        raise HTTPException(status_code=404, detail=f"Agent not found: {req.agent_b_id}")

    try:
        result = await engine.run_debate(agent_a, agent_b, req.topic, req.rounds)
    except Exception as e:
        logger.exception("Arena debate failed")
        raise HTTPException(status_code=500, detail=f"竞技运行失败: {str(e)}")

    # 存结果
    result_id = str(uuid.uuid4())
    result.created_at = datetime.now(timezone.utc).isoformat()
    _results[result_id] = result

    return ArenaResultResponse(
        id=result_id,
        mode=result.mode.value,
        winner_id=result.winner_id,
        scores=result.scores,
        judge_reasoning=result.judge_reasoning,
        transcript=result.transcript,
        topic=result.topic,
        rounds=result.rounds,
        created_at=result.created_at,
    )


@router.get("/{arena_id}", response_model=ArenaResultResponse)
async def get_arena_result(arena_id: str):
    """获取竞技结果。"""
    result = _results.get(arena_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Arena result not found: {arena_id}")
    return ArenaResultResponse(
        id=arena_id,
        mode=result.mode.value,
        winner_id=result.winner_id,
        scores=result.scores,
        judge_reasoning=result.judge_reasoning,
        transcript=result.transcript,
        topic=result.topic,
        rounds=result.rounds,
        created_at=result.created_at,
    )


@router.get("/", response_model=list[ArenaResultResponse])
async def list_arenas():
    """列出所有竞技记录。"""
    return [
        ArenaResultResponse(
            id=rid,
            mode=r.mode.value,
            winner_id=r.winner_id,
            scores=r.scores,
            judge_reasoning=r.judge_reasoning,
            transcript=r.transcript,
            topic=r.topic,
            rounds=r.rounds,
            created_at=r.created_at,
        )
        for rid, r in _results.items()
    ]
