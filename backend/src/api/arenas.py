"""竞技场 REST API — 真实 LLM 执行、SQLite 历史与结构化战报。"""

import asyncio
import uuid
from collections.abc import Awaitable, Callable

from fastapi import APIRouter, Depends, HTTPException, Query
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.agents import _rebuild_agent_from_row
from db import get_db
from engines.arena.engine import ArenaEngine
from engines.arena.report import build_arena_report
from models.agent_orm import AgentRow
from models.arena import (
    ArenaCreateRequest,
    ArenaMode,
    ArenaReportResponse,
    ArenaResult,
    ArenaResultResponse,
    BattleRoyaleRequest,
)
from models.arena_orm import ArenaRow


router = APIRouter(prefix="/api/arenas", tags=["arenas"])
_arena_engine: ArenaEngine | None = None


def get_arena_engine() -> ArenaEngine:
    """延迟创建并复用竞技引擎。"""
    global _arena_engine
    if _arena_engine is None:
        from llm.client import create_model_client

        _arena_engine = ArenaEngine(create_model_client("act"))
    return _arena_engine


async def _load_agent(db: AsyncSession, agent_id: str):
    """从 SQLite 加载 Agent 并重建 LifeAgent。"""
    result = await db.execute(select(AgentRow).where(AgentRow.id == agent_id))
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Agent not found: {agent_id}")
    return await _rebuild_agent_from_row(row)


async def _load_agents(db: AsyncSession, agent_ids: list[str]) -> list:
    """按请求顺序加载多个 Agent。"""
    return [await _load_agent(db, agent_id) for agent_id in agent_ids]


async def _persist_result(
    db: AsyncSession,
    result: ArenaResult,
) -> ArenaResultResponse:
    """持久化完整竞技结果并返回受限响应版本。"""
    arena_id = str(uuid.uuid4())
    try:
        db.add(ArenaRow.from_result(arena_id, result))
        await db.commit()
    except Exception as error:
        await db.rollback()
        logger.exception("Arena result persistence failed")
        raise HTTPException(
            status_code=500,
            detail=f"竞技结果保存失败: {str(error)}",
        ) from error
    return ArenaResultResponse.from_result(arena_id, result)


async def _execute_duel(
    req: ArenaCreateRequest,
    expected_mode: ArenaMode,
    db: AsyncSession,
    runner: Callable[..., Awaitable[ArenaResult]],
) -> ArenaResultResponse:
    """校验路由模式、执行 1v1 并只保存成功结果。"""
    if req.mode != expected_mode:
        raise HTTPException(
            status_code=422,
            detail=f"该端点只接受 mode={expected_mode.value}",
        )
    agent_a, agent_b = await _load_agents(
        db,
        [req.agent_a_id, req.agent_b_id],
    )
    try:
        result = await runner(agent_a, agent_b, req.topic, req.rounds)
    except asyncio.TimeoutError as error:
        logger.warning(f"Arena {expected_mode.value} timed out")
        raise HTTPException(status_code=504, detail="竞技运行超时，请稍后重试") from error
    except Exception as error:
        logger.exception(f"Arena {expected_mode.value} failed")
        raise HTTPException(
            status_code=500,
            detail=f"竞技运行失败: {str(error)}",
        ) from error
    return await _persist_result(db, result)


@router.post("/debate", response_model=ArenaResultResponse, status_code=201)
async def run_debate(
    req: ArenaCreateRequest,
    db: AsyncSession = Depends(get_db),
    engine: ArenaEngine = Depends(get_arena_engine),
):
    """运行并保存一场 1v1 辩论。"""
    return await _execute_duel(
        req,
        ArenaMode.DEBATE,
        db,
        engine.run_debate,
    )


@router.post("/interview", response_model=ArenaResultResponse, status_code=201)
async def run_interview(
    req: ArenaCreateRequest,
    db: AsyncSession = Depends(get_db),
    engine: ArenaEngine = Depends(get_arena_engine),
):
    """运行并保存一场面试竞争。"""
    return await _execute_duel(
        req,
        ArenaMode.INTERVIEW,
        db,
        engine.run_interview,
    )


@router.post("/pitch", response_model=ArenaResultResponse, status_code=201)
async def run_pitch(
    req: ArenaCreateRequest,
    db: AsyncSession = Depends(get_db),
    engine: ArenaEngine = Depends(get_arena_engine),
):
    """运行并保存一场创业路演。"""
    return await _execute_duel(
        req,
        ArenaMode.PITCH,
        db,
        engine.run_pitch,
    )


@router.post("/blind_test", response_model=ArenaResultResponse, status_code=201)
async def run_blind_test(
    req: ArenaCreateRequest,
    db: AsyncSession = Depends(get_db),
    engine: ArenaEngine = Depends(get_arena_engine),
):
    """运行并保存一场盲测：裁判评分时隐藏发言者身份。"""
    if req.mode != ArenaMode.BLIND_TEST:
        raise HTTPException(
            status_code=422,
            detail=f"该端点只接受 mode={ArenaMode.BLIND_TEST.value}",
        )
    agent_a, agent_b = await _load_agents(
        db,
        [req.agent_a_id, req.agent_b_id],
    )
    try:
        result = await engine.run_blind_test(agent_a, agent_b, req.topic, req.rounds)
    except asyncio.TimeoutError as error:
        logger.warning("Arena blind_test timed out")
        raise HTTPException(status_code=504, detail="盲测运行超时，请稍后重试") from error
    except Exception as error:
        logger.exception("Arena blind_test failed")
        raise HTTPException(
            status_code=500,
            detail=f"盲测运行失败: {str(error)}",
        ) from error
    return await _persist_result(db, result)


@router.post(
    "/battle_royale",
    response_model=ArenaResultResponse,
    status_code=201,
)
async def run_battle_royale(
    req: BattleRoyaleRequest,
    db: AsyncSession = Depends(get_db),
    engine: ArenaEngine = Depends(get_arena_engine),
):
    """运行并保存一场 6–8 人自由淘汰赛。"""
    agents = await _load_agents(db, req.agent_ids)
    try:
        result = await engine.run_battle_royale(agents, req.topic)
    except asyncio.TimeoutError as error:
        logger.warning("Arena battle_royale timed out")
        raise HTTPException(status_code=504, detail="大乱斗运行超时，请稍后重试") from error
    except Exception as error:
        logger.exception("Arena battle_royale failed")
        raise HTTPException(
            status_code=500,
            detail=f"大乱斗运行失败: {str(error)}",
        ) from error
    return await _persist_result(db, result)


async def _get_arena_row(db: AsyncSession, arena_id: str) -> ArenaRow:
    """查询竞技记录，不存在时返回统一 404。"""
    result = await db.execute(
        select(ArenaRow).where(ArenaRow.id == arena_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail=f"Arena result not found: {arena_id}",
        )
    return row


@router.get("/{arena_id}/report", response_model=ArenaReportResponse)
async def get_arena_report(
    arena_id: str,
    db: AsyncSession = Depends(get_db),
):
    """从完整持久化记录生成 Markdown 战报。"""
    row = await _get_arena_row(db, arena_id)
    return build_arena_report(arena_id, row.to_result())


@router.get("/{arena_id}", response_model=ArenaResultResponse)
async def get_arena_result(
    arena_id: str,
    db: AsyncSession = Depends(get_db),
):
    """从 SQLite 获取单场竞技结果。"""
    row = await _get_arena_row(db, arena_id)
    return ArenaResultResponse.from_result(arena_id, row.to_result())


@router.get("", response_model=list[ArenaResultResponse])
async def list_arenas(
    agent_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """列出竞技历史，可按任意参赛 Agent 过滤。"""
    query = select(ArenaRow).order_by(ArenaRow.created_at.desc())
    rows = (await db.execute(query)).scalars().all()
    if agent_id:
        rows = [
            row
            for row in rows
            if agent_id in row.to_result().participant_ids
        ]
    return [
        ArenaResultResponse.from_result(row.id, row.to_result())
        for row in rows
    ]
