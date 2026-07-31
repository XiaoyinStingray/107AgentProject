"""Phase 16 SceneEngine 单元测试 — T5 Layer 1。"""

from unittest.mock import AsyncMock

import pytest

from engines.scene.engine import (
    AgentSpriteData,
    RandomEventEngine,
    SceneEngine,
    _mock_dialogue,
    detect_emotion,
)


def _agent(agent_id: str, *, x: int = 1, y: int = 2) -> AgentSpriteData:
    return AgentSpriteData(
        agentId=agent_id,
        name=f"Agent {agent_id}",
        emoji="🧑",
        color="#336699",
        tileX=x,
        tileY=y,
        action="idle",
        emotion="neutral",
    )


def test_scene_state_crud_and_scene_isolation():
    engine = SceneEngine()
    first = _agent("a")
    second = _agent("b", x=4, y=5)

    engine.update_state("library", [first])
    engine.add_agent("library", second)
    engine.update_state("dorm", [_agent("dorm-agent")])

    assert [agent.agentId for agent in engine.get_state("library")] == ["a", "b"]
    assert [agent.agentId for agent in engine.get_state("dorm")] == ["dorm-agent"]

    updated = _agent("a", x=8, y=9)
    updated.action = "walk"
    updated.emotion = "happy"
    engine.add_agent("library", updated)

    library_agent = engine.get_state("library")[0]
    assert (library_agent.tileX, library_agent.tileY) == (8, 9)
    assert library_agent.action == "walk"
    assert library_agent.emotion == "happy"

    engine.remove_agent("library", "b")
    assert [agent.agentId for agent in engine.get_state("library")] == ["a"]
    assert [agent.agentId for agent in engine.get_state("dorm")] == ["dorm-agent"]


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("天哪，这也太棒了", "happy"),
        ("怎么办，好像来不及了", "anxious"),
        ("我真的好累，想休息", "tired"),
        ("这是一句普通陈述", None),
    ],
)
def test_detect_emotion(text, expected):
    assert detect_emotion(text) == expected


def test_random_event_is_limited_to_the_requested_scene(monkeypatch):
    monkeypatch.setattr("engines.scene.engine.random.random", lambda: 0.9)
    monkeypatch.setattr(
        "engines.scene.engine.random.choice",
        lambda events: events[0],
    )

    event = RandomEventEngine.get_for_scene("library")

    assert event is not None
    assert event.scenes is None or "library" in event.scenes
    assert event.target in {"all", "random"}
    assert 1 <= event.intensity <= 3


def test_mock_dialogue_has_a_safe_fallback_for_unknown_agents():
    result = _mock_dialogue(
        "未知角色甲",
        "未知角色乙",
        "library",
        "neutral",
    )

    assert result["message"]
    assert result["emotion"] is None


@pytest.mark.anyio
async def test_scene_engine_delegates_dialogue_generation(monkeypatch):
    generator = AsyncMock(
        return_value={
            "message": "测试回复",
            "emotion": "happy",
            "source": "mock",
        },
    )
    monkeypatch.setattr(
        "engines.scene.engine.generate_dialogue_llm",
        generator,
    )
    engine = SceneEngine()

    result = await engine.generate_dialogue(
        "小林",
        "小红",
        "library",
        "上下文",
        "neutral",
    )

    assert result["message"] == "测试回复"
    generator.assert_awaited_once_with(
        "小林",
        "小红",
        "library",
        "上下文",
        "neutral",
    )
