"""
DiagnosticsEngine 单元测试 — Step T1。
覆盖: 偏离检测阈值、冲突检测、参与度评分边界。
"""

import pytest

from engines.team.diagnostics import DiagnosticsEngine


AGENTS = [
    {"id": "a1", "name": "小红", "role": "产品经理", "mbti": "ENFP"},
    {"id": "a2", "name": "小明", "role": "后端开发", "mbti": "ISTJ"},
    {"id": "a3", "name": "小刚", "role": "架构师", "mbti": "INTJ"},
]


class TestParticipationScores:

    def test_empty_events_all_zero(self):
        """无事件 → 所有 Agent 参与度为 0。"""
        diag = DiagnosticsEngine(AGENTS)
        scores = diag.participation_scores()
        assert all(v == 0.0 for v in scores.values())
        assert len(scores) == 3

    def test_single_agent_dominates(self):
        """一个 Agent 包揽全部发言 → 参与度 1.0。"""
        diag = DiagnosticsEngine(AGENTS)
        diag.on_tick(1, [
            {"type": "agent_message", "agent_id": "a1", "content": "我来说"},
        ])
        scores = diag.participation_scores()
        assert scores["a1"] == 1.0
        assert scores["a2"] == 0.0
        assert scores["a3"] == 0.0

    def test_even_distribution(self):
        """三人各发一条 → 各 ~0.333。"""
        diag = DiagnosticsEngine(AGENTS)
        diag.on_tick(1, [
            {"type": "agent_message", "agent_id": "a1", "content": "A"},
            {"type": "agent_message", "agent_id": "a2", "content": "B"},
            {"type": "agent_message", "agent_id": "a3", "content": "C"},
        ])
        scores = diag.participation_scores()
        for aid in ["a1", "a2", "a3"]:
            assert abs(scores[aid] - 1 / 3) < 0.01


class TestLowParticipation:

    def test_silent_agent_alert_at_5_ticks(self):
        """Agent 连续 5 tick 未发言 → 告警。"""
        diag = DiagnosticsEngine(AGENTS)
        all_alerts = []
        for tick in range(1, 7):
            alerts = diag.on_tick(tick, [
                {"type": "agent_message", "agent_id": "a1", "content": "说话"},
            ])
            all_alerts.extend(alerts)

        # a2 和 a3 应该在 tick 5 收到告警
        low_alerts = [a for a in all_alerts if a["type"] == "low_participation"]
        assert len(low_alerts) >= 1
        agent_ids = {a["agent_id"] for a in low_alerts}
        assert "a2" in agent_ids or "a3" in agent_ids

    def test_no_alert_when_active(self):
        """Agent 每 tick 都发言 → 无告警。"""
        diag = DiagnosticsEngine(AGENTS)
        all_alerts = []
        for tick in range(1, 8):
            alerts = diag.on_tick(tick, [
                {"type": "agent_message", "agent_id": "a1", "content": "A"},
                {"type": "agent_message", "agent_id": "a2", "content": "B"},
                {"type": "agent_message", "agent_id": "a3", "content": "C"},
            ])
            all_alerts.extend(alerts)

        low_alerts = [a for a in all_alerts if a["type"] == "low_participation"]
        assert len(low_alerts) == 0

    def test_silent_count_resets_on_activity(self):
        """沉默计数在 Agent 发言后重置。"""
        diag = DiagnosticsEngine(AGENTS)
        # a2 沉默 4 tick（不触发告警）
        for tick in range(1, 5):
            diag.on_tick(tick, [
                {"type": "agent_message", "agent_id": "a1", "content": "A"},
            ])
        # a2 在第 5 tick 发言 → 重置
        diag.on_tick(5, [
            {"type": "agent_message", "agent_id": "a1", "content": "A"},
            {"type": "agent_message", "agent_id": "a2", "content": "B"},
        ])
        # 再沉默 4 tick → 不应触发告警（因为重置了）
        alerts = []
        for tick in range(6, 10):
            alerts.extend(diag.on_tick(tick, [
                {"type": "agent_message", "agent_id": "a1", "content": "A"},
            ]))

        low = [a for a in alerts if a.get("agent_id") == "a2"]
        assert len(low) == 0


class TestConflictDetection:

    def test_no_conflict_few_agents(self):
        """少于 3 个 Agent → 不报冲突。"""
        diag = DiagnosticsEngine(AGENTS)
        events = [
            {"type": "agent_action", "agent_id": "a1", "tick": 1},
            {"type": "agent_action", "agent_id": "a2", "tick": 1},
        ]
        conflicts = diag.detect_conflicts(events)
        assert len(conflicts) == 0

    def test_conflict_many_parallel_actions(self):
        """同一 tick 内 ≥3 Agent ≥5 action → 报告潜在冲突。"""
        diag = DiagnosticsEngine(AGENTS)
        events = [
            {"type": "agent_action", "agent_id": "a1", "tick": 3},
            {"type": "agent_action", "agent_id": "a1", "tick": 3},
            {"type": "agent_action", "agent_id": "a2", "tick": 3},
            {"type": "agent_action", "agent_id": "a2", "tick": 3},
            {"type": "agent_action", "agent_id": "a3", "tick": 3},
        ]
        conflicts = diag.detect_conflicts(events)
        assert len(conflicts) >= 1
        assert conflicts[0]["type"] == "potential_conflict"


class TestSummary:

    def test_summary_structure(self):
        """summary 返回正确结构。"""
        diag = DiagnosticsEngine(AGENTS)
        diag.on_tick(1, [
            {"type": "agent_message", "agent_id": "a1", "content": "测试"},
        ])
        s = diag.summary()
        assert "alerts" in s
        assert "participation" in s
        assert "total_messages" in s
        assert s["total_messages"] == 1
