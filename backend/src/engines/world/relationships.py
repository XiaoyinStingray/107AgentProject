"""
关系演化 — 交互信号检测 + 关系分数更新。

P0 策略：关键词匹配检测交互类型 + 双向独立分数。
P2 升级：LLM 分类 + 向量检索。

用法:
    from engines.world.relationships import (
        update_relationship_score,
        detect_interaction_type,
        apply_relationship_changes,
    )
"""

import re
import uuid

from loguru import logger

from models.event import SimEvent


# =============================================================================
# 关系分数计算
# =============================================================================

# 一次交互对关系分数的增量（正值=正面，负值=负面）
INTERACTION_DELTAS: dict[str, float] = {
    "friendly": +0.10,
    "hostile": -0.15,
    "cooperative": +0.08,
    "competitive": -0.05,
    "neutral": 0.0,
}


def update_relationship_score(
    current_score: float,
    interaction_type: str,
    intensity: float = 1.0,
) -> float:
    """根据一次交互更新关系分数。

    Args:
        current_score: 当前关系分数（-1.0 ~ 1.0）
        interaction_type: 交互类型（friendly | hostile | cooperative | competitive | neutral）
        intensity: 交互强度（0.0 ~ 2.0，默认 1.0）

    Returns:
        更新后的关系分数（clamp 到 [-1.0, 1.0]）
    """
    delta = INTERACTION_DELTAS.get(interaction_type, 0.0) * intensity
    return max(-1.0, min(1.0, current_score + delta))


# =============================================================================
# 交互类型检测（P0: 关键词匹配）
# =============================================================================

# 中英文关键词 → 交互类型
_FRIENDLY_PATTERNS: list[str] = [
    "谢谢", "感谢", "谢了", "真好", "太好了", "真棒", "喜欢", "欣赏",
    "帮", "帮忙", "支持", "关心", "安慰", "鼓励", "包容",
    "thanks", "thank", "appreciate", "great", "love", "like",
    "help", "support", "care", "kind",
]
_HOSTILE_PATTERNS: list[str] = [
    "讨厌", "恨", "滚", "闭嘴", "恶心", "鄙视", "看不起", "不屑",
    "嘲讽", "嘲笑", "笑", "废物", "蠢", "笨", "弱",
    "hate", "shut up", "stupid", "idiot", "useless", "pathetic",
]
_COOPERATIVE_PATTERNS: list[str] = [
    "一起", "合作", "我们", "共同", "配合", "组队", "联手",
    "商量", "讨论", "建议", "提议", "分享",
    "together", "cooperate", "team", "share", "let's", "we",
]
_COMPETITIVE_PATTERNS: list[str] = [
    "比", "赢", "胜", "竞争", "对手", "打败", "超过", "第一",
    "我比你", "你不行", "看看谁", "挑战", "抢座", "占座", "争夺",
    "抢占", "先到先得", "名额",
    "beat", "win", "compete", "rival", "better than",
]


def detect_interaction_type(text: str) -> str:
    """从文本内容检测交互类型。

    P0 策略：关键词计数，取匹配最多的类型。平局→neutral。

    Args:
        text: 消息或事件描述文本

    Returns:
        交互类型字符串（friendly | hostile | cooperative | competitive | neutral）
    """
    text_lower = text.lower()
    scores: dict[str, int] = {
        "friendly": _count_matches(text_lower, _FRIENDLY_PATTERNS),
        "hostile": _count_matches(text_lower, _HOSTILE_PATTERNS),
        "cooperative": _count_matches(text_lower, _COOPERATIVE_PATTERNS),
        "competitive": _count_matches(text_lower, _COMPETITIVE_PATTERNS),
    }

    max_type = max(scores, key=lambda k: scores[k])
    if scores[max_type] == 0:
        return "neutral"
    return max_type


def _count_matches(text: str, patterns: list[str]) -> int:
    """统计文本中匹配到的关键词数量。"""
    count = 0
    for pattern in patterns:
        if pattern in text:
            count += 1
    return count


# =============================================================================
# 从事件提取关系变化
# =============================================================================


def extract_relationship_changes(
    events: list[SimEvent],
    all_agent_ids: set[str] | None = None,
) -> list[tuple[str, str, str, float]]:
    """从事件列表中提取关系变化。

    只处理 agent_message 事件。每条消息检测交互类型，
    映射为 (from_id → to_id, 类型, 强度)。

    Args:
        events: 一个 tick 中产生的全部 SimEvent
        all_agent_ids: 所有在场 Agent 的 ID 集合。
                       无明确目标时 broadcast 到其他所有人。

    Returns:
        [(source_agent_id, target_agent_id, interaction_type, intensity), ...]
    """
    changes: list[tuple[str, str, str, float]] = []

    for evt in events:
        if evt.type != "agent_message":
            continue
        if not evt.source_agent_id:
            continue

        source = evt.source_agent_id
        interaction = detect_interaction_type(evt.description)

        if interaction == "neutral":
            continue

        # 强度：消息越长→交互越深
        intensity = min(2.0, max(0.5, len(evt.description) / 100))

        # 目标：优先用 target_agent_ids，否则 broadcast 到所有其他 agent
        targets = [t for t in evt.target_agent_ids if t] if evt.target_agent_ids else []
        if not targets and all_agent_ids:
            targets = [aid for aid in all_agent_ids if aid != source]

        if not targets:
            continue

        for target in targets:
            if target != source:
                changes.append((source, target, interaction, intensity))

    return changes


# =============================================================================
# 应用关系变化到 WorldEngine 内部状态
# =============================================================================


def apply_relationship_changes(
    relationships: dict[tuple[str, str], float],
    changes: list[tuple[str, str, str, float]],
) -> list[SimEvent]:
    """将检测到的交互信号应用到关系分数。

    生成 relationship_change 类型的 SimEvent 用于记录和下游消费。

    Args:
        relationships: WorldEngine 的关系字典 {(from, to): score}
        changes: extract_relationship_changes 的输出

    Returns:
        relationship_change 事件列表
    """
    rel_events: list[SimEvent] = []

    for from_id, to_id, interaction, intensity in changes:
        key = (from_id, to_id)
        old_score = relationships.get(key, 0.0)
        new_score = update_relationship_score(old_score, interaction, intensity)
        relationships[key] = new_score

        logger.debug(
            f"Relationship: {from_id}→{to_id}: "
            f"{old_score:+.2f} → {new_score:+.2f} ({interaction} ×{intensity:.1f})"
        )

        rel_events.append(
            SimEvent(
                id=str(uuid.uuid4()),
                world_id="",  # 由 WorldEngine 填充
                tick=0,  # 由 WorldEngine 填充
                type="relationship_change",
                source_agent_id=from_id,
                target_agent_ids=[to_id],
                description=f"关系变化: {interaction}",
                created_at="",
                data={
                    "from": from_id,
                    "to": to_id,
                    "interaction": interaction,
                    "intensity": intensity,
                    "old_score": round(old_score, 3),
                    "new_score": round(new_score, 3),
                },
            )
        )

    return rel_events
