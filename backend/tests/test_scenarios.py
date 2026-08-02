"""
scenarios 单元测试 — 验证三个内置场景的数据完整性和辅助函数。
"""

import pytest

from engines.world.scenarios import (
    FRESHMAN_ORIENTATION,
    FINAL_EXAM_WEEK,
    GRADUATION_CHOICE,
    BUILTIN_SCENARIOS,
    get_scenario_by_name,
)
from models.world import Scenario


# =============================================================================
# 常量数据完整性
# =============================================================================


class TestScenarioConstants:
    """验证三个内置 Scenario 常量的字段合法性。"""

    @pytest.mark.parametrize(
        "scenario",
        [FRESHMAN_ORIENTATION, FINAL_EXAM_WEEK, GRADUATION_CHOICE],
        ids=["freshman", "final_exam", "graduation"],
    )
    def test_is_scenario_instance(self, scenario: Scenario):
        assert isinstance(scenario, Scenario)

    @pytest.mark.parametrize(
        "scenario",
        [FRESHMAN_ORIENTATION, FINAL_EXAM_WEEK, GRADUATION_CHOICE],
        ids=["freshman", "final_exam", "graduation"],
    )
    def test_name_not_empty(self, scenario: Scenario):
        assert scenario.name, f"{scenario} 的 name 不能为空"

    @pytest.mark.parametrize(
        "scenario",
        [FRESHMAN_ORIENTATION, FINAL_EXAM_WEEK, GRADUATION_CHOICE],
        ids=["freshman", "final_exam", "graduation"],
    )
    def test_description_not_empty(self, scenario: Scenario):
        assert scenario.description, f"{scenario.name} 的 description 不能为空"

    @pytest.mark.parametrize(
        "scenario",
        [FRESHMAN_ORIENTATION, FINAL_EXAM_WEEK, GRADUATION_CHOICE],
        ids=["freshman", "final_exam", "graduation"],
    )
    def test_initial_events_not_empty(self, scenario: Scenario):
        assert len(scenario.initial_events) >= 1, f"{scenario.name} 至少需要 1 个初始事件"

    @pytest.mark.parametrize(
        "scenario",
        [FRESHMAN_ORIENTATION, FINAL_EXAM_WEEK, GRADUATION_CHOICE],
        ids=["freshman", "final_exam", "graduation"],
    )
    def test_environment_params_has_location(self, scenario: Scenario):
        assert "location" in scenario.environment_params, (
            f"{scenario.name} 的 environment_params 缺少 location"
        )

    @pytest.mark.parametrize(
        "scenario,expected",
        [
            (FRESHMAN_ORIENTATION, "新生报到"),
            (FINAL_EXAM_WEEK, "期末周"),
            (GRADUATION_CHOICE, "毕业选择"),
        ],
        ids=["freshman", "final_exam", "graduation"],
    )
    def test_exact_name(self, scenario: Scenario, expected: str):
        assert scenario.name == expected

    def test_time_range_format(self):
        """time_range 必须是 'N-M' 格式。"""
        for scenario in BUILTIN_SCENARIOS:
            parts = scenario.time_range.split("-")
            assert len(parts) == 2, f"{scenario.name} 的 time_range 格式错误"
            start, end = int(parts[0]), int(parts[1])
            assert start < end, f"{scenario.name} 的 time_range 起始必须小于结束"


# =============================================================================
# BUILTIN_SCENARIOS 列表
# =============================================================================


class TestBuiltinScenariosList:
    """验证汇总列表。"""

    def test_length(self):
        assert len(BUILTIN_SCENARIOS) >= 8

    def test_all_are_scenario_type(self):
        for item in BUILTIN_SCENARIOS:
            assert isinstance(item, Scenario)

    def test_names_unique(self):
        names = [s.name for s in BUILTIN_SCENARIOS]
        assert len(names) == len(set(names)), "BUILTIN_SCENARIOS 中存在重名"

    def test_serializable(self):
        """所有场景都能 model_dump() 序列化为 dict。"""
        for scenario in BUILTIN_SCENARIOS:
            dumped = scenario.model_dump()
            assert isinstance(dumped, dict)
            assert "name" in dumped
            assert "description" in dumped


# =============================================================================
# get_scenario_by_name
# =============================================================================


class TestGetScenarioByName:
    """验证查找函数。"""

    def test_find_existing(self):
        result = get_scenario_by_name("期末周")
        assert result is not None
        assert result.name == "期末周"

    def test_find_all_builtin(self):
        for scenario in BUILTIN_SCENARIOS:
            result = get_scenario_by_name(scenario.name)
            assert result is scenario, f"按名称 {scenario.name} 未找到对应实例"

    def test_not_found_returns_none(self):
        assert get_scenario_by_name("不存在的场景") is None

    def test_empty_name_returns_none(self):
        assert get_scenario_by_name("") is None

    def test_partial_name_returns_none(self):
        """部分匹配不应命中。"""
        assert get_scenario_by_name("新生") is None
