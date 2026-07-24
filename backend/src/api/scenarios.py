"""
场景 CRUD 路由 — 内置场景 + 用户自定义场景。

路由:
    GET    /api/scenarios         列出所有场景（内置 + 自定义）
    POST   /api/scenarios         创建自定义场景
    DELETE /api/scenarios/{id}    删除自定义场景
"""

import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from engines.world.scenarios import BUILTIN_SCENARIOS
from models.world import Scenario

router = APIRouter(prefix="/api/scenarios", tags=["scenarios"])

# =============================================================================
# 内存存储（Step 35 迁 SQLite）
# =============================================================================

_custom_scenarios: dict[str, Scenario] = {}


# =============================================================================
# 请求体
# =============================================================================


class ScenarioCreate(BaseModel):
    """自定义场景创建请求，字段与 Scenario 模型一致。"""

    name: str
    description: str = ""
    time_range: str = "1-20"
    initial_events: list[str] = []
    environment_params: dict[str, str] = {}


# =============================================================================
# 路由
# =============================================================================


@router.get("", response_model=list[Scenario])
async def list_scenarios():
    """返回内置场景 + 用户自定义场景。"""
    return [*BUILTIN_SCENARIOS, *_custom_scenarios.values()]


@router.post("", response_model=Scenario, status_code=201)
async def create_scenario(req: ScenarioCreate):
    """创建自定义场景。"""
    scenario = Scenario(
        name=req.name,
        description=req.description,
        time_range=req.time_range,
        initial_events=req.initial_events,
        environment_params=req.environment_params,
        # 标记为自定义（内置场景无此字段）
        id=str(uuid.uuid4()),
    )
    scenario_id = scenario.id or ""
    _custom_scenarios[scenario_id] = scenario
    return scenario


@router.delete("/{scenario_id}", status_code=204)
async def delete_scenario(scenario_id: str):
    """删除自定义场景（内置场景不可删）。"""
    if scenario_id not in _custom_scenarios:
        raise HTTPException(status_code=404, detail="场景不存在或为内置场景")
    _custom_scenarios.pop(scenario_id, None)
    return None
