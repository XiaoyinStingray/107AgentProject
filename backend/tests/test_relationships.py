"""
关系演化 单元测试。
"""

from models.event import SimEvent
from engines.world.relationships import (
    INTERACTION_DELTAS,
    apply_relationship_changes,
    detect_interaction_type,
    extract_relationship_changes,
    update_relationship_score,
)


# =============================================================================
# 分数计算
# =============================================================================


class TestUpdateScore:
    def test_friendly_increases(self):
        new = update_relationship_score(0.0, "friendly")
        assert new > 0.0
        assert new == INTERACTION_DELTAS["friendly"]

    def test_hostile_decreases(self):
        new = update_relationship_score(0.0, "hostile")
        assert new < 0.0
        assert new == INTERACTION_DELTAS["hostile"]

    def test_neutral_unchanged(self):
        new = update_relationship_score(0.5, "neutral")
        assert new == 0.5

    def test_clamp_upper(self):
        new = update_relationship_score(0.95, "friendly", intensity=2.0)
        assert new == 1.0

    def test_clamp_lower(self):
        new = update_relationship_score(-0.95, "hostile", intensity=2.0)
        assert new == -1.0

    def test_intensity_scales_delta(self):
        base = update_relationship_score(0.0, "friendly", intensity=1.0)
        doubled = update_relationship_score(0.0, "friendly", intensity=2.0)
        assert doubled == base * 2

    def test_unknown_type_defaults_to_neutral(self):
        new = update_relationship_score(0.3, "unknown_type")
        assert new == 0.3


# =============================================================================
# 交互类型检测
# =============================================================================


class TestDetectInteraction:
    def test_friendly_keywords(self):
        assert detect_interaction_type("谢谢你帮我复习功课") == "friendly"

    def test_hostile_keywords(self):
        assert detect_interaction_type("我讨厌你，滚开") == "hostile"

    def test_cooperative_keywords(self):
        assert detect_interaction_type("我们一起合作完成这个项目吧") == "cooperative"

    def test_competitive_keywords(self):
        assert detect_interaction_type("我一定要赢过你") == "competitive"

    def test_neutral_no_keywords(self):
        assert detect_interaction_type("今天天气不错") == "neutral"

    def test_most_matches_wins(self):
        """多个类型匹配时取最多的那个。"""
        # "谢谢" (friendly) × 2, "我们" (cooperative) × 1
        result = detect_interaction_type("谢谢谢谢我们")
        assert result == "friendly"


# =============================================================================
# 关系变化提取
# =============================================================================


class TestExtractChanges:
    def test_agent_message_with_target(self):
        events = [
            SimEvent(
                id="e1", world_id="w1", tick=0, type="agent_message",
                source_agent_id="a1", target_agent_ids=["a2"],
                description="谢谢你帮我！", created_at="2026-01-01",
            ),
        ]
        changes = extract_relationship_changes(events)
        assert len(changes) == 1
        assert changes[0][0] == "a1"
        assert changes[0][1] == "a2"
        assert changes[0][2] == "friendly"

    def test_skips_neutral_messages(self):
        events = [
            SimEvent(
                id="e1", world_id="w1", tick=0, type="agent_message",
                source_agent_id="a1", target_agent_ids=["a2"],
                description="今天天气不错。", created_at="2026-01-01",
            ),
        ]
        changes = extract_relationship_changes(events)
        assert len(changes) == 0

    def test_skips_non_message_events(self):
        events = [
            SimEvent(
                id="e1", world_id="w1", tick=0, type="thought_stream",
                source_agent_id="a1",
                description="我在想...", created_at="2026-01-01",
            ),
        ]
        changes = extract_relationship_changes(events)
        assert len(changes) == 0

    def test_skips_no_source(self):
        events = [
            SimEvent(
                id="e1", world_id="w1", tick=0, type="agent_message",
                source_agent_id=None, target_agent_ids=["a2"],
                description="谢谢你", created_at="2026-01-01",
            ),
        ]
        changes = extract_relationship_changes(events)
        assert len(changes) == 0

    def test_skips_no_targets(self):
        events = [
            SimEvent(
                id="e1", world_id="w1", tick=0, type="agent_message",
                source_agent_id="a1", target_agent_ids=[],
                description="谢谢你", created_at="2026-01-01",
            ),
        ]
        changes = extract_relationship_changes(events)
        assert len(changes) == 0

    def test_multiple_changes(self):
        events = [
            SimEvent(
                id="e1", world_id="w1", tick=0, type="agent_message",
                source_agent_id="a1", target_agent_ids=["a2"],
                description="谢谢你帮我", created_at="2026-01-01",
            ),
            SimEvent(
                id="e2", world_id="w1", tick=0, type="agent_message",
                source_agent_id="a2", target_agent_ids=["a1"],
                description="滚开，我讨厌你", created_at="2026-01-01",
            ),
        ]
        changes = extract_relationship_changes(events)
        assert len(changes) == 2
        assert changes[0][2] == "friendly"
        assert changes[1][2] == "hostile"


# =============================================================================
# 关系变化应用
# =============================================================================


class TestApplyChanges:
    def test_new_relationship_added(self):
        rels: dict[tuple[str, str], float] = {}
        changes = [("a1", "a2", "friendly", 1.0)]
        events = apply_relationship_changes(rels, changes)

        assert rels[("a1", "a2")] > 0.0
        assert len(events) == 1
        assert events[0].type == "relationship_change"

    def test_bidirectional_independent(self):
        """A→B 和 B→A 可以有不同的分数。"""
        rels: dict[tuple[str, str], float] = {}
        changes = [
            ("a1", "a2", "friendly", 1.0),
            ("a2", "a1", "hostile", 1.0),
        ]
        events = apply_relationship_changes(rels, changes)

        assert rels[("a1", "a2")] > 0.0  # a1 对 a2 友好
        assert rels[("a2", "a1")] < 0.0  # a2 对 a1 敌视
        assert len(events) == 2

    def test_accumulates_over_time(self):
        rels: dict[tuple[str, str], float] = {("a1", "a2"): 0.5}
        changes = [("a1", "a2", "friendly", 1.0)]
        events = apply_relationship_changes(rels, changes)

        assert rels[("a1", "a2")] > 0.5  # 递增
        assert events[0].data["old_score"] == 0.5

    def test_event_data_complete(self):
        rels: dict[tuple[str, str], float] = {}
        changes = [("a1", "a2", "cooperative", 1.5)]
        events = apply_relationship_changes(rels, changes)

        data = events[0].data
        assert data["from"] == "a1"
        assert data["to"] == "a2"
        assert data["interaction"] == "cooperative"
        assert data["intensity"] == 1.5
        assert "old_score" in data
        assert "new_score" in data
