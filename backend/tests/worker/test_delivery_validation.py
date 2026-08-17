"""最终交付确定性校验测试。"""

from engines.worker.delivery_validation import validate_delivery


def test_rejects_the_real_95_minutes_claimed_as_90_case():
    task = "制定学习计划，保留答疑环节，并确保最终总时长严格等于90分钟。"
    deliverable = """# 今日学习计划（共90分钟）
- **答疑：30分钟**
- **自学：25分钟**
- **练习：25分钟**
- **休息：5分钟**
- **自评：10分钟**

30 + 25 + 25 + 5 + 10 = **90分钟** ✓
"""

    issues = validate_delivery(task, deliverable)

    assert len(issues) == 2
    assert any("程序计算结果为 95" in issue["evidence"] for issue in issues)
    assert any("程序合计 95 分钟" in issue["evidence"] for issue in issues)


def test_accepts_a_correct_90_minute_allocation():
    task = "制定严格90分钟的学习计划。"
    deliverable = """# 学习计划
- 答疑：30分钟
- 自学：25分钟
- 休息：5分钟
- 练习：25分钟
- 自评：5分钟

30 + 25 + 5 + 25 + 5 = 90分钟
"""

    assert validate_delivery(task, deliverable) == []


def test_checks_full_width_operators_and_decimal_results():
    issues = validate_delivery("核对结果", "1.5 ＋ 2.5 ＝ 5")

    assert len(issues) == 1
    assert "程序计算结果为 4" in issues[0]["evidence"]


def test_does_not_guess_total_when_task_has_no_total_duration_constraint():
    task = "写一份包含学习和休息的计划。"
    deliverable = """- 学习：30分钟
- 休息：10分钟
"""

    assert validate_delivery(task, deliverable) == []
