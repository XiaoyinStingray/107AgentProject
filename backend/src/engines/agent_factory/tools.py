"""
Tool 注册体系 — Agent 可执行的"行动"函数，注册为 AutoGen Tool。

所有 Tool 目前是 stub——返回占位字符串。实际效果由 World Engine（Step 09）拦截
tool call 后应用（发送消息、更新关系、生成事件等）。

用法:
    from engines.agent_factory.tools import DEFAULT_AGENT_TOOLS

    agent = LifeAgent(..., tools=DEFAULT_AGENT_TOOLS)
"""

from loguru import logger


# =============================================================================
# 通用 Tool（所有 Agent 默认可用）
# =============================================================================


async def send_message(target_name: str, content: str, tone: str = "neutral") -> str:
    """向另一个 Agent 发送消息。

    Args:
        target_name: 目标 Agent 的名字
        content: 消息内容
        tone: 语气 (casual / formal / urgent / gentle / neutral)
    """
    logger.debug(f"[tool] send_message → {target_name}: {content[:50]}...")
    return f"消息已发送给 {target_name}"


async def think_aloud(thought: str) -> str:
    """记录内部独白——展示在思维流中。

    Args:
        thought: 你的内心想法（任意长度）
    """
    logger.debug(f"[tool] think_aloud: {thought[:50]}...")
    return f"思考已记录: {thought}"


async def set_goal(description: str, priority: int = 1) -> str:
    """设定一个新目标。

    Args:
        description: 目标描述
        priority: 优先级 (1=最高, 3=最低)
    """
    logger.debug(f"[tool] set_goal: priority={priority}, {description}")
    return f"新目标已设定: {description}"


async def observe(target: str) -> str:
    """专注观察某个人或事物，获取详细信息。

    Args:
        target: 观察对象（人名、地点、事物）
    """
    logger.debug(f"[tool] observe: {target}")
    return f"正在观察: {target}"


async def submit_deliverable(step_title: str, deliverable: str) -> str:
    """【团队任务】提交当前阶段的交付物。

    这不是"汇报进度"，而是提交实质性产出。deliverable 必须是可直接使用的结构化内容。

    调研类输出示例：
    | 选题名称 | 技术栈 | 难度 | 创新点 | 可行性 |
    |---------|--------|------|--------|--------|
    | 智能课表 | React+Node | 中 | AI推荐 | 高 |

    设计类输出示例：
    ## 方案：校园社交App
    **核心功能**：课表共享、二手交易、组队学习
    **技术选型**：Flutter + Go + PostgreSQL
    **风险点**：用户冷启动、实时消息成本

    Args:
        step_title: 步骤标题（必须与你分配到的任务标题一致）
        deliverable: 交付物——结构化内容，将直接汇入最终报告。留空表示不需要帮助
    """
    logger.info(f"[tool] submit_deliverable: {step_title} — {len(deliverable)} chars")
    return f"✅ 交付物已提交：{step_title}。内容已汇入报告。"


async def complete_step(step_title: str, result: str) -> str:
    """【已弃用】请使用 submit_deliverable 代替。"""
    return await submit_deliverable(step_title, result)


# =============================================================================
# Tool 集合
# =============================================================================

# 所有 Agent 默认可用的 tool 集合
DEFAULT_AGENT_TOOLS: list = [send_message, think_aloud, set_goal, observe]

async def finish_task(summary: str = "") -> str:
    """【团队任务】所有阶段完成后，调用此工具结束任务并生成最终报告。

    仅在以下情况下调用：
    - 你已完成所有分配给你的任务（submit_deliverable 已提交）
    - 你认为团队的所有阶段目标都已达成

    Args:
        summary: 任务完成的总体总结（可选）
    """
    logger.info(f"[tool] finish_task: {summary[:120] if summary else '无摘要'}")
    return "任务已标记完成。系统将生成最终报告。"


# Team 任务专用 tools——不需要 observe/set_goal
TEAM_AGENT_TOOLS: list = [send_message, think_aloud, submit_deliverable, finish_task]

# 保留旧名兼容
complete_step = submit_deliverable

# 场景特定 tool 集合——不同 Scenario 注册不同 tools
# （预留，后续 Step 按场景扩展）
STUDY_SCENE_TOOLS: list = [
    send_message,
    think_aloud,
    set_goal,
    observe,
    # study, skip_class, join_club, cheat 等场景相关 tool — 后续 Step 补充
]

# 空工具集——测试用
EMPTY_TOOLS: list = []
