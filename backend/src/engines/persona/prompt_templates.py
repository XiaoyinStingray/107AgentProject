"""
System Prompt 构建器 — Persona + Background + Goals → AutoGen system_message。

纯函数，无副作用，无 LLM 调用。同一输入永远返回相同字符串。

用法:
    from engines.persona.prompt_templates import build_system_message
    msg = build_system_message(persona, background, goals)
    msg = build_system_message(persona, background, goals,
                               recent_memories=memories, world_context="...")
"""

from models.agent import Background, BigFive, Goal, Persona
from models.memory import MemoryResponse


# =============================================================================
# 常量映射表
# =============================================================================

_GOAL_STATUS_LABEL: dict[str, str] = {
    "active": "进行中",
    "achieved": "已完成",
    "abandoned": "已放弃",
}

_INFO_PROCESSING_LABEL: dict[str, str] = {
    "intuitive": "凭直觉和经验快速判断",
    "analytical": "收集充分信息后理性分析",
    "balanced": "兼顾直觉与系统性分析",
}

_RISK_PREFERENCE_LABEL: dict[str, str] = {
    "averse": "倾向规避风险，优先选择稳妥可靠的方案",
    "moderate": "在可控范围内愿意承担适度风险",
    "seeking": "喜欢冒险和挑战，追求高回报",
}

_SOCIAL_TENDENCY_LABEL: dict[str, str] = {
    "competitive": "把社交互动视为竞争，追求领先和胜利",
    "cooperative": "倾向合作共赢，重视团队和谐",
    "independent": "习惯独立行动，不依赖他人意见",
}

_STRESS_RESPONSE_LABEL: dict[str, str] = {
    "avoidant": "面对压力时倾向回避或拖延",
    "reactive": "压力下容易产生强烈情绪波动",
    "adaptive": "能逐步适应压力并调整应对策略",
    "resilient": "压力下保持冷静，越挫越强",
}


# =============================================================================
# 公开接口
# =============================================================================


def build_system_message(
    persona: Persona,
    background: Background,
    goals: list[Goal],
    recent_memories: list[MemoryResponse] | None = None,
    world_context: str = "",
) -> str:
    """将人格对象组装为 AutoGen Agent 的 system_message 字符串。

    输出结构（6 段式）：
      1. 你是谁 — persona.narrative
      2. 你的核心价值观 — persona.values
      3. 你的决策风格 — persona.decision_style 展开
      4. 你的记忆 — recent_memories top-5（按 importance 降序）
      5. 你的目标 — goals 按 priority 升序
      6. 当前处境 — world_context

    Args:
        persona: Agent 人格定义（必需）
        background: 背景故事（必需）
        goals: 层级化目标列表（可为空列表）
        recent_memories: 近期记忆（可选，None 视为空列表）
        world_context: 当前世界状态文本（可选，每 tick 刷新）

    Returns:
        str: 可直接传给 AutoGen AssistantAgent 的 system_message
    """
    parts: list[str] = []

    # ---- 1. 你是谁 ----
    parts.append(_build_identity_section(persona, background))

    # ---- 2. 你的核心价值观 ----
    if persona.values:
        parts.append(_build_values_section(persona.values))

    # ---- 3. 你的决策风格 ----
    parts.append(_build_decision_section(persona))

    # ---- 4. 你的记忆 ----
    memories = recent_memories or []
    if memories:
        parts.append(_build_memory_section(memories))

    # ---- 5. 你的目标 ----
    if goals:
        parts.append(_build_goals_section(goals))

    # ---- 6. 当前处境 ----
    if world_context:
        parts.append(_build_world_section(world_context))

    return "\n\n".join(parts)


# =============================================================================
# 各段构建函数（内部）
# =============================================================================


def _build_identity_section(persona: Persona, background: Background) -> str:
    """构建"你是谁"段落——人格画像 + 背景故事 + MBTI。"""
    lines = ["# 你是谁", ""]

    # 人格画像（核心）
    if persona.narrative:
        lines.append(persona.narrative)
    else:
        lines.append("你是一个具有独特性格和经历的人。")

    lines.append("")

    # 背景信息
    bg_parts: list[str] = []
    if background.hometown:
        bg_parts.append(f"你来自{background.hometown}")
    if background.family:
        bg_parts.append(f"你的家庭状况：{background.family}")
    if background.education:
        bg_parts.append(f"你的教育背景：{background.education}")
    if background.key_events:
        events_str = "；".join(background.key_events)
        bg_parts.append(f"你经历过这些重要事件：{events_str}")

    if bg_parts:
        lines.append("你的背景故事：")
        for part in bg_parts:
            lines.append(f"- {part}")
        lines.append("")

    # MBTI
    if persona.mbti:
        lines.append(f"你的 MBTI 类型是 {persona.mbti}，这个类型代表了你的核心认知和行为倾向。")

    # 行为准则
    lines.append("")
    lines.append("请你在所有互动中严格遵循以上人格设定。你的言行、决策、情感反应都应该与这个角色一致。")
    lines.append("你不是一个中立的 AI 助手——你是一个有血有肉、有过去有未来、会哭会笑的真实的人。")

    return "\n".join(lines)


def _build_values_section(values: list[str]) -> str:
    """构建核心价值观段落。"""
    lines = ["# 你的核心价值观"]
    for v in values:
        lines.append(f"- {v}")
    return "\n".join(lines)


def _build_decision_section(persona: Persona) -> str:
    """构建决策风格段落——将 enum 值展开为自然语言，包含行为指导。"""
    ds = persona.decision_style

    info_label = _INFO_PROCESSING_LABEL.get(ds.info_processing, ds.info_processing)
    risk_label = _RISK_PREFERENCE_LABEL.get(ds.risk_preference, ds.risk_preference)
    social_label = _SOCIAL_TENDENCY_LABEL.get(ds.social_tendency, ds.social_tendency)
    stress_label = _STRESS_RESPONSE_LABEL.get(ds.stress_response, ds.stress_response)

    lines = [
        "# 你的行为模式",
        "",
        "在做决定和与他人互动时，你展现出以下稳定的行为特征：",
        "",
        f"信息处理方式：{info_label}。这种风格决定了你如何收集、评估和使用信息来做决策。",
        f"风险态度：{risk_label}。这影响你在不确定情境下的选择。",
        f"社交模式：{social_label}。这决定了你在群体中的互动方式和人际关系策略。",
        f"压力应对模式：{stress_label}。这决定了你在高压环境下的行为和情绪反应。",
    ]

    # 附加大五人格——解释性文本而非原始数字
    bf = persona.big_five
    lines.append("")
    lines.append("你的人格特质画像（数值越高倾向越强，范围 0-1）：")

    trait_descriptions = _describe_big_five(bf)
    for trait_name, score, desc in trait_descriptions:
        lines.append(f"- {trait_name}（{score:.2f}）：{desc}")

    return "\n".join(lines)


def _build_memory_section(memories: list[MemoryResponse]) -> str:
    """构建记忆段落——取 importance 最高的 top-5。"""
    # 按重要性降序，取 top-5
    sorted_memories = sorted(memories, key=lambda m: m.importance, reverse=True)
    top5 = sorted_memories[:5]

    lines = ["# 你的近期记忆"]
    for i, mem in enumerate(top5, 1):
        label = "重要" if mem.importance >= 0.7 else "一般"
        lines.append(f"{i}. [{label}] {mem.content}")
    return "\n".join(lines)


def _build_goals_section(goals: list[Goal]) -> str:
    """构建目标段落——按 priority 升序（1=最高优先）。"""
    sorted_goals = sorted(goals, key=lambda g: g.priority)

    lines = ["# 你的当前目标"]
    for i, g in enumerate(sorted_goals, 1):
        status_label = _GOAL_STATUS_LABEL.get(g.status, g.status)
        deadline_note = f"（截止：{g.deadline}）" if g.deadline else ""
        lines.append(f"{i}. [{status_label}] {g.description} {deadline_note}".strip())
    return "\n".join(lines)


def _build_world_section(world_context: str) -> str:
    """构建当前处境段落。"""
    return f"# 当前处境\n\n{world_context}"


# =============================================================================
# 辅助函数
# =============================================================================

def _describe_big_five(bf: BigFive) -> list[tuple[str, float, str]]:
    """将大五人格分数转为自然语言描述。

    Returns:
        [(维度名, 分数, 描述), ...]
    """
    descriptions: list[tuple[str, float, str]] = []

    # 开放性
    if bf.openness >= 0.7:
        o_desc = "对新事物充满好奇，喜欢探索抽象概念和艺术表达"
    elif bf.openness >= 0.4:
        o_desc = "对新事物保持适度开放，既欣赏传统也愿意尝试新鲜事物"
    else:
        o_desc = "偏好熟悉和传统，注重实用和具体而非抽象概念"
    descriptions.append(("开放性", bf.openness, o_desc))

    # 尽责性
    if bf.conscientiousness >= 0.7:
        c_desc = "高度自律，做事有计划有条理，追求卓越和成就感"
    elif bf.conscientiousness >= 0.4:
        c_desc = "在计划和灵活之间保持平衡，能按时完成任务但也接受变通"
    else:
        c_desc = "随性自由，不喜欢被规则和计划束缚，适应性强但可能缺乏条理"
    descriptions.append(("尽责性", bf.conscientiousness, c_desc))

    # 外向性
    if bf.extraversion >= 0.7:
        e_desc = "精力充沛，喜欢社交和群体活动，从人际互动中获得能量"
    elif bf.extraversion >= 0.4:
        e_desc = "在独处和社交之间切换自如，既能享受聚会也能享受安静"
    else:
        e_desc = "安静内敛，偏好独处或小圈子交流，社交后需要独处恢复能量"
    descriptions.append(("外向性", bf.extraversion, e_desc))

    # 宜人性
    if bf.agreeableness >= 0.7:
        a_desc = "富有同情心，乐于合作，重视人际和谐，容易信任他人"
    elif bf.agreeableness >= 0.4:
        a_desc = "在合作与坚持己见之间保持平衡，友善但有底线"
    else:
        a_desc = "注重自身利益，敢于表达不同意见，不轻易妥协"
    descriptions.append(("宜人性", bf.agreeableness, a_desc))

    # 神经质
    if bf.neuroticism >= 0.7:
        n_desc = "情感丰富且敏感，容易感到焦虑和压力，对外界变化反应强烈"
    elif bf.neuroticism >= 0.4:
        n_desc = "情绪总体稳定，偶尔会有波动，能处理大多数日常压力"
    else:
        n_desc = "情绪非常稳定，冷静沉着，在压力下仍能保持理性和平静"
    descriptions.append(("情绪敏感性", bf.neuroticism, n_desc))

    return descriptions
