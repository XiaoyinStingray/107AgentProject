"""Step 46 大乱斗评分排序不变量测试。"""

import json

from engines.arena.prompts import build_battle_judge_prompt
from engines.arena.scoring import ArenaScorer
from tests.test_arena_engine import MockModelClient


def battle_response(ranking: list[str], score_a: int, score_b: int) -> str:
    """构建两名参赛者的完整阶段评分。"""
    return json.dumps({
        "ranking": ranking,
        "scores": {"P1": score_a, "P2": score_b},
        "score_breakdown": {
            "P1": {
                "argument_quality": score_a / 4,
                "expression": score_a / 4,
                "adaptability": score_a / 4,
                "character_consistency": score_a / 4,
            },
            "P2": {
                "argument_quality": score_b / 4,
                "expression": score_b / 4,
                "adaptability": score_b / 4,
                "character_consistency": score_b / 4,
            },
        },
        "reasoning": "测试裁判结论",
    })


def test_higher_score_overrides_a_conflicting_judge_ranking():
    """同轮 ranking 与总分冲突时，后端必须让高分者排前。"""
    scorer = ArenaScorer(MockModelClient())
    result = scorer.parse_battle_result(
        battle_response(["P1", "P2"], score_a=16, score_b=32),
        {"P1": "agent-a", "P2": "agent-b"},
    )

    assert result.ranked_ids == ["agent-b", "agent-a"]
    assert result.scores == {"agent-a": 16, "agent-b": 32}


def test_judge_ranking_breaks_an_exact_score_tie():
    """总分完全相同时，保留 LLM 的综合决胜顺序。"""
    scorer = ArenaScorer(MockModelClient())
    result = scorer.parse_battle_result(
        battle_response(["P2", "P1"], score_a=28, score_b=28),
        {"P1": "agent-a", "P2": "agent-b"},
    )

    assert result.ranked_ids == ["agent-b", "agent-a"]


def test_battle_prompt_declares_score_ordering_and_tie_break():
    """裁判 prompt 与后端排序规则保持一致。"""
    prompt = build_battle_judge_prompt(
        "测试主题",
        {"P1": "陈墨", "P2": "苏敏"},
        "[陈墨]: 测试发言",
        survivor_count=1,
    )

    assert "ranking 必须按总分降序" in prompt
    assert "只有同分时" in prompt
