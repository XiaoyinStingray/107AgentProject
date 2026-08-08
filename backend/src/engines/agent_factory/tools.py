"""
Tool 注册体系 — Agent 可执行的"行动"函数，注册为 AutoGen Tool。

State 4 改造：
  - 保留模块级 stub tools → Arena/Bench 继续使用（向后兼容）
  - 新增 make_agent_tools(engine, agent_id) → 闭包 tools，捕获 WorldEngine 引用
  - 新增 make_team_tools(engine, agent_id) → Team 模式闭包 tools
  - WorldEngine.__init__ 中调用 make_agent_tools 为每个 agent 注入真实 tools

用法:
    from engines.agent_factory.tools import DEFAULT_AGENT_TOOLS
    agent = LifeAgent(..., tools=DEFAULT_AGENT_TOOLS)  # Arena/Bench 用

    from engines.agent_factory.tools import make_agent_tools
    tools = make_agent_tools(engine, agent_id)  # WorldEngine 用
"""

import uuid

from loguru import logger


# =============================================================================
# 模块级 Stub Tools — Arena / Bench 使用（向后兼容）
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


DEFAULT_AGENT_TOOLS: list = [send_message, think_aloud, set_goal, observe]

STUDY_SCENE_TOOLS: list = [
    send_message, think_aloud, set_goal, observe,
]

EMPTY_TOOLS: list = []


# =============================================================================
# State 4: 闭包 Tool 工厂 — WorldEngine 使用（产生真实副作用）
# =============================================================================


def make_agent_tools(engine, agent_id: str) -> list:
    """为指定 Agent 创建闭包 tool 集合——捕获 WorldEngine 引用。

    每个 tool 通过闭包访问 WorldEngine 实例，产生真实的副作用：
    - send_message → engine._pending_messages
    - set_goal → agent.goals
    - observe → 读取目标 agent 公开状态
    - think_aloud → engine._thought_log
    - write_note → agent._notes
    - read_notes → 从 agent._notes 读取

    Args:
        engine: WorldEngine 实例（提供 _find_agent_by_name 等方法）
        agent_id: 当前 Agent 的 UUID

    Returns:
        闭包 tool 函数列表
    """
    agent = engine.agents.get(agent_id)

    def _engine_alive() -> bool:
        """检查 engine 是否已被销毁。"""
        return getattr(engine, "world", None) is not None

    # ── send_message ──
    async def _send_message(target_name: str, content: str, tone: str = "neutral") -> str:
        if not _engine_alive():
            return "⚠️ 世界已结束。"
        if not target_name or not isinstance(target_name, str):
            return "❌ 请提供有效的目标名字。"
        if not content or not isinstance(content, str):
            return "❌ 消息内容不能为空。"
        target = engine._find_agent_by_name(target_name)
        if target is None:
            return f"❌ 找不到名为 {target_name} 的人。请检查名字是否正确。"
        pending = getattr(engine, "_pending_messages", None)
        if pending is not None:
            pending.append({
                "from": agent_id,
                "to": target.id,
                "from_name": agent.persona.name if agent else agent_id,
                "to_name": target_name,
                "content": content,
                "tone": tone,
                "tick": engine.current_tick,
            })
        return f"✅ 消息已发送给 {target_name}。对方将在本回合内看到。"

    # ── think_aloud ──
    async def _think_aloud(thought: str) -> str:
        if not _engine_alive():
            return "⚠️ 世界已结束。"
        if not thought or not isinstance(thought, str):
            return "🤔 （空想）"
        thought_log = getattr(engine, "_thought_log", None)
        if thought_log is not None:
            thought_log.setdefault(agent_id, []).append({
                "tick": engine.current_tick,
                "thought": thought,
            })
        return f"🤔 思考已记录。"

    # ── set_goal ──
    async def _set_goal(description: str, priority: int = 1) -> str:
        if not _engine_alive():
            return "⚠️ 世界已结束。"
        if agent is None:
            return "❌ Agent 未找到。"
        if not description or not isinstance(description, str):
            return "❌ 请提供有效的目标描述。"
        # 去重：检查是否已有同名目标
        for g in agent.goals:
            if g.description == description:
                g.status = "active"
                g.progress = 0.0
                logger.debug(f"[tool] set_goal: agent={agent_id[:8]} re-set goal='{description}'")
                return f"✅ 目标已更新（优先级 {priority}）：{description}"
        from models.agent import Goal
        new_goal = Goal(
            id=str(uuid.uuid4()),
            description=description,
            priority=priority,
            status="active",
        )
        agent.goals.append(new_goal)
        engine._goal_check_pending = True
        return f"✅ 新目标已设定（优先级 {priority}）：{description}"

    # ── observe ──
    async def _observe(target: str) -> str:
        target_agent = engine._find_agent_by_name(target)
        if target_agent:
            state_lines = [
                f"📍 位置: {getattr(target_agent, 'position', '未知')}",
                f"😊 情绪: {target_agent.emotional_state.label}",
                f"⚡ 能量: {target_agent.energy:.0f}",
            ]
            state = "\n".join(state_lines)
            return f"🔍 {target} 的当前状态：\n{state}"
        return f"🔍 你观察了周围，{target} 一切如常。"

    # ── write_note (Step 78) ──
    async def _write_note(content: str) -> str:
        if not _engine_alive():
            return "⚠️ 世界已结束。"
        if agent is None:
            return "❌ 无法记录笔记。"
        if not content or not isinstance(content, str):
            return "❌ 笔记内容不能为空。"
        agent._notes.append({"tick": engine.current_tick, "content": content})
        if len(agent._notes) > 100:
            agent._notes = agent._notes[-100:]
        return f"📝 笔记已记录（共 {len(agent._notes)} 条）"

    # ── move_to (Step 81) ──
    async def _move_to(tile_x: int, tile_y: int) -> str:
        """移动到场景中的指定坐标。仅在场景模式（M11）下可用。"""
        bridge = getattr(engine, "scene_bridge", None)
        if bridge is None:
            return "⚠️ 移动功能仅在场景模式下可用。"
        ok = bridge.move_agent(agent_id, tile_x, tile_y)
        if ok:
            return f"🚶 已移动到 ({tile_x}, {tile_y})。"
        return "❌ 移动失败。"

    # ── interact_with (Step 81) ──
    async def _interact_with(target_name: str, action: str = "talk") -> str:
        """与场景中的物品或人互动。仅在场景模式下可用。"""
        bridge = getattr(engine, "scene_bridge", None)
        if bridge is None:
            return "⚠️ 互动功能仅在场景模式下可用。"
        target = engine._find_agent_by_name(target_name)
        if target:
            return f"🔧 你与 {target_name} 互动（{action}）。"
        return f"🔧 你尝试与 {target_name} {action}，但没找到。"

    # ── read_notes (Step 78) ──
    async def _read_notes(limit: int = 5) -> str:
        if agent is None:
            return "📝 无法读取笔记。"
        recent = agent._notes[-limit:]
        if not recent:
            return "📝 暂无笔记。"
        lines = [f"- [Tick {n['tick']}] {n['content']}" for n in reversed(recent)]
        return "📝 你的最近笔记：\n" + "\n".join(lines)

    # ── web_search (Step 83) ──
    async def _web_search(query: str) -> str:
        """搜索互联网获取真实世界信息。"""
        from llm.search import web_search, format_search_results
        results = await web_search(query, max_results=3)
        return format_search_results(results)

    return [_send_message, _think_aloud, _set_goal, _observe,
            _write_note, _read_notes, _move_to, _interact_with, _web_search]


