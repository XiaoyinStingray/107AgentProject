"""
Team Versus — 多维 LLM 评审引擎（Step 68 重写）。

不依赖实时执行——对已完成报告做深度多维评分。
单 Team 可用作"学习画像"，双 Team 可用作"对抗对比"。
"""

import json as _json
from loguru import logger

# 评分维度
DIMENSIONS = [
    {"key": "completeness",   "label": "完整性",   "desc": "是否覆盖了任务的所有要点"},
    {"key": "innovation",     "label": "创新性",   "desc": "是否有独特的视角或方案"},
    {"key": "feasibility",    "label": "可行性",   "desc": "方案是否可落地执行"},
    {"key": "clarity",        "label": "清晰度",   "desc": "报告是否结构清晰、易于理解"},
    {"key": "collaboration",  "label": "协作痕迹", "desc": "是否体现了良好的分工合作"},
    {"key": "depth",          "label": "深度",     "desc": "分析是否深入，有无肤浅之处"},
    {"key": "practicality",   "label": "实用性",   "desc": "产出是否可以直接使用"},
    {"key": "creativity",     "label": "创造力",   "desc": "是否有令人惊喜的亮点"},
]


async def score_team(
    team_name: str,
    report: dict,
    task: str,
    model_client,
) -> dict:
    """对单个 Team 的报告做多维评分。

    返回: {scores: {dim: {score, comment}}, overall, strengths, weaknesses, summary}
    """
    if not model_client:
        return _fallback_score(team_name, report, task)

    content = report.get("content", "") if isinstance(report, dict) else str(report)
    dim_list = "\n".join(f"{i+1}. {d['label']}（{d['desc']}）" for i, d in enumerate(DIMENSIONS))

    prompt = f"""你是严厉的专业评审。请对以下团队产出做多维评分。不要给面子——有不足就扣分，平庸就是 5-6 分，真正优秀的才给 8+。

## 任务
{task[:300]}

## 团队：{team_name}
## 产出报告
{content[:1200]}

## 评分维度与打分标准（每维 1-10 分）

{chr(10).join(f"{i+1}. {d['label']}（{d['desc']}）" for i, d in enumerate(DIMENSIONS))}

**评分参考：**
- 1-3 分：严重缺失、敷衍、文不对题
- 4-5 分：有涉及但肤浅、模板化、无实质内容
- 6-7 分：合格，覆盖要点但无亮点
- 8-9 分：优秀，有深度或独特见解
- 10 分：卓越，接近专业水准

**重要：必须打出区分度。8 个维度中至少有 3 个分数差距 ≥ 3 分。如果所有维度分数相同，说明你没有认真评审。**

返回 JSON：
{{"scores":{{"completeness":{{"score":6,"comment":"覆盖了基本要点但缺少细节"}},"innovation":{{"score":4,"comment":"方案较常规"}},...}},"overall":6,"strengths":["..."],"weaknesses":["..."],"summary":"30字总结"}}

只返回 JSON。"""

    try:
        import asyncio
        from autogen_core.models import UserMessage
        from autogen_core import CancellationToken

        response = await asyncio.wait_for(
            model_client.create(
                messages=[UserMessage(content=prompt, source="versus_score")],
                cancellation_token=CancellationToken(),
            ),
            timeout=15.0,
        )
        text = response.content if isinstance(response.content, str) else str(response.content)
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = _json.loads(text)
        result["team_name"] = team_name
        logger.info(f"[versus] scored {team_name}: overall={result.get('overall','?')}")
        return result
    except Exception as e:
        logger.warning(f"[versus] LLM score failed: {e}")
        return _fallback_score(team_name, report, task)


async def judge_versus(
    team_a: dict,
    team_b: dict,
    report_a: dict,
    report_b: dict,
    task: str,
    model_client,
) -> dict:
    """双 Team 对比——分别评分后生成对比报告。"""
    score_a = await score_team(team_a.get("name", "A"), report_a, task, model_client)
    score_b = await score_team(team_b.get("name", "B"), report_b, task, model_client)

    # 对比分析
    overall_a = score_a.get("overall", 0)
    overall_b = score_b.get("overall", 0)
    winner = "A" if overall_a > overall_b else "B" if overall_b > overall_a else "tie"

    diffs = []
    for d in DIMENSIONS:
        k = d["key"]
        sa = (score_a.get("scores", {}).get(k, {}) or {}).get("score", 0)
        sb = (score_b.get("scores", {}).get(k, {}) or {}).get("score", 0)
        if abs(sa - sb) >= 2:
            diffs.append({
                "dim": d["label"],
                "a": sa, "b": sb,
                "winner": "A" if sa > sb else "B",
                "gap": abs(sa - sb),
            })

    return {
        "winner": winner,
        "team_a_name": score_a.get("team_name", team_a.get("name", "A")),
        "team_b_name": score_b.get("team_name", team_b.get("name", "B")),
        "scores_a": score_a.get("scores", {}),
        "scores_b": score_b.get("scores", {}),
        "overall_a": overall_a,
        "overall_b": overall_b,
        "strengths_a": score_a.get("strengths", []),
        "strengths_b": score_b.get("strengths", []),
        "weaknesses_a": score_a.get("weaknesses", []),
        "weaknesses_b": score_b.get("weaknesses", []),
        "summary_a": score_a.get("summary", ""),
        "summary_b": score_b.get("summary", ""),
        "key_diffs": diffs,
        "task": task,
    }


def _fallback_score(team_name: str, report: dict, task: str) -> dict:
    """无 LLM 时的规则兜底评分。"""
    content = report.get("content", "") if isinstance(report, dict) else str(report)
    length = len(content)
    steps = report.get("steps_count", 0) or report.get("completed_count", 0)

    base = min(10, max(3, length // 150 + steps))
    return {
        "team_name": team_name,
        "scores": {d["key"]: {"score": base, "comment": "规则评估"} for d in DIMENSIONS},
        "overall": base,
        "strengths": ["报告已生成"],
        "weaknesses": ["无 LLM 深度评估"],
        "summary": f"规则评估：{length}字/{steps}步，综合{base}分",
    }
