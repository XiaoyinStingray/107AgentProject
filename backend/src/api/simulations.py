"""
模拟记录 API 路由。

路由:
    GET /api/simulations        列出所有模拟记录
    GET /api/simulations/{id}   获取模拟详情
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

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


# =============================================================================
# 内存存储
# =============================================================================

_simulations: dict[str, SimulationRecord] = {}


# =============================================================================
# 路由
# =============================================================================


@router.get("", response_model=list[SimulationRecord])
async def list_simulations(world_id: str | None = None):
    """列出模拟记录。可选 world_id 筛选。"""
    if world_id:
        return [s for s in _simulations.values() if s.world_id == world_id]
    return list(_simulations.values())


@router.get("/{simulation_id}", response_model=SimulationRecord)
async def get_simulation(simulation_id: str):
    """获取模拟详情。"""
    sim = _simulations.get(simulation_id)
    if sim is None:
        raise HTTPException(status_code=404, detail=f"Simulation not found: {simulation_id}")
    return sim


# =============================================================================
# 工具函数（供其他模块创建 simulation 记录）
# =============================================================================


def create_simulation(world_id: str) -> SimulationRecord:
    sim = SimulationRecord(
        id=str(uuid.uuid4()),
        world_id=world_id,
        started_at=datetime.now(timezone.utc).isoformat(),
        status="running",
    )
    _simulations[sim.id] = sim
    return sim


def finish_simulation(simulation_id: str, total_ticks: int):
    sim = _simulations.get(simulation_id)
    if sim:
        sim.status = "finished"
        sim.ended_at = datetime.now(timezone.utc).isoformat()
        sim.total_ticks = total_ticks
