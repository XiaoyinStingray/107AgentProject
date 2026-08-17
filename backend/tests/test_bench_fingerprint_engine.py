"""
Bench 指纹引擎单元测试 — M10 模块测试。
覆盖: diagnose_scores / detect_degradation / _classify_style / analyze_fingerprint。
"""

import json
from engines.bench.fingerprint import (
    diagnose_scores,
    detect_degradation,
    analyze_fingerprint,
    _classify_style,
)
from collections import Counter


# =============================================================================
# Tests — diagnose_scores
# =============================================================================

class TestDiagnoseScores:

    def test_empty_results(self):
        """空结果列表返回空诊断。"""
        result = diagnose_scores([])
        assert result["agents"] == {}
        assert "summary" in result or result.get("total_agents", 0) == 0

    def test_single_agent_with_events(self):
        """单 Agent 有事件数据时返回诊断。"""
        events = [
            {"type": "thought_stream", "content": f"思考{i}"} for i in range(10)
        ] + [
            {"type": "agent_message", "content": "这是一条较长的消息内容" * 3}
        ] * 3 + [
            {"type": "agent_action", "content": "决定这样做"}
        ] * 2

        results = [{
            "agent_template": "小明",
            "scenario": "期末周",
            "events_json": json.dumps(events),
            "scores": {"人格一致性": 80, "决策质量": 70, "交互深度": 60,
                       "鲁棒性": 85, "创造力": 50, "适应性": 65},
        }]
        result = diagnose_scores(results)
        assert result["total_agents"] == 1
        assert "小明" in result["agents"]
        assert "diagnostics" in result["agents"]["小明"]
        assert result["has_events"] is True

    def test_no_events_hint(self):
        """无事件数据时返回提示信息。"""
        results = [{
            "agent_template": "小明",
            "scenario": "期末周",
            "events_json": "[]",
            "scores": {"人格一致性": 80},
        }]
        result = diagnose_scores(results)
        assert result["hint"] is not None
        assert "无原始事件" in result["hint"] or "没有原始事件" in result["hint"] or result["has_events"] is False

    def test_multiple_agents(self):
        """多 Agent 独立诊断。"""
        events_a = [{"type": "thought_stream", "content": "思考"}] * 5
        events_b = [{"type": "agent_message", "content": "你好世界" * 10}] * 3

        results = [
            {"agent_template": "A", "scenario": "S1",
             "events_json": json.dumps(events_a),
             "scores": {"人格一致性": 90}},
            {"agent_template": "B", "scenario": "S1",
             "events_json": json.dumps(events_b),
             "scores": {"交互深度": 70}},
        ]
        result = diagnose_scores(results)
        assert result["total_agents"] == 2
        assert "A" in result["agents"]
        assert "B" in result["agents"]

    def test_invalid_events_json(self):
        """无效 JSON 不崩溃。"""
        results = [{
            "agent_template": "X",
            "scenario": "S",
            "events_json": "{invalid json",
            "scores": {"人格一致性": 50},
        }]
        result = diagnose_scores(results)
        assert result["total_agents"] == 1


# =============================================================================
# Tests — detect_degradation
# =============================================================================

class TestDetectDegradation:

    def test_empty_runs(self):
        """空评测列表返回空。"""
        assert detect_degradation([]) == {}

    def test_single_run_data_insufficient(self):
        """单条评测数据不足。"""
        runs = [{"id": "r1", "created_at": "2026-01-01",
                 "llm_model": "m1", "scores": {"人格一致性": 80}}]
        result = detect_degradation(runs)
        assert "m1" in result
        assert result["m1"]["trend"] == "数据不足"

    def test_stable_trend(self):
        """稳定趋势。"""
        runs = [
            {"id": f"r{i}", "created_at": f"2026-01-0{i+1}",
             "llm_model": "m1",
             "scores": {"人格一致性": 70, "决策质量": 70}}
            for i in range(6)
        ]
        result = detect_degradation(runs)
        assert result["m1"]["declining"] is False
        assert "稳定" in result["m1"]["trend"]

    def test_declining_trend(self):
        """劣化趋势——最近 3 次比前 3 次低 >5 分。"""
        high = {"人格一致性": 90, "决策质量": 90, "交互深度": 90,
                "鲁棒性": 90, "创造力": 90, "适应性": 90}
        low = {"人格一致性": 70, "决策质量": 70, "交互深度": 70,
               "鲁棒性": 70, "创造力": 70, "适应性": 70}
        runs = (
            [{"id": f"h{i}", "created_at": f"2026-01-0{i+1}",
              "llm_model": "m1", "scores": high} for i in range(3)]
            + [{"id": f"l{i}", "created_at": f"2026-01-0{i+4}",
                "llm_model": "m1", "scores": low} for i in range(3)]
        )
        result = detect_degradation(runs)
        assert result["m1"]["declining"] is True
        assert "劣化" in result["m1"]["trend"]

    def test_improving_trend(self):
        """提升趋势。"""
        low = {"人格一致性": 60, "决策质量": 60}
        high = {"人格一致性": 80, "决策质量": 80}
        runs = (
            [{"id": f"l{i}", "created_at": f"2026-01-0{i+1}",
              "llm_model": "m1", "scores": low} for i in range(3)]
            + [{"id": f"h{i}", "created_at": f"2026-01-0{i+4}",
                "llm_model": "m1", "scores": high} for i in range(3)]
        )
        result = detect_degradation(runs)
        assert "提升" in result["m1"]["trend"]

    def test_multiple_models(self):
        """多模型独立检测。"""
        runs = [
            {"id": "r1", "created_at": "2026-01-01", "llm_model": "m1",
             "scores": {"人格一致性": 80}},
            {"id": "r2", "created_at": "2026-01-01", "llm_model": "m2",
             "scores": {"人格一致性": 60}},
        ]
        result = detect_degradation(runs)
        assert "m1" in result
        assert "m2" in result

    def test_scores_as_json_string(self):
        """scores 为 JSON 字符串时正确解析。"""
        runs = [{
            "id": "r1", "created_at": "2026-01-01", "llm_model": "m1",
            "scores": json.dumps({"人格一致性": 80}),
        }]
        result = detect_degradation(runs)
        assert "m1" in result


# =============================================================================
# Tests — _classify_style
# =============================================================================

class TestClassifyStyle:

    def test_analytical_dominant(self):
        """分析型主导。"""
        actions = Counter({"分析": 10, "判断": 8, "计划": 5, "想要": 1, "尝试": 1})
        style = _classify_style(actions)
        assert "分析" in style

    def test_no_actions_neutral(self):
        """无动作返回中性。"""
        assert _classify_style(Counter()) == "中性"

    def test_balanced(self):
        """均匀分布→平衡型。"""
        actions = Counter({"决定": 1, "想要": 1, "避免": 1})
        style = _classify_style(actions)
        assert "平衡" in style or "+" in style


# =============================================================================
# Tests — analyze_fingerprint (backward compat)
# =============================================================================

class TestAnalyzeFingerprint:

    def test_empty_results(self):
        """空结果返回空 agents。"""
        result = analyze_fingerprint([])
        assert result["agents"] == {}

    def test_with_events(self):
        """有事件时返回指纹分析（analyze_fingerprint 委托给 diagnose_scores）。"""
        events = [
            {"type": "thought_stream", "content": "决定这样做 分析"},
            {"type": "agent_message", "content": "我认为应该选择这个方案"},
        ]
        results = [{
            "agent_template": "TestAgent",
            "scenario": "期末周",
            "events_json": json.dumps(events),
        }]
        result = analyze_fingerprint(results)
        assert "TestAgent" in result["agents"]
        agent_data = result["agents"]["TestAgent"]
        # analyze_fingerprint 实际委托给 diagnose_scores，返回 diagnostics/scores/event_counts
        assert "diagnostics" in agent_data or "event_distribution" in agent_data
