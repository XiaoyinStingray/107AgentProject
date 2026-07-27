"""
Reporter — 聚合六维分数生成分析报告。
Step 58: LLM 生成自然语言分析，不可用时用规则兜底。
"""

import asyncio

DIM_LABELS = {
    "人格一致性": "是否始终贴合 MBTI 和人格设定",
    "决策质量": "行动是否连贯、有逻辑、目标导向",
    "交互深度": "社交互动是否丰富、语境恰当",
    "鲁棒性": "跨场景和重复运行的稳定性",
    "创造力": "行为多样性、非重复性",
    "适应性": "对环境变化的响应速度",
}


async def generate_report(scores: dict, task_count: int) -> str:
    """LLM 生成分析报告。不可用时用规则模板兜底。"""
    score_lines = "\n".join(
        f"- {dim}: {scores.get(dim, 0):.1f}/100 — {DIM_LABELS.get(dim, '')}"
        for dim in DIM_LABELS
    )

    prompt = f"""你是一个 LLM 评测分析专家。请根据以下六维评测分数，撰写一份 200 字以内的简要分析报告。

评测任务数：{task_count}
六维分数：
{score_lines}

请分析：
1. 该 LLM 的整体表现（优/良/中/差）
2. 最强的维度和最弱的维度
3. 一句话改进建议

直接回复报告文本。"""

    try:
        from autogen_core.models import UserMessage
        # Use the default model client for report generation
        from llm.client import create_model_client
        client = create_model_client()
        result = await asyncio.wait_for(
            client.create(messages=[UserMessage(content=prompt, source="reporter")]),
            timeout=15.0,
        )
        return (result.content if hasattr(result, "content") else str(result)).strip()
    except Exception:
        pass

    # 规则兜底
    best = max(scores.items(), key=lambda x: x[1])
    worst = min(scores.items(), key=lambda x: x[1])
    avg = sum(scores.values()) / len(scores) if scores else 0
    grade = "优" if avg >= 80 else "良" if avg >= 60 else "中" if avg >= 40 else "差"

    return (
        f"【评测分析报告】\n\n"
        f"评测任务数：{task_count}\n"
        f"综合评级：{grade}（平均分 {avg:.1f}）\n\n"
        f"最强维度：{best[0]}（{best[1]:.1f}分）— {DIM_LABELS.get(best[0], '')}\n"
        f"最弱维度：{worst[0]}（{worst[1]:.1f}分）— {DIM_LABELS.get(worst[0], '')}\n\n"
        f"改进建议：建议在「{worst[0]}」维度上加强优化。\n"
    )
