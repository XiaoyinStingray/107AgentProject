"""
角色冲突检测 单元测试。
"""

from types import SimpleNamespace

from engines.world.conflict import (
    _goals_conflict,
    build_conflict_events,
    detect_goal_conflicts,
)


# =============================================================================
# 关键词冲突匹配
# =============================================================================


class TestGoalsConflict:
    def test_study_vs_play(self):
        assert _goals_conflict("好好学习准备考试", "玩游戏放松")

    def test_work_vs_rest(self):
        assert _goals_conflict("加班完成项目", "在家休息")

    def test_compete_vs_cooperate(self):
        assert _goals_conflict("我要赢这场比赛", "和大家合作完成任务")

    def test_no_conflict_same_side(self):
        assert not _goals_conflict("好好学习", "认真复习")

    def test_no_conflict_unrelated(self):
        assert not _goals_conflict("吃午饭", "写代码")

    def test_reverse_direction(self):
        assert _goals_conflict("放松一下", "努力学习")


# =============================================================================
# Agent 间冲突检测
# =============================================================================


def _make_agent(agent_id: str, name: str, goals: list[dict]):
    """构造一个伪 LifeAgent。"""
    persona = SimpleNamespace(name=name)
    goal_objs = [
        SimpleNamespace(
            id=g.get("id", f"g{i}"),
            description=g["description"],
            status=g.get("status", "active"),
            progress=g.get("progress", 0.0),
        )
        for i, g in enumerate(goals)
    ]
    return SimpleNamespace(id=agent_id, persona=persona, goals=goal_objs)


class TestDetectGoalConflicts:
    def test_two_agents_conflict(self):
        agents = {
            "a1": _make_agent("a1", "小明", [{"description": "努力学习"}]),
            "a2": _make_agent("a2", "小红", [{"description": "玩游戏放松"}]),
        }
        conflicts = detect_goal_conflicts(agents)
        assert len(conflicts) == 1
        assert conflicts[0][0] == "a1"
        assert conflicts[0][1] == "a2"

    def test_no_conflict(self):
        agents = {
            "a1": _make_agent("a1", "小明", [{"description": "好好学习"}]),
            "a2": _make_agent("a2", "小红", [{"description": "认真复习"}]),
        }
        conflicts = detect_goal_conflicts(agents)
        assert len(conflicts) == 0

    def test_achieved_goals_ignored(self):
        agents = {
            "a1": _make_agent("a1", "小明", [
                {"description": "努力学习", "status": "achieved"},
            ]),
            "a2": _make_agent("a2", "小红", [{"description": "玩游戏放松"}]),
        }
        conflicts = detect_goal_conflicts(agents)
        assert len(conflicts) == 0

    def test_single_agent_no_conflict(self):
        agents = {
            "a1": _make_agent("a1", "小明", [{"description": "努力学习"}]),
        }
        conflicts = detect_goal_conflicts(agents)
        assert len(conflicts) == 0

    def test_no_goals(self):
        agents = {
            "a1": _make_agent("a1", "小明", []),
            "a2": _make_agent("a2", "小红", []),
        }
        conflicts = detect_goal_conflicts(agents)
        assert len(conflicts) == 0


# =============================================================================
# 冲突事件构建
# =============================================================================


class TestBuildConflictEvents:
    def test_build_events(self):
        conflicts = [("a1", "a2", "努力学习", "玩游戏放松")]
        events = build_conflict_events(
            conflicts,
            world_id="w1",
            tick=3,
            agent_names={"a1": "小明", "a2": "小红"},
        )
        assert len(events) == 1
        e = events[0]
        assert e.type == "conflict_detected"
        assert e.world_id == "w1"
        assert e.tick == 3
        assert e.source_agent_id == "a1"
        assert e.target_agent_ids == ["a2"]
        assert "小明" in e.description
        assert "小红" in e.description

    def test_empty_conflicts(self):
        events = build_conflict_events([], world_id="w1", tick=0)
        assert len(events) == 0
