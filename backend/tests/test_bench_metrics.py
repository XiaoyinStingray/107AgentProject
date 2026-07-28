"""
六维评分器单元测试 — Step T3 / Layer 2。
覆盖: calculate_metrics 边界值 + aggregate_scores 聚合 + 单维评分函数。
"""

import math
import pytest

from engines.bench.metrics import (
    calculate_metrics,
    aggregate_scores,
    _calc_consistency,
    _calc_decision_quality,
    _calc_interaction_depth,
    _calc_creativity,
    _calc_adaptability,
    _zero_scores,
    _round_score,
)


# =============================================================================
# Tests — calculate_metrics（入口函数）
# =============================================================================

class TestCalculateMetrics:

    def test_empty_events_returns_zero(self):
        """空事件列表返回全零分数。"""
        result = calculate_metrics([], {"mbti": "INTJ", "big_five": {}})
        assert result == _zero_scores()

    def test_single_event(self):
        """单条事件不崩溃。"""
        events = [{"type": "thought_stream", "content": "我想这样做...", "tick": 0}]
        result = calculate_metrics(events, {"mbti": "INTJ", "big_five": {}})
        assert isinstance(result, dict)
        assert all(0 <= v <= 100 for v in result.values())

    def test_many_events(self):
        """大量事件正常处理。"""
        events = [
            {"type": "thought_stream", "content": f"思考内容 {i}", "tick": i % 8}
            for i in range(100)
        ]
        events += [
            {"type": "agent_message", "content": f"消息 {i}", "tick": i % 8}
            for i in range(50)
        ]
        events += [
            {"type": "agent_action", "content": "行动", "action": f"act_{i % 5}", "tick": i % 8}
            for i in range(30)
        ]
        result = calculate_metrics(events, {"mbti": "ENFP", "big_five": {}})
        assert all(0 <= v <= 100 for v in result.values())

    def test_six_dimensions_present(self):
        """输出包含全部六维。"""
        events = [{"type": "thought_stream", "content": "思考", "tick": 0}]
        result = calculate_metrics(events, {})
        expected_dims = {"人格一致性", "决策质量", "交互深度", "鲁棒性", "创造力", "适应性"}
        assert set(result.keys()) == expected_dims

    def test_scores_are_rounded(self):
        """分数为整数或一位小数。"""
        events = [{"type": "thought_stream", "content": "x" * 50, "tick": i} for i in range(10)]
        result = calculate_metrics(events, {})
        for v in result.values():
            assert v == int(v) or round(v, 1) == v


# =============================================================================
# Tests — _calc_consistency
# =============================================================================

class TestCalcConsistency:

    def test_no_thoughts_default_50(self):
        """无思维流默认 50。"""
        assert _calc_consistency([], {}) == 50.0

    def test_few_thoughts(self):
        """少量思维流（<3）得分偏低。"""
        thoughts = [{"type": "thought_stream", "content": "想"}]
        score = _calc_consistency(thoughts, {})
        assert score < 80

    def test_healthy_range(self):
        """合理数量（3-20）得高分。"""
        thoughts = [{"type": "thought_stream", "content": f"思考{i}"} for i in range(10)]
        score = _calc_consistency(thoughts, {})
        assert score == 80.0

    def test_too_many_thoughts(self):
        """过多思维流扣分。"""
        thoughts = [{"type": "thought_stream", "content": f"思考{i}"} for i in range(30)]
        score = _calc_consistency(thoughts, {})
        assert score < 80


# =============================================================================
# Tests — _calc_decision_quality
# =============================================================================

class TestCalcDecisionQuality:

    def test_no_actions_default_30(self):
        """无行动默认 30。"""
        assert _calc_decision_quality([], []) == 30.0

    def test_diverse_actions(self):
        """多种行动类型得高分。"""
        actions = [
            {"type": "agent_action", "action": f"act_{i}"} for i in range(5)
        ]
        thoughts = [{"type": "thought_stream", "content": "想"} for _ in range(5)]
        score = _calc_decision_quality(actions, thoughts)
        assert score > 50

    def test_single_action_type(self):
        """单一行动类型得分偏低。"""
        actions = [{"type": "agent_action", "action": "same"} for _ in range(10)]
        score = _calc_decision_quality(actions, [])
        assert score < 50


# =============================================================================
# Tests — _calc_interaction_depth
# =============================================================================

class TestCalcInteractionDepth:

    def test_no_messages_default_20(self):
        """无消息默认 20。"""
        assert _calc_interaction_depth([], []) == 20.0

    def test_long_messages(self):
        """长消息得高分。"""
        messages = [
            {"type": "agent_message", "content": "这是一段很长的消息" * 10}
            for _ in range(5)
        ]
        score = _calc_interaction_depth(messages, messages)
        assert score > 50

    def test_short_messages(self):
        """短消息得分偏低。"""
        messages = [
            {"type": "agent_message", "content": "嗯"}
            for _ in range(3)
        ]
        score = _calc_interaction_depth(messages, messages + [{"type": "other"}])
        assert score < 50


# =============================================================================
# Tests — _calc_creativity
# =============================================================================

class TestCalcCreativity:

    def test_single_type_low_entropy(self):
        """单一事件类型→低创造力。"""
        events = [{"type": "thought_stream"} for _ in range(20)]
        score = _calc_creativity(events)
        assert score < 20

    def test_diverse_types_high_entropy(self):
        """多种事件类型→高创造力。"""
        events = [
            {"type": t} for t in ["thought_stream", "agent_message", "agent_action", "error"]
            for _ in range(5)
        ]
        score = _calc_creativity(events)
        assert score > 50

    def test_empty_events(self):
        """空事件不崩溃。"""
        score = _calc_creativity([])
        assert score == 0


# =============================================================================
# Tests — _calc_adaptability
# =============================================================================

class TestCalcAdaptability:

    def test_few_lengths_default_60(self):
        """少于 3 个长度值默认 60。"""
        assert _calc_adaptability([], [10, 20]) == 60.0

    def test_zero_avg(self):
        """平均长度为 0 默认 50。"""
        score = _calc_adaptability([], [0, 0, 0, 0])
        assert score == 50.0

    def test_varied_lengths(self):
        """长度变化大→适应性高。"""
        lengths = [10, 100, 5, 200, 15]
        score = _calc_adaptability([], lengths)
        assert score > 50


# =============================================================================
# Tests — aggregate_scores
# =============================================================================

class TestAggregateScores:

    def test_empty_list(self):
        """空列表返回零分。"""
        result = aggregate_scores([])
        assert result == _zero_scores()

    def test_single_score(self):
        """单条评测——鲁棒性默认 85。"""
        scores = [{"人格一致性": 80, "决策质量": 70, "交互深度": 60,
                   "鲁棒性": 80, "创造力": 50, "适应性": 65}]
        result = aggregate_scores(scores)
        assert result["人格一致性"] == 80
        assert result["鲁棒性"] == 85.0  # 单样本默认

    def test_multiple_scores_average(self):
        """多条评测计算均值。"""
        scores = [
            {"人格一致性": 80, "决策质量": 70, "交互深度": 60,
             "鲁棒性": 80, "创造力": 50, "适应性": 65},
            {"人格一致性": 90, "决策质量": 80, "交互深度": 70,
             "鲁棒性": 85, "创造力": 60, "适应性": 75},
        ]
        result = aggregate_scores(scores)
        assert result["人格一致性"] == 85.0
        assert result["决策质量"] == 75.0

    def test_robustness_with_variance(self):
        """鲁棒性：变异系数越大分数越低。"""
        scores = [
            {"人格一致性": 80, "决策质量": 70, "交互深度": 60,
             "鲁棒性": 50, "创造力": 50, "适应性": 65},
            {"人格一致性": 80, "决策质量": 70, "交互深度": 60,
             "鲁棒性": 90, "创造力": 50, "适应性": 65},
            {"人格一致性": 80, "决策质量": 70, "交互深度": 60,
             "鲁棒性": 50, "创造力": 50, "适应性": 65},
        ]
        result = aggregate_scores(scores)
        # 鲁棒性有高方差 → 分数应降低
        assert result["鲁棒性"] < 80


# =============================================================================
# Tests — _round_score
# =============================================================================

class TestRoundScore:

    def test_integer_value(self):
        """整数值返回 int。"""
        assert _round_score(80.0) == 80
        assert isinstance(_round_score(80.0), int)

    def test_decimal_value(self):
        """小数值保留一位。"""
        assert _round_score(75.6) == 75.6
        assert _round_score(33.33) == 33.3
