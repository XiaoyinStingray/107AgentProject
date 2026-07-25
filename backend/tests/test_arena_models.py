"""Step 46 竞技类型、持久化序列化与战报单元测试。"""

import pytest
from pydantic import ValidationError

from engines.arena.report import build_arena_report
from models.arena import (
    ArenaCreateRequest,
    ArenaMode,
    ArenaResult,
    ArenaResultResponse,
    ArenaTranscriptEntry,
    BattleRoyaleRequest,
    MAX_ARENA_RESPONSE_CONTENT,
)
from models.arena_orm import ArenaRow


def make_result(content: str = "完整发言") -> ArenaResult:
    """创建可复用的完整竞技结果。"""
    return ArenaResult(
        winner_id="agent-a",
        scores={"agent-a": 32, "agent-b": 28},
        score_breakdown={
            "agent-a": {
                "argument_quality": 8,
                "expression": 8,
                "adaptability": 8,
                "character_consistency": 8,
            },
        },
        judge_reasoning="甲的回应更完整。",
        transcript=[ArenaTranscriptEntry(
            turn=0,
            round=1,
            speaker_id="agent-a",
            speaker="甲",
            content=content,
        )],
        topic="测试主题",
        participant_ids=["agent-a", "agent-b"],
        participant_names={"agent-a": "甲", "agent-b": "乙"},
    )


class TestArenaRequests:
    def test_duel_request_trims_topic(self):
        request = ArenaCreateRequest(
            agent_a_id="a",
            agent_b_id="b",
            topic="  测试主题  ",
        )
        assert request.topic == "测试主题"

    @pytest.mark.parametrize("topic", ["", "   "])
    def test_duel_rejects_blank_topic(self, topic):
        with pytest.raises(ValidationError):
            ArenaCreateRequest(
                agent_a_id="a",
                agent_b_id="b",
                topic=topic,
            )

    def test_duel_rejects_same_agent(self):
        with pytest.raises(ValidationError, match="两个不同"):
            ArenaCreateRequest(
                agent_a_id="same",
                agent_b_id="same",
                topic="测试",
            )

    def test_duel_rejects_battle_mode(self):
        with pytest.raises(ValidationError, match="battle_royale"):
            ArenaCreateRequest(
                mode=ArenaMode.BATTLE_ROYALE,
                agent_a_id="a",
                agent_b_id="b",
                topic="测试",
            )

    @pytest.mark.parametrize("count", [5, 9])
    def test_battle_rejects_out_of_range_counts(self, count):
        with pytest.raises(ValidationError):
            BattleRoyaleRequest(
                agent_ids=[f"a-{index}" for index in range(count)],
                topic="测试",
            )

    def test_battle_rejects_duplicate_agents(self):
        with pytest.raises(ValidationError, match="重复"):
            BattleRoyaleRequest(
                agent_ids=["a", "b", "c", "d", "e", "a"],
                topic="测试",
            )


class TestArenaStorageAndResponse:
    def test_response_caps_content_without_mutating_stored_result(self):
        content = "长" * (MAX_ARENA_RESPONSE_CONTENT + 100)
        result = make_result(content)
        response = ArenaResultResponse.from_result("arena-1", result)

        assert len(response.transcript[0].content) == MAX_ARENA_RESPONSE_CONTENT
        assert result.transcript[0].content == content

    def test_orm_round_trip_preserves_complete_result(self):
        result = make_result()
        restored = ArenaRow.from_result("arena-1", result).to_result()
        assert restored == result

    def test_report_contains_required_sections_and_full_content(self):
        result = make_result("不会被响应层截断的完整内容")
        report = build_arena_report("arena-1", result)

        assert report.arena_id == "arena-1"
        assert "## 对战概述" in report.markdown
        assert "## 逐轮分析" in report.markdown
        assert "## 胜负原因" in report.markdown
        assert "不会被响应层截断的完整内容" in report.markdown

    def test_battle_report_preserves_the_stage_elimination_path(self):
        result = ArenaResult(
            winner_id="agent-a",
            scores={"agent-a": 30, "agent-b": 28, "agent-c": 20},
            judge_reasoning="甲在决赛中胜出。",
            transcript=[
                ArenaTranscriptEntry(
                    turn=index,
                    round=round_number,
                    speaker_id=agent_id,
                    speaker=name,
                    content="阶段发言",
                    stage_score=score,
                    stage_rank=rank,
                    advanced=advanced,
                )
                for index, (
                    round_number,
                    agent_id,
                    name,
                    score,
                    rank,
                    advanced,
                ) in enumerate([
                    (1, "agent-b", "乙", 32, 1, True),
                    (1, "agent-b", "乙", 32, 1, True),
                    (1, "agent-a", "甲", 28, 2, True),
                    (1, "agent-c", "丙", 20, 3, False),
                    (2, "agent-a", "甲", 30, 1, True),
                    (2, "agent-b", "乙", 28, 2, False),
                ])
            ],
            mode=ArenaMode.BATTLE_ROYALE,
            topic="淘汰路径测试",
            rounds=2,
            participant_ids=["agent-a", "agent-b", "agent-c"],
            participant_names={
                "agent-a": "甲",
                "agent-b": "乙",
                "agent-c": "丙",
            },
        )

        restored = ArenaRow.from_result("battle-1", result).to_result()
        report = build_arena_report("battle-1", restored)

        assert "## 淘汰路径" in report.markdown
        assert "第 1 阶段 · 3 → 2" in report.markdown
        assert "#1 乙：32 分 · 晋级" in report.markdown
        assert report.markdown.count("#1 乙：32 分 · 晋级") == 1
        assert "#1 甲：30 分 · 冠军" in report.markdown
