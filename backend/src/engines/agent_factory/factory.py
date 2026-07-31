"""
Agent 工厂 — Persona + LLM Client → LifeAgent（AutoGen AssistantAgent 封装）。

核心接口:
    factory = AgentFactory(model_client)
    agent = await factory.create_from_description("内向的程序员")
    # → LifeAgent(id=..., persona=..., _agent=AssistantAgent)

依赖:
    - engines.persona: PersonaBuilder, build_system_message
    - models.agent: Persona, Background, Goal, EmotionalState
    - autogen_agentchat: AssistantAgent
"""

import uuid
from datetime import datetime, timezone

from loguru import logger

from models.agent import AgentResponse, Background, EmotionalState, Goal, Persona
from models.memory import MemoryResponse
from engines.persona.builder import PersonaBuilder
from engines.persona.prompt_templates import build_core_system_message, build_context_message, build_system_message
from engines.agent_factory.tools import DEFAULT_AGENT_TOOLS


# =============================================================================
# 辅助函数
# =============================================================================


def _build_goal_context_text(goals: list[Goal]) -> str:
    """构建活跃目标摘要文本——追加到每 tick 的 UserMessage 中。

    确保 Agent 在 continuous mode 下能"看到"自己设定或变更的目标，
    因为 system prompt 已冻结不再重建。
    """
    active_goals = [g for g in goals if g.status in ("active", "in_progress")]
    if not active_goals:
        return ""
    lines = ["\n# 你的活跃目标"]
    for g in sorted(active_goals, key=lambda x: x.priority):
        progress_str = f" (进度: {g.progress:.0%})" if g.progress > 0 else ""
        lines.append(f"- [{g.status}] {g.description}{progress_str}")
    return "\n".join(lines)


# =============================================================================
# LifeAgent — AutoGen AssistantAgent 的薄封装
# =============================================================================


class LifeAgent:
    """一个自主 Agent 实体——AutoGen AssistantAgent 的薄封装。

    职责:
        - 保管 Agent 的静态身份（Persona, Background, Goals）
        - 保管 Agent 的动态状态（EmotionalState, energy）
        - 封装 AutoGen AssistantAgent，提供统一的系统提示刷新接口
    """

    def __init__(
        self,
        id: str,
        persona: Persona,
        background: Background,
        goals: list[Goal],
        model_client,  # AutoGen ChatCompletionClient（Any 以避免启动时的 import）
        tools: list | None = None,
    ):
        self.id = id
        self.persona = persona
        self.background = background
        self.goals = goals
        self.emotional_state = EmotionalState()
        self.energy = 100.0
        self.created_at = datetime.now(timezone.utc).isoformat()
        self.updated_at = self.created_at
        self._model_client = model_client

        # === State 4 新增字段 ===
        self._notes: list[dict] = []          # Step 78: 私有笔记
        self._context_count = 0                # 追踪追加的上下文消息数
        self._COMPRESS_THRESHOLD = 20          # 超过此数触发 LLM 压缩
        self._base_system_message: str = ""    # 仅含人格的 system prompt（初始化后不变）

        # === 构建 AutoGen AssistantAgent ===
        from autogen_agentchat.agents import AssistantAgent

        self._base_system_message = build_core_system_message(persona, background, goals)
        # AutoGen 要求 agent name 是合法的 Python 标识符
        agent_name = f"agent_{id.replace('-', '')[-8:]}"
        display_name = persona.name or id
        role_description = f"{display_name}：{persona.narrative[:160]}"

        self._agent = AssistantAgent(
            name=agent_name,
            model_client=model_client,
            description=role_description,
            system_message=self._base_system_message,
            tools=tools or [],
            reflect_on_tool_use=True,
            max_tool_iterations=3,
        )

        logger.info(f"LifeAgent created: id={id}, name={agent_name}, mbti={persona.mbti}")

    # -------------------------------------------------------------------------
    # 公开接口
    # -------------------------------------------------------------------------

    @property
    def autogen_agent(self):
        """暴露底层 AutoGen Agent 给 GroupChat / world engine。

        Returns:
            AssistantAgent: AutoGen 的 AssistantAgent 实例
        """
        return self._agent

    @property
    def model_client(self):
        """Expose the shared model client for AutoGen team orchestration."""
        return self._model_client

    # ─────────────────────────────────────────────────────────────────
    # AutoGen 访问适配层（封装私有 API 访问，集中管理）
    # ─────────────────────────────────────────────────────────────────

    def _get_autogen_system_messages(self):
        """获取 AutoGen Agent 的 system message 列表。"""
        return self._agent._system_messages  # noqa: SLF001

    def _set_autogen_system_message(self, msg):
        """设置 AutoGen Agent 的 system message。"""
        from autogen_core.models import SystemMessage
        self._agent._system_messages = [SystemMessage(content=msg)]  # noqa: SLF001

    def _get_autogen_model_messages(self) -> list:
        """获取 AutoGen Agent 内部消息缓冲。"""
        ctx = getattr(self._agent, "_model_context", None)  # noqa: SLF001
        if ctx is None:
            return []
        msgs = getattr(ctx, "_messages", None)  # noqa: SLF001
        if msgs is not None:
            return msgs
        # 有些 AutoGen 版本用 _items 存储消息
        items = getattr(ctx, "_items", None)  # noqa: SLF001
        return items if items is not None else []

    def _add_autogen_model_message(self, msg) -> None:
        """向 AutoGen Agent 内部消息缓冲追加一条消息。

        直接操作内部 _messages/_items 列表——避免 async add_message 调用的复杂性。
        兼容使用 _messages 或 _items 的 AutoGen 版本。
        """
        ctx = getattr(self._agent, "_model_context", None)  # noqa: SLF001
        if ctx is None:
            return
        msgs = getattr(ctx, "_messages", None)  # noqa: SLF001
        if msgs is not None:
            msgs.append(msg)
            return
        # 有些 AutoGen 版本用 _items 存储消息
        items = getattr(ctx, "_items", None)  # noqa: SLF001
        if items is not None:
            items.append(msg)

    def _clear_autogen_model_messages(self) -> None:
        """清空 AutoGen Agent 内部消息缓冲。"""
        msgs = self._get_autogen_model_messages()
        if isinstance(msgs, list):
            msgs.clear()

    # ─────────────────────────────────────────────────────────────────
    # 公开接口
    # ─────────────────────────────────────────────────────────────────

    def inject_context(self, world_state: str,
                       memories: list[MemoryResponse] | None = None,
                       mode: str = "replace"):
        """每 tick 前注入世界状态和近期记忆。

        双模式：
        - mode="replace"（默认）：替换 system message + 清空消息历史。
          Arena/Bench 使用——每次是独立的一次性对话。
        - mode="continuous"：追加 UserMessage 到消息历史末尾，
          不覆盖 system prompt。WorldEngine 使用——Agent 保持连续意识流。

        Args:
            world_state: 当前世界上下文文本
            memories: 近期记忆列表（可选）
            mode: "replace" | "continuous"
        """
        if mode == "continuous":
            self._inject_context_continuous(world_state, memories)
        else:
            self._inject_context_replace(world_state, memories)

    def _inject_context_replace(self, world_state: str,
                                 memories: list[MemoryResponse] | None):
        """mode="replace"：当前行为——覆盖 system prompt + 清空历史。"""
        from autogen_core.models import SystemMessage

        new_msg = build_system_message(
            self.persona, self.background, self.goals,
            recent_memories=memories, world_context=world_state,
        )
        self._agent._system_messages = [SystemMessage(content=new_msg)]  # noqa: SLF001
        self._clear_autogen_model_messages()

    def _inject_context_continuous(self, world_state: str,
                                    memories: list[MemoryResponse] | None):
        """mode="continuous"：追加 UserMessage，不覆盖 system prompt。

        上下文消息包含：世界状态 + 近期记忆 + 笔记 + 活跃目标摘要。
        确保 Agent 能看到自己设定或变更的目标。
        """
        from autogen_core.models import UserMessage

        # 确保 notes 是合法列表
        if not isinstance(self._notes, list):
            self._notes = []
        notes = self._notes[-5:] if self._notes else None
        context_text = build_context_message(
            world_state or "(世界状态加载中...)",
            memories or [],
            notes,
        )

        # 追加活跃目标摘要——set_goal 在 system prompt 中不可见时补偿
        if self.goals:
            goals_text = _build_goal_context_text(self.goals)
            if goals_text:
                context_text += goals_text

        self._add_autogen_model_message(
            UserMessage(content=context_text, source="world")
        )
        self._context_count += 1
        if self._context_count >= self._COMPRESS_THRESHOLD:
            self._compress_history()

    def _compress_history(self) -> None:
        """当消息历史超过阈值时压缩。

        P0 策略：保留最近 50% 的消息（含 system message），丢弃旧消息。
        P1 升级：LLM 摘要旧消息 → 一条压缩消息替换前半。

        _context_count 追踪的是 inject_context 调用次数，
        压缩后按比例缩放——old占half/total，保留其中的context占比。
        """
        msgs = self._get_autogen_model_messages()
        if len(msgs) <= self._COMPRESS_THRESHOLD:
            return
        total = len(msgs)
        half = total // 2
        kept = msgs[half:]
        # _context_count 按保留比例缩放（非精确，但不会加速漂移）
        self._context_count = max(1, int(self._context_count * len(kept) / total))
        self._clear_autogen_model_messages()
        for m in kept:
            self._add_autogen_model_message(m)
        logger.info(
            f"LifeAgent._compress_history: {self.id[:8]} "
            f"compressed {total}→{len(kept)} messages, "
            f"context_count: {self._context_count}"
        )

    def rebuild_system_message(self):
        """重新构建 system message（当 persona/goals 变更时调用）。"""
        self._base_system_message = build_core_system_message(
            self.persona, self.background, self.goals,
        )
        self._set_autogen_system_message(self._base_system_message)

    # -------------------------------------------------------------------------
    # 便利方法
    # -------------------------------------------------------------------------

    def to_response(self) -> AgentResponse:
        """导出为 AgentResponse（供 Phase 5 API 使用）。"""
        return AgentResponse(
            id=self.id,
            name=self.persona.name or self.id,
            persona=self.persona,
            background=self.background,
            goals=self.goals,
            emotional_state=self.emotional_state,
            energy=self.energy,
            notes=self._notes,
            created_at=self.created_at,
            updated_at=self.updated_at,
        )

    def _patch_tools(self, tools: list):
        """替换 Agent 的工具列表——不重建 AssistantAgent。

        直接修改 AutoGen 内部的 _tools 列表引用，
        避免 replace_tools 的销毁重建导致消息历史丢失。
        """
        self._agent._tools = tools  # noqa: SLF001
        logger.info(f"LifeAgent._patch_tools: {self._agent.name} → {len(tools)} tools")

    def replace_tools(self, tools: list):
        """替换 Agent 的工具集——Team 任务需切换到 TEAM_AGENT_TOOLS。

        ⚠️ 已弃用：请使用 _patch_tools 代替。
        保留向后兼容——内部委托给 _patch_tools + 重建 system message。
        """
        try:
            # 保存当前基础 system message（可能有增量修改）
            if self._agent._system_messages:  # noqa: SLF001
                self._base_system_message = self._agent._system_messages[0].content  # noqa: SLF001
        except Exception:
            pass
        self._patch_tools(tools)
        logger.info(f"LifeAgent.replace_tools: {self._agent.name} → {len(tools)} tools (deprecated, use _patch_tools)")

    def __repr__(self) -> str:
        return f"<LifeAgent id={self.id!r} name={self.persona.name!r}>"


# =============================================================================
# AgentFactory — 自然语言 / Persona → LifeAgent
# =============================================================================


class AgentFactory:
    """Agent 工厂：Persona + LLM Client → LifeAgent。

    两条路径:
        1. 自然语言描述 → PersonaBuilder → LifeAgent（铸造厂主流程）
        2. 已有 Persona + Background + Goals → LifeAgent（从数据库恢复）

    用法:
        factory = AgentFactory(model_client)

        # 路径 1: 从自然语言创建
        agent = await factory.create_from_description("内向的程序员")

        # 路径 2: 从持久化数据恢复
        agent = factory.create_from_persona(agent_id, persona, background, goals)
    """

    def __init__(self, model_client):
        """注入 LLM 客户端。

        Args:
            model_client: AutoGen ChatCompletionClient（同时用于 PersonaBuilder 和 AssistantAgent）
        """
        self.model_client = model_client
        self.persona_builder = PersonaBuilder(model_client)

    async def create_from_description(self, description: str) -> LifeAgent:
        """自然语言描述 → LifeAgent（完整流水线）。

        Step 03 (PersonaBuilder) → Step 04 (build_system_message) → AutoGen AssistantAgent

        Args:
            description: 自然语言描述，如 "来自小镇的计算机系新生，内向但野心大"

        Returns:
            LifeAgent: 可直接参与 GroupChat 的 Agent 实例

        Raises:
            ValueError: PersonaBuilder 两次尝试后仍无法生成有效人格
        """
        logger.info(f"AgentFactory.create_from_description: {description[:50]}...")
        result = await self.persona_builder.build(description)

        agent = LifeAgent(
            id=str(uuid.uuid4()),
            persona=result.persona,
            background=result.background,
            goals=result.goals,
            model_client=self.model_client,
            tools=DEFAULT_AGENT_TOOLS,
        )

        logger.info(f"AgentFactory created agent: {agent}")
        return agent

    def create_from_persona(
        self,
        agent_id: str,
        persona: Persona,
        background: Background,
        goals: list[Goal],
    ) -> LifeAgent:
        """已有 Persona → LifeAgent（从数据库恢复 / 手动构造）。

        Args:
            agent_id: 已有的 agent ID（数据库主键）
            persona: Persona 对象
            background: Background 对象
            goals: Goal 列表

        Returns:
            LifeAgent: 可直接参与 GroupChat 的 Agent 实例
        """
        logger.info(f"AgentFactory.create_from_persona: id={agent_id}, name={persona.name}")
        return LifeAgent(
            id=agent_id,
            persona=persona,
            background=background,
            goals=goals,
            model_client=self.model_client,
            tools=DEFAULT_AGENT_TOOLS,
        )
