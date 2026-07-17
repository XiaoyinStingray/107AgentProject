"""
内置场景模板 — P0 三个预设 Scenario 实例

下游 WorldEngine 通过 BUILTIN_SCENARIOS 或 get_scenario_by_name() 获取场景。
"""

from models.world import Scenario

# ── 新生报到 ────────────────────────────────────────────────────────────────
FRESHMAN_ORIENTATION = Scenario(
    name="新生报到",
    description=(
        "大学开学第一天，几个新生在宿舍相遇。"
        "陌生的环境、陌生的室友，每个人都带着不同的期待和不安。"
        "谁能最先打破沉默？谁会在第一周就找到自己的圈子？"
    ),
    time_range="1-20",
    initial_events=[
        "宿舍分配完成，4人一间",
        "新生入学教育下午2点开始",
    ],
    environment_params={"location": "大学宿舍", "weather": "晴"},
)

# ── 期末周 ──────────────────────────────────────────────────────────────────
FINAL_EXAM_WEEK = Scenario(
    name="期末周",
    description=(
        "期末考试周，图书馆座位紧张，压力山大。"
        "有人通宵刷题，有人临时抱佛脚，有人已经放弃了挣扎。"
        "在高压环境下，人与人之间的关系会如何变化？"
    ),
    time_range="1-30",
    initial_events=[
        "期末考表公布",
        "图书馆座位减少80%",
    ],
    environment_params={"location": "大学校园", "stress_level": "high"},
)

# ── 毕业选择 ────────────────────────────────────────────────────────────────
GRADUATION_CHOICE = Scenario(
    name="毕业选择",
    description=(
        "大四了，保研/考研/工作/出国……每个人都站在十字路口。"
        "曾经朝夕相处的朋友即将各奔东西，"
        "而每一个选择背后都藏着对未来的不同想象。"
    ),
    time_range="1-25",
    initial_events=[
        "保研名额公布",
        "秋招开始",
    ],
    environment_params={"location": "大学校园", "life_stage": "graduation"},
)

# ── 汇总 ────────────────────────────────────────────────────────────────────
BUILTIN_SCENARIOS: list[Scenario] = [
    FRESHMAN_ORIENTATION,
    FINAL_EXAM_WEEK,
    GRADUATION_CHOICE,
]


def get_scenario_by_name(name: str) -> Scenario | None:
    """按名称查找内置场景，找不到返回 None。"""
    for scenario in BUILTIN_SCENARIOS:
        if scenario.name == name:
            return scenario
    return None
