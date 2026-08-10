"""
关系演化 — 交互信号检测 + 关系分数更新。

State 8 M3 重构:
  - 扩展事件类型支持：agent_message + thought_stream + agent_action
  - 每 tick 全量评估（不再仅依赖单条消息）
  - LLM 辅助评估（每 3 tick 一次深度分析）
  - 关系变化事件在 tick boundary 统一发出

P0 策略：关键词匹配检测交互类型 + 双向独立分数。
P2 升级：LLM 分类 + 向量检索。

用法:
    from engines.world.relationships import (
        update_relationship_score,
        detect_interaction_type,
        apply_relationship_changes,
        assess_tick_relationships,
    )
"""

import json
import uuid
from typing import Any

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
    "supportive": +0.12,     # 主动支持/安慰/鼓励
    "dismissive": -0.10,     # 忽视/冷淡/回避
    "curious": +0.05,        # 好奇/关注
}


def update_relationship_score(
    current_score: float,
    interaction_type: str,
    intensity: float = 1.0,
) -> float:
    """根据一次交互更新关系分数。

    Args:
        current_score: 当前关系分数（-1.0 ~ 1.0）
        interaction_type: 交互类型
        intensity: 交互强度（0.0 ~ 2.0，默认 1.0）

    Returns:
        更新后的关系分数（clamp 到 [-1.0, 1.0]）
    """
    delta = INTERACTION_DELTAS.get(interaction_type, 0.0) * intensity
    return max(-1.0, min(1.0, current_score + delta))


# =============================================================================
# 交互类型检测（P0: 关键词匹配）
# =============================================================================

_FRIENDLY_PATTERNS: list[str] = [
    "谢谢", "感谢", "谢了", "真好", "太好了", "真棒", "喜欢", "欣赏",
    "帮", "帮忙", "支持", "关心", "安慰", "鼓励", "包容", "加油",
    "理解", "体谅", "信任", "佩服",
    "thanks", "thank", "appreciate", "great", "love", "like",
    "help", "support", "care", "kind",
]
_HOSTILE_PATTERNS: list[str] = [
    "讨厌", "恨", "滚", "闭嘴", "恶心", "鄙视", "看不起", "不屑",
    "嘲讽", "嘲笑", "废物", "蠢", "笨", "弱",
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
    "抢占", "先到先得", "名额", "抢",
    "beat", "win", "compete", "rival", "better than",
]
_SUPPORTIVE_PATTERNS: list[str] = [
    "我相信你", "你可以的", "没问题", "一定能", "别担心", "我在",
    "不要怕", "我陪你", "有我在", "你行的", "辛苦了",
]
_DISMISSIVE_PATTERNS: list[str] = [
    "随便", "无所谓", "不关我事", "管我什么事", "别烦我", "忙着",
    "没空", "不用了", "算了", "哦", "嗯",
]
_CURIOUS_PATTERNS: list[str] = [
    "你怎么", "为什么", "什么情况", "说来听听", "然后呢", "真的吗",
    "你怎么想", "你觉得", "怎么回事", "后来",
]


def detect_interaction_type(text: str) -> str:
    """从文本内容检测交互类型。

    P0 策略：关键词计数，取匹配最多的类型。平局→neutral。
    State 8: 扩展识别 supportive/dismissive/curious。

    Args:
        text: 消息或事件描述文本

    Returns:
        交互类型字符串
    """
    text_lower = text.lower()
    scores: dict[str, int] = {
        "friendly": _count_matches(text_lower, _FRIENDLY_PATTERNS),
        "hostile": _count_matches(text_lower, _HOSTILE_PATTERNS),
        "cooperative": _count_matches(text_lower, _COOPERATIVE_PATTERNS),
        "competitive": _count_matches(text_lower, _COMPETITIVE_PATTERNS),
        "supportive": _count_matches(text_lower, _SUPPORTIVE_PATTERNS),
        "dismissive": _count_matches(text_lower, _DISMISSIVE_PATTERNS),
        "curious": _count_matches(text_lower, _CURIOUS_PATTERNS),
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
# 从事件提取关系变化（State 8: 扩展事件类型）
# =============================================================================


def extract_relationship_changes(
    events: list[SimEvent],
    all_agent_ids: set[str] | None = None,
) -> list[tuple[str, str, str, float]]:
    """从事件列表中提取关系变化。

    处理 agent_message 和 thought_stream 事件。
    每条消息/思考可能隐含对其他 Agent 的态度。

    Args:
        events: 一个 tick 中产生的全部 SimEvent
        all_agent_ids: 所有在场 Agent 的 ID 集合。
                       无明确目标时 broadcast 到其他所有人。

    Returns:
        [(source_agent_id, target_agent_id, interaction_type, intensity), ...]
    """
    changes: list[tuple[str, str, str, float]] = []

    for evt in events:
        if evt.type not in ("agent_message", "thought_stream"):
            continue
        if not evt.source_agent_id:
            continue

        source = evt.source_agent_id
        interaction = detect_interaction_type(evt.description)

        # thought_stream 的强度降低——思考不如直接对话影响大
        if evt.type == "thought_stream":
            if interaction == "neutral":
                continue
            intensity = min(1.5, max(0.3, len(evt.description) / 150))
        else:
            if interaction == "neutral":
                continue
            intensity = min(2.0, max(0.5, len(evt.description) / 100))

        # 目标：优先用 target_agent_ids，否则 broadcast
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


# =============================================================================
# State 8: LLM 辅助关系评估（每 3 tick）
# =============================================================================


_RELATION_ASSESS_PROMPT = """你正在观察一个多人社交场景。请根据当前 tick 的事件，评估人物之间关系的微妙变化。

事件记录：
{events_text}

人物列表：
{names}

请返回 JSON 数组（只返回 JSON，不要其他文字）：
[
  {{"from": "姓名", "to": "姓名", "interaction": "friendly|hostile|cooperative|competitive|supportive|dismissive|curious|neutral", "intensity": 0.5-2.0, "reason": "一句话理由"}}
]

规则：
- 只报告有明显互动信号的配对（neutral 不需要报告）
- 一个人对另一个人的内心评价（思考）也算互动
- 沉默/回避也是重要信号
- intensity 表示互动深度：0.5=轻微, 1.0=正常, 2.0=强烈
- 如果没有显著互动，返回空数组 []
"""


async def assess_tick_relationships_llm(
    events: list[SimEvent],
    agent_names: dict[str, str],
    model_client: Any,
    world_id: str,
    tick: int,
) -> list[tuple[str, str, str, float]]:
    """使用 LLM 对当前 tick 的所有事件做深度关系评估。

    作为关键词匹配的补充——LLM 能识别微妙的情感变化和隐含态度。
    每 3 tick 调用一次以控制成本。

    Args:
        events: 当前 tick 的所有事件
        agent_names: {agent_id: display_name} 映射
        model_client: LLM 客户端
        world_id: 当前 World ID
        tick: 当前 tick 号

    Returns:
        [(source_agent_id, target_agent_id, interaction_type, intensity), ...]
    """
    if not model_client or not events or len(agent_names) < 2:
        return []

    # 构建事件文本
    events_text_parts = []
    for e in events:
        if e.type not in ("agent_message", "thought_stream", "agent_action"):
            continue
        name = agent_names.get(e.source_agent_id or "", e.source_agent_id or "?")
        prefix = "💭" if e.type == "thought_stream" else ("⚡" if e.type == "agent_action" else "💬")
        desc = e.description[:200]
        events_text_parts.append(f"{prefix} {name}: {desc}")

    if not events_text_parts:
        return []

    events_text = "\n".join(events_text_parts[-20:])  # 最多 20 条
    names_list = ", ".join(agent_names.values())

    try:
        from autogen_core.models import UserMessage

        prompt = _RELATION_ASSESS_PROMPT.format(
            events_text=events_text,
            names=names_list,
        )
        result = await model_client.create(
            messages=[UserMessage(content=prompt, source="relation_assessor")],
            json_output=True,
        )
        raw = str(result.content).strip()
        items = json.loads(raw)
        if not isinstance(items, list):
            return []

        # 解析 LLM 输出 → (source_id, target_id, type, intensity)
        name_to_id = {v: k for k, v in agent_names.items()}
        changes: list[tuple[str, str, str, float]] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            from_name = item.get("from", "")
            to_name = item.get("to", "")
            interaction = item.get("interaction", "neutral")
            intensity = float(item.get("intensity", 1.0))

            if interaction == "neutral":
                continue

            from_id = name_to_id.get(from_name, "")
            to_id = name_to_id.get(to_name, "")
            if from_id and to_id and from_id != to_id:
                intensity = max(0.3, min(2.0, intensity))
                changes.append((from_id, to_id, interaction, intensity))

        if changes:
            logger.info(
                f"LLM relationship assessment: world={world_id}, "
                f"tick={tick}, changes={len(changes)}"
            )
        return changes

    except Exception as error:
        logger.warning(f"LLM relationship assessment failed: {error}")
        return []
