"""
build_system_message 单元测试 — 纯函数，不需要 Mock。
"""

import pytest

from models.agent import Background, BigFive, DecisionStyle, Goal, Persona
from models.memory import MemoryResponse


# =============================================================================
# 工厂函数——创建测试用的标准 Persona
# =============================================================================


def make_full_persona() -> Persona:
    """创建一个完整的 Persona —— 所有字段非空。"""
    return Persona(
        mbti="INTJ-T",
        big_five=BigFive(
            openness=0.7,
            conscientiousness=0.85,
            extraversion=0.25,
            agreeableness=0.5,
            neuroticism=0.6,
        ),
        values=["成就", "独立", "效率"],
        decision_style=DecisionStyle(
            info_processing="analytical",
            risk_preference="moderate",
            social_tendency="independent",
            stress_response="adaptive",
        ),
        narrative=(
            "小明是一个来自小镇的年轻人，高考全县第一的成绩让他进入了顶尖大学。"
            "他习惯独来独往，不太擅长社交，但内心对成功有着强烈的渴望。"
            "他相信努力可以改变命运，也因此对自己要求极其严格。"
            "夜深人静时，他会焦虑自己是否做得还不够好，但天亮后又会恢复冷静和理性。"
            "他喜欢用计划和目标来驱散不安——每一步都要在自己的掌控之中。"
        ),
    )


def make_full_background() -> Background:
    """创建完整的 Background。"""
    return Background(
        hometown="安徽某县城",
        family="父母务农，独生子",
        education="中科大计算机系大二",
        key_events=["高考全县第一", "大一编程比赛失利"],
    )


def make_goals() -> list[Goal]:
    """创建 3 个不同优先级的 Goal。"""
    return [
        Goal(id="g1", description="保研清华", priority=1, status="active"),
        Goal(id="g2", description="拿奖学金", priority=2, status="active"),
        Goal(id="g3", description="学会社交", priority=3, deadline="2026-12-31", status="active"),
    ]


def make_memories(agent_id: str = "a1") -> list[MemoryResponse]:
    """创建 7 条记忆——测试 top-5 截断。"""
    return [
        MemoryResponse(
            id="m1", agent_id=agent_id, type="episodic",
            content="开学第一天在宿舍见到了新室友",
            importance=0.3, keywords="宿舍", created_at="2026-07-01",
        ),
        MemoryResponse(
            id="m2", agent_id=agent_id, type="episodic",
            content="期中考试高数拿了满分",
            importance=0.9, keywords="考试", created_at="2026-07-05",
        ),
        MemoryResponse(
            id="m3", agent_id=agent_id, type="episodic",
            content="和同学一起参加了编程比赛",
            importance=0.6, keywords="比赛", created_at="2026-07-08",
        ),
        MemoryResponse(
            id="m4", agent_id=agent_id, type="semantic",
            content="数学是理解世界的语言",
            importance=0.4, keywords="数学", created_at="2026-07-10",
        ),
        MemoryResponse(
            id="m5", agent_id=agent_id, type="episodic",
            content="保研面试发挥出色，导师很满意",
            importance=0.95, keywords="保研", created_at="2026-07-12",
        ),
        MemoryResponse(
            id="m6", agent_id=agent_id, type="episodic",
            content="昨天午饭吃了麻辣烫",
            importance=0.1, keywords="日常", created_at="2026-07-15",
        ),
        MemoryResponse(
            id="m7", agent_id=agent_id, type="episodic",
            content="在图书馆遇到了一个有趣的人",
            importance=0.5, keywords="社交", created_at="2026-07-14",
        ),
    ]


# =============================================================================
# Happy path
# =============================================================================


def test_build_with_full_persona():
    """完整 Persona + Background + Goals → 800-1500 字符。"""
    from engines.persona.prompt_templates import build_system_message

    msg = build_system_message(
        make_full_persona(),
        make_full_background(),
        make_goals(),
    )

    assert 800 <= len(msg) <= 1500, f"期望 800-1500 字符，实际 {len(msg)}"
    # 关键内容检查
    assert "小明" in msg
    assert "INTJ-T" in msg
    assert "成就" in msg
    assert "保研清华" in msg


def test_build_includes_memory_section():
    """传入记忆 → prompt 中包含记忆段。"""
    from engines.persona.prompt_templates import build_system_message

    msg = build_system_message(
        make_full_persona(),
        make_full_background(),
        make_goals(),
        recent_memories=make_memories(),
    )

    assert "近期记忆" in msg
    assert "保研面试" in msg  # importance 0.95 → top-1
    assert "期中考试" in msg  # importance 0.9 → top-2


def test_build_includes_world_context_at_end():
    """world_context 出现在 prompt 末尾。"""
    from engines.persona.prompt_templates import build_system_message

    msg = build_system_message(
        make_full_persona(),
        make_full_background(),
        make_goals(),
        world_context="⏰ 第 5 个时间段\n📍 地点: 大学宿舍",
    )

    assert "当前处境" in msg
    assert msg.strip().endswith("大学宿舍")
    # 确保在末尾（最后出现）
    last_section_idx = msg.rfind("当前处境")
    goals_idx = msg.rfind("当前目标")
    assert last_section_idx > goals_idx


# =============================================================================
# 纯函数
# =============================================================================


def test_pure_function_same_input_same_output():
    """同一输入 → 完全相同输出。"""
    from engines.persona.prompt_templates import build_system_message

    p = make_full_persona()
    b = make_full_background()
    g = make_goals()

    msg1 = build_system_message(p, b, g)
    msg2 = build_system_message(p, b, g)
    msg3 = build_system_message(p, b, g)

    assert msg1 == msg2 == msg3


# =============================================================================
# 排序行为
# =============================================================================


def test_memories_sorted_by_importance_top5():
    """记忆按 importance 降序排列，只保留 top-5。"""
    from engines.persona.prompt_templates import build_system_message

    memories = make_memories()
    assert len(memories) == 7  # 确保超过 5 条

    msg = build_system_message(
        make_full_persona(),
        make_full_background(),
        make_goals(),
        recent_memories=memories,
    )

    # "保研面试"(0.95) 应该在 "期中考试"(0.9) 前面
    bao_pos = msg.find("保研面试")
    exam_pos = msg.find("期中考试")
    lunch_pos = msg.find("麻辣烫")  # importance 0.1，不应该出现
    assert bao_pos < exam_pos, "高 importance 的记忆应排在前面"
    assert lunch_pos == -1, "importance 0.1 的记忆不应出现在 top-5 中"


def test_goals_sorted_by_priority():
    """目标按 priority 升序排列。"""
    from engines.persona.prompt_templates import build_system_message

    goals = [
        Goal(id="g3", description="第三", priority=3, status="active"),
        Goal(id="g1", description="第一", priority=1, status="active"),
        Goal(id="g2", description="第二", priority=2, status="active"),
    ]

    msg = build_system_message(
        make_full_persona(),
        make_full_background(),
        goals,
    )

    pos1 = msg.find("第一")
    pos2 = msg.find("第二")
    pos3 = msg.find("第三")
    assert pos1 < pos2 < pos3, "目标应按 priority 升序排列"


# =============================================================================
# 边界情况
# =============================================================================


def test_empty_goals_no_crash():
    """空 goals 列表不崩溃。"""
    from engines.persona.prompt_templates import build_system_message

    msg = build_system_message(
        make_full_persona(),
        make_full_background(),
        [],
    )
    assert "当前目标" not in msg  # 无目标时不输出目标段


def test_empty_values_no_crash():
    """空 values 列表不崩溃。"""
    from engines.persona.prompt_templates import build_system_message

    p = make_full_persona()
    p.values = []

    msg = build_system_message(p, make_full_background(), make_goals())
    assert "核心价值观" not in msg


def test_minimal_persona_no_crash():
    """几乎所有字段为默认值的 Persona 不崩溃。"""
    from engines.persona.prompt_templates import build_system_message

    msg = build_system_message(
        Persona(),  # 全默认值
        Background(),  # 全空
        [],
    )
    assert len(msg) > 0
    assert "MBTI" in msg  # 即使 narrative 为空，mbti 默认值仍会输出


def test_none_memories_treated_as_empty():
    """recent_memories=None 等同空列表。"""
    from engines.persona.prompt_templates import build_system_message

    msg = build_system_message(
        make_full_persona(),
        make_full_background(),
        make_goals(),
        recent_memories=None,
    )
    assert "近期记忆" not in msg


def test_empty_world_context_not_appended():
    """空 world_context 不生成当前处境段。"""
    from engines.persona.prompt_templates import build_system_message

    msg = build_system_message(
        make_full_persona(),
        make_full_background(),
        make_goals(),
        world_context="",
    )
    assert "当前处境" not in msg


def test_mbti_in_output():
    """MBTI 类型出现在"你是谁"段。"""
    from engines.persona.prompt_templates import build_system_message

    p = make_full_persona()
    p.mbti = "ENFP-A"

    msg = build_system_message(p, make_full_background(), make_goals())
    assert "ENFP-A" in msg


def test_background_fields_in_identity_section():
    """背景信息出现在"你是谁"段。"""
    from engines.persona.prompt_templates import build_system_message

    msg = build_system_message(
        make_full_persona(),
        make_full_background(),
        make_goals(),
    )

    # 背景字段应该在"你是谁"段（第一个 # 段）
    identity_end = msg.find("# 你的")
    identity_section = msg[:identity_end] if identity_end > 0 else msg
    assert "安徽" in identity_section
    assert "中科大" in identity_section
    assert "高考全县第一" in identity_section
