"""
内置场景模板 — P0 三个预设 + 科大校园五个主题 Scenario 实例

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

# ── 科大图书馆 ──────────────────────────────────────────────────────────────
USTC_LIBRARY = Scenario(
    name="科大图书馆",
    description=(
        "西区图书馆自习，座位竞争激烈。"
        "占座潜规则盛行，早上七点就有人排队。"
        "谁能抢到靠窗的好位子？谁又会因为一杯咖啡被吵到崩溃？"
    ),
    time_range="1-20",
    initial_events=[
        "早上7点开门排队",
        "座位减少80%",
    ],
    environment_params={"location": "西区图书馆", "stress_level": "high"},
)

# ── 樱花大道 ────────────────────────────────────────────────────────────────
USTC_SAKURA = Scenario(
    name="樱花大道",
    description=(
        "每年樱花季，校园游客涌入。"
        "学术与浪漫并存，老北门前人流量大，拍照打卡不断。"
        "郭沫若广场、天使路上全是人，谁在赏花谁在凑热闹？"
    ),
    time_range="1-15",
    initial_events=[
        "樱花盛开",
        "游客涌入校园",
    ],
    environment_params={"location": "樱花大道", "weather": "晴", "season": "春"},
)

# ── 实验室组会 ──────────────────────────────────────────────────────────────
USTC_LAB_MEETING = Scenario(
    name="实验室组会",
    description=(
        "课题组周例会，导师 push vs 学生划水。"
        "科研楼实验室里，汇报压力与师门政治交织。"
        "谁准备了精美的 PPT？谁在最后一夜赶工？"
    ),
    time_range="1-12",
    initial_events=[
        "导师要求本周汇报进展",
        "PPT 截止日今天",
    ],
    environment_params={"location": "科研楼实验室", "stress_level": "high"},
)

# ── 选课大战 ────────────────────────────────────────────────────────────────
USTC_COURSE_WAR = Scenario(
    name="选课大战",
    description=(
        "每学期选课系统崩溃，好课秒没。"
        "资源竞争、策略博弈，有人提前写好脚本抢课，"
        "有人在论坛求转让名额。谁能选到心仪的课？"
    ),
    time_range="1-10",
    initial_events=[
        "选课系统开放",
        "热门课名额秒没",
    ],
    environment_params={"location": "线上+校园", "stress_level": "medium"},
)

# ── 科大健身房 ──────────────────────────────────────────────────────────────
USTC_GYM = Scenario(
    name="科大健身房",
    description=(
        "中区健身房，器材有限人多时得排队。"
        "社交与竞争并存，有人在跑步机上较劲，"
        "有人在器械区互相保护。谁在健身谁在社交？"
    ),
    time_range="1-15",
    initial_events=[
        "傍晚健身高峰",
        "跑步机全满",
    ],
    environment_params={"location": "中区健身房", "energy_level": "high"},
)


# ── 汇总 ────────────────────────────────────────────────────────────────────
BUILTIN_SCENARIOS: list[Scenario] = [
    FRESHMAN_ORIENTATION,
    FINAL_EXAM_WEEK,
    GRADUATION_CHOICE,
    USTC_LIBRARY,
    USTC_SAKURA,
    USTC_LAB_MEETING,
    USTC_COURSE_WAR,
    USTC_GYM,
]


def get_scenario_by_name(name: str) -> Scenario | None:
    """按名称查找内置场景，找不到返回 None。"""
    for scenario in BUILTIN_SCENARIOS:
        if scenario.name == name:
            return scenario
    return None
