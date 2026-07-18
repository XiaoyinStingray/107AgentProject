"""
AgentFactory + LifeAgent 单元测试 — Mock LLM + Mock AutoGen Client。
"""

import json

import pytest

from models.agent import Background, BigFive, DecisionStyle, Goal, Persona


# =============================================================================
# Mock LLM 客户端（复用 builder 测试的模式）
# =============================================================================


class _FakeCreateResult:
    """模拟 AutoGen CreateResult。"""

    def __init__(self, content: str):
        self.content = content


class MockLLMClient:
    """模拟 LLM 客户端——按预设 JSON 返回 Persona。"""

    # AutoGen AssistantAgent 在 __init__ 中检查此属性以判断模型是否支持 function calling
    model_info: dict = {"function_calling": True}

    def __init__(self, fixed_response: str | None = None):
        self._fixed = fixed_response
        self.call_count = 0
        self.last_messages: list | None = None

    async def create(self, messages):
        self.call_count += 1
        self.last_messages = messages
        if self._fixed is not None:
            return _FakeCreateResult(self._fixed)
        from engines.persona.builder import MOCK_PERSONA_JSON

        return _FakeCreateResult(json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False))


# =============================================================================
# Fixtures & Factory helpers
# =============================================================================


@pytest.fixture
def mock_client():
    return MockLLMClient()


@pytest.fixture
def factory(mock_client):
    from engines.agent_factory.factory import AgentFactory

    return AgentFactory(mock_client)


def make_persona() -> Persona:
    return Persona(
        name="小明",
        mbti="INTJ-T",
        big_five=BigFive(openness=0.7, conscientiousness=0.85, extraversion=0.25, agreeableness=0.5, neuroticism=0.6),
        values=["成就", "独立"],
        decision_style=DecisionStyle(
            info_processing="analytical", risk_preference="moderate",
            social_tendency="independent", stress_response="adaptive",
        ),
        narrative="小明是一个小镇青年...",
    )


def make_background() -> Background:
    return Background(
        hometown="安徽某县城", family="父母务农",
        education="中科大计算机系大二", key_events=["高考全县第一"],
    )


def make_goals() -> list[Goal]:
    return [Goal(id="g1", description="保研清华", priority=1, status="active")]


# =============================================================================
# Happy path — create_from_description
# =============================================================================


@pytest.mark.asyncio
async def test_create_from_description_returns_lifeagent(factory):
    """自然语言描述 → LifeAgent"""
    agent = await factory.create_from_description("小镇做题家，社交恐惧，想进大厂")

    assert agent.id != ""
    assert agent.persona.name == "小明"
    assert agent.persona.mbti == "INTJ-T"
    assert agent.background.hometown == "安徽某县城"
    assert len(agent.goals) == 1
    assert agent.emotional_state.valence == 0.5
    assert agent.energy == 100.0


@pytest.mark.asyncio
async def test_create_from_description_has_autogen_agent(factory):
    """LifeAgent 封装了 AutoGen AssistantAgent"""
    agent = await factory.create_from_description("测试角色")

    ag = agent.autogen_agent
    assert ag is not None
    assert ag.name == "小明"  # persona.name → agent name
    # system_message 由 build_system_message 生成，非空
    assert len(ag._system_messages) > 0
    assert "小明" in ag._system_messages[0].content


@pytest.mark.asyncio
async def test_create_from_description_persona_has_name(factory):
    """builder 生成的 persona.name 与 PersonaBuildResult.name 一致"""
    agent = await factory.create_from_description("测试")
    assert agent.persona.name == "小明"


# =============================================================================
# Happy path — create_from_persona
# =============================================================================


def test_create_from_persona_returns_lifeagent(factory):
    """已有 Persona → LifeAgent（从数据库恢复路径）"""
    agent = factory.create_from_persona(
        agent_id="existing-id-123",
        persona=make_persona(),
        background=make_background(),
        goals=make_goals(),
    )

    assert agent.id == "existing-id-123"
    assert agent.persona.name == "小明"
    assert agent.background.education == "中科大计算机系大二"


def test_create_from_persona_uses_persona_name_for_agent(factory):
    """AutoGen agent 的 name 来自 persona.name"""
    persona = make_persona()
    persona.name = "小红"

    agent = factory.create_from_persona(
        agent_id="a1", persona=persona,
        background=make_background(), goals=make_goals(),
    )
    assert agent.autogen_agent.name == "小红"


def test_create_from_persona_falls_back_to_id_when_name_empty(factory):
    """persona.name 为空时用 agent_id（sanitized）作为 AutoGen agent 的 name"""
    persona = make_persona()
    persona.name = ""

    agent = factory.create_from_persona(
        agent_id="agent_42", persona=persona,
        background=make_background(), goals=make_goals(),
    )
    assert agent.autogen_agent.name == "agent_42"


# =============================================================================
# inject_context
# =============================================================================


@pytest.mark.asyncio
async def test_inject_context_updates_system_message(factory):
    """inject_context 刷新系统提示"""
    agent = await factory.create_from_description("测试角色")
    original_msg = agent.autogen_agent._system_messages[0].content

    assert "当前处境" not in original_msg

    agent.inject_context(
        world_state="⏰ 第 5 个时间段\n📍 大学宿舍\n🌤️ 阴天",
    )
    new_msg = agent.autogen_agent._system_messages[0].content
    assert "当前处境" in new_msg
    assert "大学宿舍" in new_msg
    assert new_msg != original_msg


@pytest.mark.asyncio
async def test_inject_context_with_memories(factory):
    """inject_context 支持注入记忆"""
    from models.memory import MemoryResponse

    agent = await factory.create_from_description("测试角色")
    memories = [
        MemoryResponse(
            id="m1", agent_id=agent.id, type="episodic",
            content="在图书馆遇到了新朋友", importance=0.9,
            keywords="社交", created_at="2026-07-17",
        ),
    ]
    agent.inject_context(world_state="学期中", memories=memories)
    msg = agent.autogen_agent._system_messages[0].content
    assert "近期记忆" in msg
    assert "图书馆" in msg


# =============================================================================
# LifeAgent 初始状态
# =============================================================================


@pytest.mark.asyncio
async def test_lifeagent_default_emotional_state(factory):
    """新创建的 LifeAgent 情绪为 neutral"""
    agent = await factory.create_from_description("测试")

    es = agent.emotional_state
    assert es.valence == 0.5
    assert es.arousal == 0.5
    assert es.dominance == 0.5
    assert es.label == "neutral"


@pytest.mark.asyncio
async def test_lifeagent_full_energy(factory):
    """新创建的 LifeAgent 能量为 100"""
    agent = await factory.create_from_description("测试")
    assert agent.energy == 100.0


# =============================================================================
# to_response
# =============================================================================


@pytest.mark.asyncio
async def test_to_response_contains_all_fields(factory):
    """to_response 返回 API 所需全部字段"""
    agent = await factory.create_from_description("测试角色")

    resp = agent.to_response()
    assert resp.id == agent.id
    assert resp.name == agent.persona.name
    assert resp.energy == 100.0
    assert resp.emotional_state.label == "neutral"
    assert isinstance(resp.persona, Persona)
    assert isinstance(resp.background, Background)
    assert len(resp.goals) == 1
    assert resp.created_at  # 时间戳已初始化
    assert resp.updated_at
