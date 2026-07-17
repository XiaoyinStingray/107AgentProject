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


# =============================================================================
# Tool 集合
# =============================================================================

# 所有 Agent 默认可用的 tool 集合
DEFAULT_AGENT_TOOLS: list = [send_message, think_aloud, set_goal, observe]

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
