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
from engines.persona.prompt_templates import build_system_message
from engines.agent_factory.tools import DEFAULT_AGENT_TOOLS


# =============================================================================
# 辅助函数
# =============================================================================

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

        # === 构建 AutoGen AssistantAgent ===
        from autogen_agentchat.agents import AssistantAgent

        system_message = build_system_message(persona, background, goals)
        # AutoGen 要求 agent name 是合法的 Python 标识符
        agent_name = f"agent_{id.replace('-', '')[-8:]}"
        display_name = persona.name or id
        role_description = f"{display_name}：{persona.narrative[:160]}"

        self._agent = AssistantAgent(
            name=agent_name,
            model_client=model_client,
            description=role_description,
            system_message=system_message,
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

    def inject_context(self, world_state: str, memories: list[MemoryResponse] | None = None):
        """每 tick 前刷新系统提示——注入当前世界状态和近期记忆。

        Args:
            world_state: 当前世界上下文文本（如 "⏰ 第 5 个时间段\n📍 大学宿舍"）
            memories: 近期记忆列表（可选）
        """
        from autogen_core.models import SystemMessage

        new_msg = build_system_message(
            self.persona,
            self.background,
            self.goals,
            recent_memories=memories,
            world_context=world_state,
        )
        # AutoGen 0.7 的 AssistantAgent 用 _system_messages 列表存储 system prompt
        self._agent._system_messages = [SystemMessage(content=new_msg)]  # noqa: SLF001
        # 同时清空 AutoGen 内部消息缓冲——隔离不同 tick 的上下文
        try:
            if hasattr(self._agent, "_model_context"):
                ctx = self._agent._model_context  # noqa: SLF001
                if hasattr(ctx, "_messages"):
                    ctx._messages.clear()  # noqa: SLF001
        except Exception:
            pass

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
            created_at=self.created_at,
            updated_at=self.updated_at,
        )

    def replace_tools(self, tools: list):
        """替换 Agent 的工具集——Team 任务需切换到 TEAM_AGENT_TOOLS。"""
        from autogen_agentchat.agents import AssistantAgent

        old_name = self._agent.name
        old_desc = self._agent.description
        old_sys = self._agent._system_messages[0].content if self._agent._system_messages else ""

        self._agent = AssistantAgent(
            name=old_name,
            model_client=self._model_client,
            description=old_desc,
            system_message=old_sys,
            tools=tools or [],
            reflect_on_tool_use=True,
            max_tool_iterations=3,
        )
        logger.info(f"LifeAgent.replace_tools: {old_name} → {len(tools)} tools")

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
