"""ArenaEngine.run_debate 集成测试 — Mock AutoGen GroupChat。"""

import json

import pytest

from tests.test_arena_engine import MockModelClient, make_agent


class FakeRunResult:
    def __init__(self, messages):
        self.messages = messages


class FakeMessage:
    def __init__(self, content, source):
        self.content = content
        self.source = source


def make_group_chat(group_chat_config):
    class FakeGroupChat:
        def __init__(self, **kwargs):
            group_chat_config.update(kwargs)

        async def run(self, task=None, cancellation_token=None):
            return FakeRunResult([
                FakeMessage("正方立论：AI不会取代人类", "小明"),
                FakeMessage("反方立论：我认为有可能", "小红"),
                FakeMessage("裁判：双方表现不错", "judge"),
            ])

    return FakeGroupChat


class TestRunDebate:
    @pytest.mark.asyncio
    async def test_run_debate_returns_result(self):
        """辩手参加 RoundRobin，裁判仅在辩论完成后评分。"""
        from engines.arena.engine import ArenaEngine, ArenaResult
        import autogen_agentchat.teams as teams_mod

        group_chat_config = {}
        fake_group_chat = make_group_chat(group_chat_config)

        judge_response = json.dumps({
            "agent_a_score": 30,
            "agent_b_score": 20,
            "winner": "A",
            "reasoning": "正方论据充分",
        })
        client = MockModelClient(judge_response)
        engine = ArenaEngine(client)
        agent_a = make_agent("id-a", "小明")
        agent_b = make_agent("id-b", "小红")

        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(teams_mod, "RoundRobinGroupChat", fake_group_chat)
            result = await engine.run_debate(
                agent_a, agent_b, topic="AI会取代人类吗", rounds=2
            )

        assert isinstance(result, ArenaResult)
        assert result.winner_id == "id-a"
        assert result.scores["id-a"] == 30
        assert result.topic == "AI会取代人类吗"
        assert result.rounds == 2
        assert group_chat_config["participants"] == [
            agent_a.autogen_agent,
            agent_b.autogen_agent,
        ]
        assert group_chat_config["max_turns"] == 4
        assert len(result.transcript) == 2
        assert all(item["speaker"] != "judge" for item in result.transcript)
        assert client.call_count == 1
        assert result.mode.value == "debate"

    @pytest.mark.asyncio
    async def test_run_debate_error_returns_graceful_result(self):
        """GroupChat 崩溃时返回错误结果而非异常穿透。"""
        from engines.arena.engine import ArenaEngine, ArenaResult
        import autogen_agentchat.teams as teams_mod

        class FakeGroupChat:
            def __init__(self, **kwargs):
                pass

            async def run(self, task=None, cancellation_token=None):
                raise RuntimeError("AutoGen 内部错误")

        engine = ArenaEngine(MockModelClient())
        agent_a = make_agent("id-a", "小明")
        agent_b = make_agent("id-b", "小红")

        with pytest.MonkeyPatch.context() as patch:
            patch.setattr(teams_mod, "RoundRobinGroupChat", FakeGroupChat)
            result = await engine.run_debate(agent_a, agent_b, topic="测试话题")

        assert isinstance(result, ArenaResult)
        assert result.winner_id == ""
        assert result.scores["id-a"] == 0
        assert "出错" in result.judge_reasoning
