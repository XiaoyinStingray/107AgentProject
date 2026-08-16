"""
LearningCurve — 团队学习画像（Step 68 重写）。

对已完成 Team 做多维画像：
  - 若有多次历史 Plan → 展示指标趋势
  - 对最新报告做 LLM 多维评分 → 雷达图数据
  - 总结强弱项
"""

from datetime import datetime


def compute_learning_curve(plans: list[dict]) -> dict:
    """从 Team 的历史 Plan 列表中提取趋势 + 画像数据。

    返回:
        {points, trend, total_plans, latest_report}
    """
    if not plans:
        return {"points": [], "trend": "无数据", "total_plans": 0}

    points = []
    for i, plan in enumerate(plans):
        steps = plan.get("steps", [])
        if isinstance(steps, str):
            import json as _json
            try:
                steps = _json.loads(steps)
            except Exception:
                steps = []

        done = sum(1 for s in steps if s.get("status") == "done") if isinstance(steps, list) else 0
        total = len(steps) if isinstance(steps, list) else 0
        has_report = bool(plan.get("report"))
        # 优先用 progress_pct，否则从步骤状态计算
        if isinstance(plan.get("progress_pct"), (int, float)) and plan["progress_pct"] > 0:
            completion_pct = round(plan["progress_pct"] * 100)
        elif total > 0:
            completion_pct = round(done / total * 100)
        else:
            completion_pct = 0

        points.append({
            "index": i + 1,
            "task": plan.get("task", f"任务{i+1}"),
            "total_steps": total,
            "completed_steps": done,
            "completion_pct": completion_pct,
            "has_report": has_report,
            "created_at": str(plan.get("created_at", "")),
        })

    # 趋势
    if len(points) >= 2:
        first_half = points[:len(points)//2]
        second_half = points[len(points)//2:]
        avg_first = sum(p["completion_pct"] for p in first_half) / len(first_half)
        avg_second = sum(p["completion_pct"] for p in second_half) / len(second_half)
        if avg_second > avg_first + 10:
            trend = "📈 进步中"
        elif avg_second < avg_first - 10:
            trend = "📉 需关注"
        else:
            trend = "➡ 稳定"
    else:
        trend = "🆕 首次任务"

    # 最新报告（供 LLM 评分使用）
    latest = plans[-1] if plans else {}
    latest_report = latest.get("report")

    return {
        "points": points,
        "trend": trend,
        "total_plans": len(plans),
        "latest_task": latest.get("task", ""),
        "latest_report": latest_report,
    }
