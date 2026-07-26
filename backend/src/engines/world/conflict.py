"""
角色冲突检测 — 基于目标互斥的冲突事件生成。

P2 策略：关键词反义匹配。两个 Agent 的 active goals 中包含
语义上互斥的关键词对时，触发 conflict_detected 事件。
"""

import uuid
from datetime import datetime, timezone

from loguru import logger

from models.event import SimEvent


# =============================================================================
# 互斥关键词对——每对代表一组语义上对立的目标方向
# =============================================================================

CONFLICT_PAIRS: list[tuple[list[str], list[str]]] = [
    (["学习", "复习", "考试", "作业", "读书", "study"], ["玩", "游戏", "娱乐", "放松", "休息", "play"]),
    (["社交", "聚会", "派对", "活动"], ["独处", "安静", "独处", "自闭"]),
    (["工作", "加班", "项目", "deadline"], ["休息", "放松", "休假", "摸鱼"]),
    (["竞争", "赢", "第一", "超越"], ["合作", "分享", "帮助", "配合"]),
    (["冒险", "尝试", "挑战"], ["保守", "安全", "稳定", "避免"]),
    (["消费", "购物", "花钱"], ["省钱", "节约", "存钱"]),
    (["运动", "健身", "锻炼"], ["懒惰", "躺平", "休息"]),
    (["早起", "晨跑", "规律"], ["熬夜", "夜猫", "晚睡"]),
]


def detect_goal_conflicts(
    agents: dict,
) -> list[tuple[str, str, str, str]]:
    """检测所有 Agent 之间的目标冲突。

    Args:
        agents: {agent_id: LifeAgent} 字典

    Returns:
        [(agent_a_id, agent_b_id, goal_a_desc, goal_b_desc), ...]
    """
    conflicts: list[tuple[str, str, str, str]] = []
    agent_list = list(agents.values())

    for i in range(len(agent_list)):
        for j in range(i + 1, len(agent_list)):
            a = agent_list[i]
            b = agent_list[j]
            a_goals = _get_active_goals(a)
            b_goals = _get_active_goals(b)

            for ga in a_goals:
                for gb in b_goals:
                    if _goals_conflict(ga, gb):
                        conflicts.append((
                            a.id if hasattr(a, "id") else str(id(a)),
                            b.id if hasattr(b, "id") else str(id(b)),
                            ga,
                            gb,
                        ))

    return conflicts


def _get_active_goals(agent) -> list[str]:
    """获取 Agent 当前活跃的目标描述列表。"""
    goals = getattr(agent, "goals", [])
    return [
        g.description
        for g in goals
        if g.status in ("active", "in_progress")
    ]


def _goals_conflict(goal_a: str, goal_b: str) -> bool:
    """判断两个目标描述是否存在语义冲突。

    P0 策略：关键词反义匹配。两个目标分别命中
    CONFLICT_PAIRS 中某一组的两侧关键词时视为冲突。
    """
    text_a = goal_a.lower()
    text_b = goal_b.lower()

    for side_a, side_b in CONFLICT_PAIRS:
        a_hits = any(kw in text_a for kw in side_a)
        b_hits = any(kw in text_b for kw in side_b)
        if a_hits and b_hits:
            return True
        # 反向也检查
        a_hits_rev = any(kw in text_a for kw in side_b)
        b_hits_rev = any(kw in text_b for kw in side_a)
        if a_hits_rev and b_hits_rev:
            return True

    return False


def build_conflict_events(
    conflicts: list[tuple[str, str, str, str]],
    world_id: str,
    tick: int,
    agent_names: dict[str, str] | None = None,
) -> list[SimEvent]:
    """将冲突检测结果转为 SimEvent 列表。

    Args:
        conflicts: detect_goal_conflicts 的输出
        world_id: 当前 World ID
        tick: 当前 tick
        agent_names: {agent_id: display_name} 用于生成可读描述

    Returns:
        conflict_detected 事件列表
    """
    events: list[SimEvent] = []
    now = datetime.now(timezone.utc).isoformat()

    for a_id, b_id, goal_a, goal_b in conflicts:
        a_name = (agent_names or {}).get(a_id, a_id[:8])
        b_name = (agent_names or {}).get(b_id, b_id[:8])
        desc = (
            f"⚔️ 目标冲突：{a_name}（{goal_a}）"
            f" vs {b_name}（{goal_b}）"
        )
        events.append(SimEvent(
            id=str(uuid.uuid4()),
            world_id=world_id,
            tick=tick,
            type="conflict_detected",
            source_agent_id=a_id,
            target_agent_ids=[b_id],
            description=desc,
            data={
                "agent_a_id": a_id,
                "agent_b_id": b_id,
                "agent_a_name": a_name,
                "agent_b_name": b_name,
                "goal_a": goal_a,
                "goal_b": goal_b,
            },
            created_at=now,
        ))

    if events:
        logger.info(
            f"Conflict detection: tick={tick}, "
            f"{len(events)} conflict(s) found"
        )

    return events
