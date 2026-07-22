"""Natural termination coverage for the WorldEngine group chat."""

import pytest

from tests.world_engine_fixtures import (  # noqa: F401
    MockModelClient,
    db_session,
    engine,
    make_agent,
    make_world,
)


def _set_model_client(agent, client) -> None:
    """Assign one deterministic client to the LifeAgent and AutoGen wrapper."""
    agent._model_client = client
    agent._agent._model_client = client


def test_end_tick_marker_is_hidden_from_non_stream_event(db_session):
    """Strip the internal termination marker before persistence."""
    from tests.world_engine_fixtures import FakeMessage

    from engines.world.engine import WorldEngine

    agent = make_agent("a1", "陈默")
    world_engine = WorldEngine(make_world(), [agent], db_session)
    message = FakeMessage("我先去复习了。[END_TICK]", agent.autogen_agent.name)

    event = world_engine._convert_message_to_event(message)

    assert event is not None
    assert event.description == "我先去复习了。"


@pytest.mark.asyncio
async def test_end_tick_stops_streamed_group_chat(db_session):
    """End one group tick early while retaining the outer World tick boundary."""
    from engines.world.engine import WorldEngine

    agents = [make_agent("a1", "陈默"), make_agent("a2", "苏瑶")]
    client = MockModelClient("本时间段先到这里。[END_TICK]")
    for agent in agents:
        _set_model_client(agent, client)

    world_engine = WorldEngine(make_world(), agents, db_session)
    events = [event async for event in world_engine.tick_stream()]
    messages = [event for event in events if event.type == "agent_message"]

    assert len(messages) == 1
    assert messages[0].source_agent_id == "a1"
    assert messages[0].description == "本时间段先到这里。"
    assert events[-1].type == "tick_boundary"
    assert world_engine.current_tick == 1
    assert client.call_count == 1
