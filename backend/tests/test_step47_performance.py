"""Step 47 LLM profile, context-budget, and client-routing tests."""

import pytest

from tests.world_engine_fixtures import (
    MockModelClient,
    db_session,
    engine,  # noqa: F401 - dependency fixture used by db_session
    make_agent,
    make_world,
)


class CapturingClient:
    """Capture constructor options without opening a real HTTP client."""

    def __init__(self, **options):
        self.options = options


def _capture_client(monkeypatch, profile: str = "think") -> CapturingClient:
    """Replace AutoGen's client class and return the configured fake client."""
    import autogen_ext.models.openai

    from llm.client import create_model_client

    monkeypatch.setattr(
        autogen_ext.models.openai,
        "OpenAIChatCompletionClient",
        CapturingClient,
    )
    return create_model_client(profile)  # type: ignore[arg-type,return-value]


def test_model_client_applies_think_and_act_temperatures(monkeypatch):
    """Each public profile should select its configured temperature."""
    from config import settings

    monkeypatch.setattr(settings, "llm_base_url", "https://provider.example/v1")
    monkeypatch.setattr(settings, "llm_temperature_think", 0.8)
    monkeypatch.setattr(settings, "llm_temperature_act", 0.5)

    assert _capture_client(monkeypatch, "think").options["temperature"] == 0.8
    assert _capture_client(monkeypatch, "act").options["temperature"] == 0.5


def test_deepseek_v4_disables_thinking_and_keeps_temperature(monkeypatch):
    """Non-thinking DeepSeek V4 requests should retain sampling temperature."""
    from config import settings

    monkeypatch.setattr(settings, "llm_base_url", "https://api.deepseek.com")
    monkeypatch.setattr(settings, "llm_model", "deepseek-v4-flash")
    monkeypatch.setattr(settings, "llm_thinking_enabled", False)

    client = _capture_client(monkeypatch, "act")

    assert client.options["temperature"] == settings.llm_temperature_act
    assert client.options["extra_body"] == {
        "thinking": {"type": "disabled"}
    }


def test_deepseek_v4_thinking_omits_ignored_temperature(monkeypatch):
    """Thinking-mode DeepSeek V4 requests should omit unsupported temperature."""
    from config import settings

    monkeypatch.setattr(settings, "llm_base_url", "https://api.deepseek.com")
    monkeypatch.setattr(settings, "llm_model", "deepseek-v4-flash")
    monkeypatch.setattr(settings, "llm_thinking_enabled", True)

    client = _capture_client(monkeypatch)

    assert "temperature" not in client.options
    assert client.options["extra_body"] == {"thinking": {"type": "enabled"}}


def test_model_client_rejects_unknown_profile(monkeypatch):
    """The public client factory should fail fast for an unknown profile."""
    with pytest.raises(ValueError, match="Unsupported LLM profile"):
        _capture_client(monkeypatch, "unknown")


def test_recent_world_context_is_bounded_and_uses_latest_events(db_session):
    """World context should omit older events and cap copied descriptions."""
    from engines.world.engine import WorldEngine
    from engines.world.state import RECENT_EVENT_CONTEXT_CHAR_LIMIT
    from models.event import SimEvent

    world_engine = WorldEngine(
        make_world(),
        [make_agent("a1", "小明")],
        db_session,
    )
    world_engine.events = [
        SimEvent(
            id=f"event-{index}",
            world_id="world-1",
            tick=index,
            type="agent_message",
            description=("旧事件" if index == 0 else f"事件{index}") + "字" * 400,
            created_at="2026-01-01",
        )
        for index in range(4)
    ]

    recent = world_engine._recent_events_text()

    assert "旧事件" not in recent
    assert all(f"事件{index}" in recent for index in (1, 2, 3))
    assert "…" in recent
    assert len(recent) <= RECENT_EVENT_CONTEXT_CHAR_LIMIT


def test_group_selector_uses_injected_act_client(db_session):
    """WorldEngine should route selector decisions through the act client."""
    from engines.world.engine import WorldEngine

    agents = [make_agent("a1", "陈默"), make_agent("a2", "苏瑶")]
    act_client = MockModelClient()

    team = WorldEngine(
        make_world(),
        agents,
        db_session,
        act_model_client=act_client,
    ).build_group_chat()

    assert team._model_client is act_client  # noqa: SLF001


@pytest.mark.asyncio
async def test_world_factory_creates_an_act_client(monkeypatch):
    """The production World factory should inject an act-profile client."""
    import api.worlds
    import llm.client

    profiles: list[str] = []
    act_client = MockModelClient()

    async def fake_rebuild(_agent_ids):
        return []

    def fake_create(profile="think"):
        profiles.append(profile)
        return act_client

    monkeypatch.setattr(api.worlds, "_rebuild_agents_from_db", fake_rebuild)
    monkeypatch.setattr(api.worlds, "async_session", lambda: object())
    monkeypatch.setattr(llm.client, "create_model_client", fake_create)

    world_engine = await api.worlds._build_world_engine(make_world())

    assert profiles == ["act"]
    assert world_engine._act_model_client is act_client  # noqa: SLF001


def test_arena_factory_creates_an_act_client(monkeypatch):
    """The production Arena factory should reserve act temperature for judging."""
    import api.arenas
    import llm.client

    profiles: list[str] = []
    act_client = MockModelClient()

    def fake_create(profile="think"):
        profiles.append(profile)
        return act_client

    monkeypatch.setattr(api.arenas, "_arena_engine", None)
    monkeypatch.setattr(llm.client, "create_model_client", fake_create)

    arena_engine = api.arenas.get_arena_engine()

    assert profiles == ["act"]
    assert arena_engine.model_client is act_client


@pytest.mark.asyncio
async def test_goal_checker_reuses_injected_act_client(db_session):
    """Goal scoring should use the injected act client instead of creating one."""
    from engines.world.engine import WorldEngine

    agent = make_agent("a1", "陈默")
    act_client = MockModelClient('[{"index":1,"score":0.8}]')
    world_engine = WorldEngine(
        make_world(),
        [agent],
        db_session,
        act_model_client=act_client,
    )

    scores = await world_engine._llm_check_goals(
        agent.persona.name,
        agent.goals,
        "我正在采取行动完成目标。",
    )

    assert scores == {"测试目标": 0.8}
    assert act_client.call_count == 1


def test_dynamic_context_preserves_the_cacheable_prompt_prefix():
    """Changing world state should leave the static system-prompt prefix intact."""
    from engines.persona.prompt_templates import build_system_message

    agent = make_agent("a1", "陈默")
    first = build_system_message(
        agent.persona,
        agent.background,
        agent.goals,
        world_context="第 1 个时间段",
    )
    second = build_system_message(
        agent.persona,
        agent.background,
        agent.goals,
        world_context="第 2 个时间段",
    )

    assert first.split("# 当前处境", 1)[0] == second.split("# 当前处境", 1)[0]
    assert first != second
