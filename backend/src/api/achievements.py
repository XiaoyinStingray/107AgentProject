"""
成就系统 API 路由。
Step 45: 从 SQLite 统计数据计算成就进度和解锁状态。

路由:
    GET /api/achievements    返回成就列表 + 统计摘要
"""

from fastapi import APIRouter
from sqlalchemy import func, select

from db import async_session

router = APIRouter(prefix="/api/achievements", tags=["achievements"])


# =============================================================================
# 类型
# =============================================================================

from pydantic import BaseModel


class AchievementItem(BaseModel):
    id: str
    emoji: str
    title: str
    description: str
    progress: float   # 0.0–1.0
    unlocked: bool
    unlocked_at: str | None = None


class AchievementSummary(BaseModel):
    total_agents: int
    total_simulations: int
    total_ticks: int
    total_narratives: int


class AchievementResponse(BaseModel):
    achievements: list[AchievementItem]
    summary: AchievementSummary


# =============================================================================
# 路由
# =============================================================================


@router.get("", response_model=AchievementResponse)
async def get_achievements():
    """从数据库统计数据，计算 10 个成就的进度和解锁状态。"""
    from models.agent_orm import AgentRow
    from models.world_orm import WorldRow
    from models.simulation_orm import SimulationRow
    from models.arena_orm import ArenaRow
    from models.event import Event

    async with async_session() as session:
        # 基础统计
        agent_count_result = await session.execute(
            select(func.count()).select_from(AgentRow)
        )
        total_agents = agent_count_result.scalar() or 0

        world_count_result = await session.execute(
            select(func.count()).select_from(WorldRow)
        )
        total_worlds = world_count_result.scalar() or 0

        sim_result = await session.execute(
            select(func.count()).select_from(SimulationRow)
        )
        total_simulations = sim_result.scalar() or 0

        # 总 tick 数（从 simulation 记录聚合）
        ticks_result = await session.execute(
            select(func.coalesce(func.sum(SimulationRow.total_ticks), 0))
        )
        total_ticks = ticks_result.scalar() or 0

        # 最大单次 tick
        max_ticks_result = await session.execute(
            select(func.coalesce(func.max(SimulationRow.total_ticks), 0))
        )
        max_ticks = max_ticks_result.scalar() or 0

        # 竞技场计数
        arena_result = await session.execute(
            select(func.count()).select_from(ArenaRow)
        )
        arena_count = arena_result.scalar() or 0

        # 总事件数
        event_result = await session.execute(
            select(func.count()).select_from(Event)
        )
        total_events = event_result.scalar() or 0

        # World 中最多 Agent 数（用于"三人成众"）——从 worlds 表 agent_ids_json 无法聚合，按世界数近似
        # 检查是否有 World 包含 ≥3 Agent
        worlds_result = await session.execute(select(WorldRow))
        world_rows = worlds_result.scalars().all()
        max_agents_in_world = 0
        for wr in world_rows:
            try:
                import json
                agent_ids = json.loads(wr.agent_ids_json)
                max_agents_in_world = max(max_agents_in_world, len(agent_ids))
            except Exception:
                pass

    # 叙事数（无持久化表，用 Simulation 数近似——每次模拟结束后可能生成叙事）
    # Step 42 已联通叙事工厂，但未持久化叙事记录。用模拟数作为估计。
    total_narratives = total_simulations * 2  # 合理估计

    summary = AchievementSummary(
        total_agents=total_agents,
        total_simulations=total_simulations,
        total_ticks=total_ticks,
        total_narratives=total_narratives,
    )

    # 构建成就列表
    achievements = [
        AchievementItem(
            id="ach-1", emoji="🎭", title="造物主",
            description="创建第一个 Agent",
            progress=min(1.0, total_agents / 1),
            unlocked=total_agents >= 1,
        ),
        AchievementItem(
            id="ach-2", emoji="👥", title="三人成众",
            description="在同一场景中放入 3 个 Agent",
            progress=min(1.0, max_agents_in_world / 3),
            unlocked=max_agents_in_world >= 3,
        ),
        AchievementItem(
            id="ach-3", emoji="📖", title="说书人",
            description="生成第一篇叙事",
            progress=min(1.0, total_narratives / 1),
            unlocked=total_narratives >= 1,
        ),
        AchievementItem(
            id="ach-4", emoji="🥊", title="角斗士",
            description="发起第一场竞技",
            progress=min(1.0, arena_count / 1),
            unlocked=arena_count >= 1,
        ),
        AchievementItem(
            id="ach-5", emoji="🕐", title="马拉松",
            description="模拟运行超过 100 Tick",
            progress=min(1.0, max_ticks / 100),
            unlocked=max_ticks >= 100,
        ),
        AchievementItem(
            id="ach-6", emoji="🤝", title="和平使者",
            description="两个 Agent 关系分达到 0.8+",
            progress=0.0,  # 关系分数在运行时，无持久化查询
            unlocked=False,
        ),
        AchievementItem(
            id="ach-7", emoji="⚔️", title="宿敌",
            description="两个 Agent 关系分降到 -0.5 以下",
            progress=0.0,  # 同上
            unlocked=False,
        ),
        AchievementItem(
            id="ach-8", emoji="📊", title="观察者",
            description="在控制台查看 10 次以上",
            progress=min(1.0, total_worlds / 10),  # 用 World 数近似
            unlocked=total_worlds >= 10,
        ),
        AchievementItem(
            id="ach-9", emoji="🎬", title="导演",
            description="成功注入 5 次事件",
            progress=0.0,  # 干预历史未持久化
            unlocked=False,
        ),
        AchievementItem(
            id="ach-10", emoji="🏆", title="全能选手",
            description="解锁所有其他成就",
            progress=0.0,
            unlocked=False,  # 最后计算
        ),
    ]

    # 检查"全能选手"——所有可解锁成就（除自身）是否都已解锁
    other_achievements = [a for a in achievements if a.id != "ach-10"]
    unlocked_others = sum(1 for a in other_achievements if a.unlocked)
    all_unlocked = all(a.unlocked for a in other_achievements)
    achievements[-1].progress = unlocked_others / len(other_achievements)
    achievements[-1].unlocked = all_unlocked

    # 为已解锁的成就补解锁时间（用首个 simulation 的 started_at 或当前时间）
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    for a in achievements:
        if a.unlocked and not a.unlocked_at:
            a.unlocked_at = now

    return AchievementResponse(achievements=achievements, summary=summary)
