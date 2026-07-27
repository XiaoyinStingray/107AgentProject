"""
Team 模板路由 — 保存/浏览/复用 Team 配置。
Step 56: 本地模板库，无需联网。
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models.market_orm import MarketItem
from models.team_orm import TeamRow

router = APIRouter(prefix="/api/market", tags=["market"])


@router.post("", status_code=201)
async def publish_team(body: dict, db: AsyncSession = Depends(get_db)):
    """发布 Team 到市场。body: {team_id, name, description?, tags?, author?}"""
    team_id = body.get("team_id", "")
    if not team_id:
        raise HTTPException(status_code=400, detail="team_id 不能为空")

    # 验证 Team 存在
    result = await db.execute(select(TeamRow).where(TeamRow.id == team_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Team 不存在")

    # 检查是否已发布
    exist = await db.execute(select(MarketItem).where(MarketItem.team_id == team_id))
    if exist.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="该 Team 已发布")

    import json as _json
    item = MarketItem(
        id=str(uuid.uuid4()),
        team_id=team_id,
        name=body.get("name", "").strip() or "未命名团队",
        description=body.get("description", ""),
        tags=_json.dumps(body.get("tags", []), ensure_ascii=False),
        author=body.get("author", "匿名"),
    )
    db.add(item)
    await db.commit()
    logger.info(f"Market: team {team_id} published as {item.name!r}")
    return item.to_dict()


@router.get("")
async def list_market(db: AsyncSession = Depends(get_db)):
    """浏览市场——按下载量排序。"""
    result = await db.execute(
        select(MarketItem).order_by(MarketItem.downloads.desc())
    )
    rows = result.scalars().all()
    return [r.to_dict() for r in rows]


@router.get("/{item_id}")
async def get_market_item(item_id: str, db: AsyncSession = Depends(get_db)):
    """获取单个市场条目详情（含 Team 配置）。"""
    result = await db.execute(select(MarketItem).where(MarketItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="市场条目不存在")

    data = item.to_dict()

    # 附带 Team 配置
    team_result = await db.execute(select(TeamRow).where(TeamRow.id == item.team_id))
    team = team_result.scalar_one_or_none()
    if team:
        data["team"] = team.to_dict()
    return data


@router.post("/{item_id}/download")
async def download_team(item_id: str, db: AsyncSession = Depends(get_db)):
    """下载 Team——增加下载计数 + 返回 Team 配置供复制。"""
    result = await db.execute(select(MarketItem).where(MarketItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="市场条目不存在")

    item.downloads += 1
    await db.commit()

    # 返回原始 Team 配置（agent_ids + roles）
    team_result = await db.execute(select(TeamRow).where(TeamRow.id == item.team_id))
    team = team_result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="原始 Team 已被删除")

    return {
        "name": team.name,
        "description": team.description,
        "agent_ids": team.to_dict().get("agent_ids", []),
        "roles": team.to_dict().get("roles", []),
    }


@router.post("/{item_id}/rate")
async def rate_item(item_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    """评分（1-5）。body: {score: int}"""
    result = await db.execute(select(MarketItem).where(MarketItem.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="市场条目不存在")

    score = body.get("score", 0)
    if not isinstance(score, int) or score < 1 or score > 5:
        raise HTTPException(status_code=400, detail="评分应为 1-5 的整数")

    item.rating_total += score
    item.rating_count += 1
    await db.commit()
    return {"rating": item.rating, "rating_count": item.rating_count}
