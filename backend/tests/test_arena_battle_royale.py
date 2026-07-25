"""Step 46 大乱斗引擎测试 — Mock GroupChat 与 Mock 裁判。"""

import pytest

from engines.arena.scoring import BattleRanking
from tests.test_arena_engine import MockModelClient, make_agent


class FakeMessage:
    def __init__(self, content: str, source: str):
        self.content = content
        self.source = source


class FakeRunResult:
    def __init__(self, messages: list[FakeMessage]):
        self.messages = messages


class FakeGroupChat:
    stage_sizes: list[int] = []

    def __init__(self, participants, max_turns):
        self.participants = participants
        self.max_turns = max_turns
        self.stage_sizes.append(max_turns)

    async def run(self, task=None, cancellation_token=None):
        return FakeRunResult([
            FakeMessage(f"{participant.name} 的阶段方案", participant.name)
            for participant in self.participants
        ])


@pytest.mark.asyncio
async def test_battle_royale_eliminates_half_until_one(monkeypatch):
    """六名参赛者按 6→3→2→1 完成三个自由竞争阶段。"""
    from autogen_agentchat import teams as teams_module
    from engines.arena.engine import ArenaEngine

    agents = [
        make_agent(f"agent-{index}", f"参赛者{index}")
        for index in range(6)
    ]
    engine = ArenaEngine(MockModelClient())

    async def rank_battle(topic, survivors, transcript, survivor_count):
        scores = {
            agent.id: float(40 - index)
            for index, agent in enumerate(survivors)
        }
        return BattleRanking(
            ranked_ids=[agent.id for agent in survivors],
            scores=scores,
            score_breakdown={
                agent.id: {
                    "argument_quality": 8,
                    "expression": 8,
                    "adaptability": 8,
                    "character_consistency": 8,
                }
                for agent in survivors
            },
            reasoning=f"保留前 {survivor_count} 人",
        )

    FakeGroupChat.stage_sizes = []
    monkeypatch.setattr(teams_module, "RoundRobinGroupChat", FakeGroupChat)
    monkeypatch.setattr(engine.scorer, "rank_battle", rank_battle)

    result = await engine.run_battle_royale(agents, "测试主题")

    assert FakeGroupChat.stage_sizes == [6, 3, 2]
    assert result.rounds == 3
    assert result.winner_id == agents[0].id
    assert result.participant_ids == [agent.id for agent in agents]
    assert len(result.transcript) == 11
    assert {entry.speaker_id for entry in result.transcript} == {
        agent.id for agent in agents
    }
    assert all(entry.stage_score is not None for entry in result.transcript)
    assert all(entry.stage_rank is not None for entry in result.transcript)
    assert [
        sum(
            entry.advanced is True
            for entry in result.transcript
            if entry.round == stage
        )
        for stage in (1, 2, 3)
    ] == [3, 2, 1]
    assert result.mode.value == "battle_royale"


@pytest.mark.asyncio
@pytest.mark.parametrize("count", [5, 9])
async def test_battle_royale_rejects_invalid_agent_count(count):
    """引擎边界与请求模型一致，只接受 6–8 人。"""
    from engines.arena.engine import ArenaEngine

    agents = [
        make_agent(f"agent-{index}", f"参赛者{index}")
        for index in range(count)
    ]
    engine = ArenaEngine(MockModelClient())
    with pytest.raises(ValueError, match="6–8"):
        await engine.run_battle_royale(agents, "测试主题")
