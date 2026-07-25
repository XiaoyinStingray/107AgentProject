"""
模拟记录 API 路由。

路由:
    GET /api/simulations        列出所有模拟记录（含 World 元数据）
    GET /api/simulations/{id}   获取模拟详情

Step 45: 从内存 dict 迁移到 SQLite 持久化，重启不丢数据。
响应中附加 world_name / agent_count / event_count 供档案馆精彩回放使用。
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from db import async_session

router = APIRouter(prefix="/api/simulations", tags=["simulations"])


# =============================================================================
# 类型
# =============================================================================


class SimulationRecord(BaseModel):
    id: str
    world_id: str
    started_at: str
    ended_at: str | None = None
    total_ticks: int = 0
    status: str = "running"
    # Step 45 新增：供档案馆精彩回放面板使用的上下文字段
    world_name: str = ""
    agent_count: int = 0
    event_count: int = 0


# =============================================================================
# 内存存储（保留，内部 create/finish 调用不依赖 await 返回）
# =============================================================================

_simulations: dict[str, SimulationRecord] = {}


# =============================================================================
# 路由
# =============================================================================


@router.get("", response_model=list[SimulationRecord])
async def list_simulations(world_id: str | None = None):
    """列出模拟记录。可选 world_id 筛选。响应附带 World 上下文信息。"""
    from models.simulation_orm import SimulationRow
    from models.world_orm import WorldRow
    from models.event import Event

    async with async_session() as session:
        # 查询 simulation 记录
        stmt = select(SimulationRow).order_by(SimulationRow.started_at.desc())
        result = await session.execute(stmt)
        rows = result.scalars().all()

        records: list[SimulationRecord] = []
        for row in rows:
            if world_id and row.world_id != world_id:
                continue

            # 查询关联 World 的名称和 Agent 数
            world_result = await session.execute(
                select(WorldRow).where(WorldRow.id == row.world_id)
            )
            world_row = world_result.scalar_one_or_none()
            # World 已删除 → 跳过这条 simulation 记录
            if not world_row:
                continue
            world_name = world_row.name
            agent_count = 0
            try:
                agent_ids = json.loads(world_row.agent_ids_json)
                agent_count = len(agent_ids)
            except (json.JSONDecodeError, TypeError):
                pass

            # 查询事件数
            event_result = await session.execute(
                select(func.count()).select_from(Event).where(Event.world_id == row.world_id)
            )
            event_count = event_result.scalar() or 0

            records.append(SimulationRecord(
                id=row.id,
                world_id=row.world_id,
                started_at=row.started_at,
                ended_at=row.ended_at,
                total_ticks=row.total_ticks,
                status=row.status,
                world_name=world_name,
                agent_count=agent_count,
                event_count=event_count,
            ))

        return records


@router.get("/{simulation_id}", response_model=SimulationRecord)
async def get_simulation(simulation_id: str):
    """获取模拟详情。"""
    from models.simulation_orm import SimulationRow

    async with async_session() as session:
        result = await session.execute(
            select(SimulationRow).where(SimulationRow.id == simulation_id)
        )
        row = result.scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Simulation not found: {simulation_id}")

        # 查询关联 World 上下文
        from models.world_orm import WorldRow
        from models.event import Event

        world_result = await session.execute(
            select(WorldRow).where(WorldRow.id == row.world_id)
        )
        world_row = world_result.scalar_one_or_none()
        world_name = ""
        agent_count = 0
        if world_row:
            world_name = world_row.name
            try:
                agent_ids = json.loads(world_row.agent_ids_json)
                agent_count = len(agent_ids)
            except (json.JSONDecodeError, TypeError):
                pass

        event_result = await session.execute(
            select(func.count()).select_from(Event).where(Event.world_id == row.world_id)
        )
        event_count = event_result.scalar() or 0

        return SimulationRecord(
            id=row.id,
            world_id=row.world_id,
            started_at=row.started_at,
            ended_at=row.ended_at,
            total_ticks=row.total_ticks,
            status=row.status,
            world_name=world_name,
            agent_count=agent_count,
            event_count=event_count,
        )


# =============================================================================
# 工具函数（供其他模块创建/结束 simulation 记录）
# =============================================================================


async def create_simulation(world_id: str) -> SimulationRecord:
    """Create and retain one running simulation record for a World.

    Step 45: 同时写入内存 dict 和 SQLite，保证向后兼容。
    """
    sim = SimulationRecord(
        id=str(uuid.uuid4()),
        world_id=world_id,
        started_at=datetime.now(timezone.utc).isoformat(),
        status="running",
    )
    _simulations[sim.id] = sim

    # SQLite 持久化
    from models.simulation_orm import SimulationRow
    async with async_session() as session:
        row = SimulationRow(
            id=sim.id,
            world_id=sim.world_id,
            started_at=sim.started_at,
            total_ticks=sim.total_ticks,
            status=sim.status,
        )
        session.add(row)
        await session.commit()

    return sim


async def finish_simulation(simulation_id: str, total_ticks: int):
    """Mark a retained simulation record as finished.

    Step 45: 同时更新内存 dict 和 SQLite，保证向后兼容。
    """
    sim = _simulations.get(simulation_id)
    if sim:
        sim.status = "finished"
        sim.ended_at = datetime.now(timezone.utc).isoformat()
        sim.total_ticks = total_ticks

    # SQLite 持久化
    from models.simulation_orm import SimulationRow
    async with async_session() as session:
        result = await session.execute(
            select(SimulationRow).where(SimulationRow.id == simulation_id)
        )
        row = result.scalar_one_or_none()
        if row:
            row.status = "finished"
            row.ended_at = datetime.now(timezone.utc).isoformat()
            row.total_ticks = total_ticks
            await session.commit()
