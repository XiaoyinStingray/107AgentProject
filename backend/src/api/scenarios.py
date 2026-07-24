"""
场景 CRUD 路由 — 内置场景 + 用户自定义场景（SQLite 持久化）。

路由:
    GET    /api/scenarios         列出所有场景（内置 + 自定义）
    POST   /api/scenarios         创建自定义场景
    DELETE /api/scenarios/{id}    删除自定义场景
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from engines.world.scenarios import BUILTIN_SCENARIOS
from models.scenario_orm import ScenarioRow
from models.world import Scenario

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])


# =============================================================================
# 请求体
# =============================================================================


class ScenarioCreate(BaseModel):
    """自定义场景创建请求。"""

    name: str
    description: str = ""
    time_range: str = "1-20"
    initial_events: list[str] = []
    environment_params: dict[str, str] = {}


# =============================================================================
# 辅助
# =============================================================================


def _row_to_scenario(row: ScenarioRow) -> dict:
    """将 ORM 行反序列化为 Scenario 前端格式（含 id）。"""
    data = row.to_scenario()
    return {
        "id": data["id"],
        "name": data["name"],
        "description": data["description"],
        "time_range": data["time_range"],
        "initial_events": data["initial_events"],
        "environment_params": data["environment_params"],
    }


# =============================================================================
# 路由
# =============================================================================


@router.get("", response_model=list[Scenario])
async def list_scenarios(db: AsyncSession = Depends(get_db)):
    """返回内置场景 + 用户自定义场景。"""
    result = await db.execute(select(ScenarioRow).order_by(ScenarioRow.created_at))
    rows = result.scalars().all()
    custom = [_row_to_scenario(row) for row in rows]
    return [*BUILTIN_SCENARIOS, *custom]


@router.post("", response_model=Scenario, status_code=201)
async def create_scenario(req: ScenarioCreate, db: AsyncSession = Depends(get_db)):
    """创建自定义场景，持久化到 SQLite。"""
    import json

    sid = str(uuid.uuid4())
    row = ScenarioRow(
        id=sid,
        name=req.name,
        description=req.description,
        time_range=req.time_range,
        initial_events_json=json.dumps(req.initial_events, ensure_ascii=False),
        environment_params_json=json.dumps(
            req.environment_params, ensure_ascii=False
        ),
    )
    db.add(row)
    await db.commit()
    return _row_to_scenario(row)


@router.delete("/{scenario_id}", status_code=204)
async def delete_scenario(scenario_id: str, db: AsyncSession = Depends(get_db)):
    """删除自定义场景（内置场景不可删——没有 DB 行则 404）。"""
    result = await db.execute(
        select(ScenarioRow).where(ScenarioRow.id == scenario_id)
    )
    row = result.scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="场景不存在或为内置场景")
    await db.execute(delete(ScenarioRow).where(ScenarioRow.id == scenario_id))
    await db.commit()
    return None
