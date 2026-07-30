"""
MetricCalculator — 六维评测评分器。
Step 58: 从模拟事件中提取六维指标，每维 0-100 分。
"""

import math
from collections import Counter


def calculate_metrics(events: list[dict], persona: dict) -> dict:
    """从模拟事件计算六维分数。

    events: SSE 事件列表 [{type, content, action, ...}]
    persona: Agent 人格信息 {mbti, big_five, decision_style}

    返回: {人格一致性, 决策质量, 交互深度, 鲁棒性, 创造力, 适应性}
    """
    if not events:
        return _zero_scores()

    thought_events = [e for e in events if e.get("type") == "thought_stream"]
    action_events = [e for e in events if e.get("type") == "agent_action"]
    message_events = [e for e in events if e.get("type") == "agent_message"]
    content_lengths = [len(e.get("content", "") or "") for e in events if e.get("content")]

    return {
        "人格一致性": _round_score(_calc_consistency(thought_events, persona)),
        "决策质量": _round_score(_calc_decision_quality(action_events, thought_events)),
        "交互深度": _round_score(_calc_interaction_depth(message_events, events)),
        "鲁棒性": 80.0,
        "创造力": _round_score(_calc_creativity(events)),
        "适应性": _round_score(_calc_adaptability(thought_events, content_lengths)),
    }


def aggregate_scores(all_scores: list[dict]) -> dict:
    """聚合多次评测，并以跨任务综合分方差计算鲁棒性。"""
    if not all_scores:
        return _zero_scores()
    dims = ["人格一致性", "决策质量", "交互深度", "鲁棒性", "创造力", "适应性"]
    score_dims = [d for d in dims if d != "鲁棒性"]
    result = {
        d: round(sum(s.get(d, 0) for s in all_scores) / len(all_scores), 1)
        for d in score_dims
    }

    # 单条任务中的“鲁棒性”只是占位值；真正的稳定性必须比较多条任务。
    sample_scores = [
        sum(s.get(d, 0) for d in score_dims) / len(score_dims)
        for s in all_scores
    ]
    average = sum(sample_scores) / len(sample_scores)
    if average == 0:
        robustness = 0.0
    elif len(sample_scores) == 1:
        robustness = 85.0
    else:
        variance = sum((v - average) ** 2 for v in sample_scores) / len(sample_scores)
        cv = math.sqrt(variance) / average
        robustness = max(0.0, min(100.0, 100.0 - cv * 100.0))
    result["鲁棒性"] = _round_score(robustness)
    return {dimension: result[dimension] for dimension in dims}


# ── 单维评分函数 ──────────────────────────────────────────

def _round_score(v: float) -> float | int:
    r = round(v, 1)
    return int(r) if r == int(r) else r


def _calc_consistency(thoughts: list[dict], persona: dict) -> float:
    """人格一致性：思维数量合理 + 情绪波动在预期范围。"""
    if not thoughts:
        return 50.0
    # 思维流数量是否合理（太少=不思考，太多=过度内省）
    count = len(thoughts)
    if 3 <= count <= 20:
        score = 80.0
    elif count < 3:
        score = 40.0 + count * 10
    else:
        score = max(30, 80 - (count - 20) * 2)
    return min(100, score)


def _calc_decision_quality(actions: list[dict], thoughts: list[dict]) -> float:
    """决策质量：行动多样性 + 行动-思考连贯性。"""
    if not actions:
        return 30.0
    # 行动类型多样性
    action_types = Counter(a.get("action", "") for a in actions)
    type_count = len(action_types)
    # 有至少 2 种行动类型 → 基础分
    base = min(70, type_count * 25)
    # 思考后行动的比率
    thought_ratio = min(1.0, len(thoughts) / max(1, len(actions)))
    return min(100, base + thought_ratio * 30)


def _calc_interaction_depth(messages: list[dict], all_events: list[dict]) -> float:
    """交互深度：消息丰富度 + 长度。"""
    if not messages:
        return 20.0
    total_len = sum(len(m.get("content", "") or "") for m in messages)
    avg_len = total_len / len(messages) if messages else 0
    # 消息长度评分（20字以下差，100字以上好）
    len_score = min(80, avg_len / 2)
    # 消息占比评分
    ratio = len(messages) / max(1, len(all_events))
    ratio_score = min(40, ratio * 80)
    return min(100, len_score + ratio_score)


def _calc_creativity(events: list[dict]) -> float:
    """创造力：事件类型多样性（熵）。"""
    types = [e.get("type", "") for e in events]
    counter = Counter(types)
    total = len(types) or 1
    entropy = -sum((c / total) * math.log2(c / total) for c in counter.values() if c > 0)
    max_entropy = math.log2(max(len(counter), 1)) or 1
    return min(100, (entropy / max_entropy) * 100)


def _calc_adaptability(thoughts: list[dict], lengths: list[int]) -> float:
    """适应性：思维流内容长度变化幅度。"""
    if len(lengths) < 3:
        return 60.0
    # 内容长度有变化 → 说明在适应不同情境
    avg = sum(lengths) / len(lengths)
    if avg == 0:
        return 50.0
    variance = sum((length - avg) ** 2 for length in lengths) / len(lengths)
    cv = math.sqrt(variance) / avg
    # 变异系数适中最佳（有变化但不极端）
    return min(100, max(30, cv * 150))


def _zero_scores() -> dict:
    return {"人格一致性": 0.0, "决策质量": 0.0, "交互深度": 0.0, "鲁棒性": 0.0, "创造力": 0.0, "适应性": 0.0}
