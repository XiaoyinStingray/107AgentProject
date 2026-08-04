"""
BehaviorFingerprint 单元测试 — FingerprintCollector + 分析函数。

覆盖:
  - BehaviorTrace 数据类属性
  - BehaviorFingerprint.to_dict 序列化
  - FingerprintCollector.collect 每 tick 采集
  - FingerprintCollector.analyze 跨 tick 聚合
  - FingerprintCollector.get_traces / clear
  - _summarize_pattern 决策模式识别
  - _calc_consistency 一致性分数计算
"""

import pytest

from engines.agent_factory.fingerprint import (
    BehaviorFingerprint,
    BehaviorTrace,
    FingerprintCollector,
    _calc_consistency,
    _summarize_pattern,
)
from collections import Counter


# =============================================================================
# BehaviorTrace 数据类
# =============================================================================


class TestBehaviorTrace:
    """BehaviorTrace 数据类测试。"""

    def test_default_values(self):
        """默认值正确。"""
        trace = BehaviorTrace(agent_id="a1", tick=0)
        assert trace.tools_called == []
        assert trace.message_count == 0
        assert trace.emotion_start == "neutral"
        assert trace.emotion_end == "neutral"
        assert trace.targets_interacted == []

    def test_message_avg_length_zero_messages(self):
        """无消息时平均长度为 0。"""
        trace = BehaviorTrace(agent_id="a1", tick=0, message_count=0, message_total_length=0)
        assert trace.message_avg_length == 0

    def test_message_avg_length_nonzero(self):
        """有消息时平均长度正确。"""
        trace = BehaviorTrace(agent_id="a1", tick=0, message_count=3, message_total_length=150)
        assert trace.message_avg_length == 50


# =============================================================================
# BehaviorFingerprint 数据类
# =============================================================================


class TestBehaviorFingerprint:
    """BehaviorFingerprint 数据类测试。"""

    def test_to_dict(self):
        """to_dict 序列化正确。"""
        fp = BehaviorFingerprint(
            agent_id="a1",
            total_ticks=10,
            tool_distribution={"observe": 5, "send_message": 3},
            emotion_trajectory=["neutral"] * 10,
            social_network={"小红": 3},
            decision_pattern="观察型",
            consistency_score=0.75,
        )
        d = fp.to_dict()
        assert d["agent_id"] == "a1"
        assert d["total_ticks"] == 10
        assert d["tool_distribution"]["observe"] == 5
        assert d["social_network"]["小红"] == 3
        assert d["decision_pattern"] == "观察型"
        assert d["consistency_score"] == 0.75

    def test_to_dict_truncates_emotion_trajectory(self):
        """emotion_trajectory 超过 20 条时截断。"""
        fp = BehaviorFingerprint(
            agent_id="a1",
            total_ticks=50,
            emotion_trajectory=["neutral"] * 50,
        )
        d = fp.to_dict()
        assert len(d["emotion_trajectory"]) == 20


# =============================================================================
# FingerprintCollector.collect
# =============================================================================


class TestFingerprintCollectorCollect:
    """FingerprintCollector.collect 测试。"""

    def test_collect_creates_trace(self):
        """collect 创建 BehaviorTrace。"""
        collector = FingerprintCollector()
        trace = collector.collect(
            agent_id="a1",
            tick=0,
            tools_called=["observe", "think_aloud"],
            messages=[{"content": "你好"}, {"content": "世界"}],
            emotion_before="neutral",
            emotion_after="happy",
            targets=["a2"],
        )
        assert trace.agent_id == "a1"
        assert trace.tick == 0
        assert trace.tools_called == ["observe", "think_aloud"]
        assert trace.message_count == 2
        assert trace.emotion_start == "neutral"
        assert trace.emotion_end == "happy"
        assert trace.targets_interacted == ["a2"]

    def test_collect_multiple_ticks(self):
        """多次 collect 记录多个 tick。"""
        collector = FingerprintCollector()
        for i in range(5):
            collector.collect(
                agent_id="a1",
                tick=i,
                tools_called=["observe"],
                messages=[],
                emotion_before="neutral",
                emotion_after="neutral",
                targets=[],
            )
        traces = collector.get_traces("a1")
        assert len(traces) == 5
        assert [t.tick for t in traces] == [0, 1, 2, 3, 4]

    def test_collect_multiple_agents(self):
        """不同 Agent 的轨迹独立存储。"""
        collector = FingerprintCollector()
        collector.collect("a1", 0, ["observe"], [], "neutral", "neutral", [])
        collector.collect("a2", 0, ["send_message"], [], "neutral", "happy", ["a1"])

        assert len(collector.get_traces("a1")) == 1
        assert len(collector.get_traces("a2")) == 1

    def test_get_traces_empty_for_unknown_agent(self):
        """未知 Agent 返回空列表。"""
        collector = FingerprintCollector()
        assert collector.get_traces("unknown") == []


# =============================================================================
# FingerprintCollector.analyze
# =============================================================================


class TestFingerprintCollectorAnalyze:
    """FingerprintCollector.analyze 聚合测试。"""

    def test_analyze_empty_returns_zero_ticks(self):
        """无轨迹时返回 total_ticks=0。"""
        collector = FingerprintCollector()
        fp = collector.analyze("a1")
        assert fp.total_ticks == 0
        assert fp.tool_distribution == {}

    def test_analyze_tool_distribution(self):
        """tool 分布正确聚合。"""
        collector = FingerprintCollector()
        for i in range(10):
            tools = ["observe", "think_aloud"] if i % 2 == 0 else ["send_message"]
            collector.collect("a1", i, tools, [], "neutral", "neutral", [])

        fp = collector.analyze("a1")
        assert fp.total_ticks == 10
        assert fp.tool_distribution["observe"] == 5
        assert fp.tool_distribution["think_aloud"] == 5
        assert fp.tool_distribution["send_message"] == 5

    def test_analyze_emotion_trajectory(self):
        """情绪轨迹按 tick 顺序记录。"""
        collector = FingerprintCollector()
        emotions = ["neutral", "neutral", "happy", "happy", "anxious"]
        for i, emo in enumerate(emotions):
            collector.collect("a1", i, [], [], emo, emo, [])

        fp = collector.analyze("a1")
        assert fp.emotion_trajectory == emotions

    def test_analyze_social_network(self):
        """社交网络正确统计互动次数。"""
        collector = FingerprintCollector()
        collector.collect("a1", 0, [], [], "neutral", "neutral", ["a2", "a3"])
        collector.collect("a1", 1, [], [], "neutral", "neutral", ["a2"])
        collector.collect("a1", 2, [], [], "neutral", "neutral", ["a2", "a2"])

        fp = collector.analyze("a1")
        assert fp.social_network["a2"] == 4  # 1 + 1 + 2
        assert fp.social_network["a3"] == 1

    def test_analyze_consistency_score(self):
        """一致性分数在 [0, 1] 范围内。"""
        collector = FingerprintCollector()
        for i in range(20):
            collector.collect("a1", i, ["observe"], [], "neutral", "neutral", [])

        fp = collector.analyze("a1")
        assert 0.0 <= fp.consistency_score <= 1.0


# =============================================================================
# FingerprintCollector.clear
# =============================================================================


class TestFingerprintCollectorClear:
    """FingerprintCollector.clear 测试。"""

    def test_clear_specific_agent(self):
        """clear(agent_id) 只清除指定 Agent。"""
        collector = FingerprintCollector()
        collector.collect("a1", 0, [], [], "neutral", "neutral", [])
        collector.collect("a2", 0, [], [], "neutral", "neutral", [])

        collector.clear("a1")
        assert collector.get_traces("a1") == []
        assert len(collector.get_traces("a2")) == 1

    def test_clear_all(self):
        """clear() 清除所有 Agent。"""
        collector = FingerprintCollector()
        collector.collect("a1", 0, [], [], "neutral", "neutral", [])
        collector.collect("a2", 0, [], [], "neutral", "neutral", [])

        collector.clear()
        assert collector.get_traces("a1") == []
        assert collector.get_traces("a2") == []


# =============================================================================
# _summarize_pattern
# =============================================================================


class TestSummarizePattern:
    """_summarize_pattern 决策模式识别测试。"""

    def test_observe_dominant(self):
        """observe 占比 >40% → 观察型。"""
        counter = Counter({"observe": 50, "think_aloud": 10, "send_message": 10})
        pattern = _summarize_pattern(counter)
        assert "观察" in pattern

    def test_think_dominant(self):
        """think_aloud 占比 >40% → 思考型。"""
        counter = Counter({"observe": 10, "think_aloud": 50, "send_message": 10})
        pattern = _summarize_pattern(counter)
        assert "思考" in pattern

    def test_send_dominant(self):
        """send_message 占比 >50% → 社交型。"""
        counter = Counter({"observe": 10, "think_aloud": 10, "send_message": 60})
        pattern = _summarize_pattern(counter)
        assert "社交" in pattern

    def test_observe_and_think_balanced(self):
        """observe + think 均 >20% 且 observe <=40% → 审慎型。"""
        counter = Counter({"observe": 25, "think_aloud": 25, "send_message": 20, "set_goal": 10})
        pattern = _summarize_pattern(counter)
        # observe_pct=0.31, think_pct=0.31 → 均不超 0.4，但均 >0.2 → 审慎型
        assert "审慎" in pattern

    def test_balanced_pattern(self):
        """均匀分布且无单一主导 → 平衡型。"""
        # observe_pct=0.2, think_pct=0.2 → 不满足 >0.2 条件（需严格大于）
        # send_pct=0.2 → 不满足 >0.5 → 落入平衡型
        counter = Counter({"observe": 10, "think_aloud": 10, "send_message": 10, "set_goal": 20})
        pattern = _summarize_pattern(counter)
        # observe_pct=0.2, think_pct=0.2 → 不满足 >0.2 → 平衡型
        assert "平衡" in pattern


# =============================================================================
# _calc_consistency
# =============================================================================


class TestCalcConsistency:
    """_calc_consistency 一致性分数测试。"""

    def test_single_tool_max_consistency(self):
        """只使用一种 tool → 一致性 = 1.0。"""
        counter = Counter({"observe": 100})
        assert _calc_consistency(counter) == 1.0

    def test_few_calls_max_consistency(self):
        """总调用 <3 → 一致性 = 1.0。"""
        counter = Counter({"observe": 1, "send_message": 1})
        assert _calc_consistency(counter) == 1.0

    def test_uniform_distribution_low_consistency(self):
        """均匀分布 → 低一致性（高熵）。"""
        counter = Counter({"observe": 25, "think_aloud": 25, "send_message": 25, "set_goal": 25})
        score = _calc_consistency(counter)
        assert score < 0.5  # 4 种 tool 均匀分布 → 高熵 → 低一致性

    def test_focused_distribution_high_consistency(self):
        """集中分布 → 高一致性（低熵）。"""
        counter = Counter({"observe": 90, "think_aloud": 5, "send_message": 5})
        score = _calc_consistency(counter)
        assert score > 0.5

    def test_consistency_in_range(self):
        """一致性分数始终在 [0, 1] 范围内。"""
        counter = Counter({"observe": 30, "think_aloud": 20, "send_message": 10})
        score = _calc_consistency(counter)
        assert 0.0 <= score <= 1.0
