"""
Behavioral Fingerprint — Agent 行为指纹分析（Step 70）。

从 bench 评测的 raw events 中提取决策偏好、工具使用模式、对话风格。
"""

from collections import Counter
import json as _json


def diagnose_scores(results: list[dict]) -> dict:
    """从事件诊断评分原因——解释每个维度为什么高分或低分。

    返回: {agent_name: {dimension: {score, diagnosis, evidence}}}
    """
    if not results:
        return {"agents": {}, "summary": "无数据", "hint": "运行一次新的评测以收集事件数据"}

    has_events = False
    agents: dict[str, dict] = {}
    for r in results:
        name = r.get("agent_template", "unknown")
        events_raw = r.get("events_json")
        if isinstance(events_raw, str) and events_raw:
            try: events = _json.loads(events_raw)
            except Exception: events = []
        elif isinstance(events_raw, list) and len(events_raw) > 0:
            events = events_raw
        else:
            events = []
        if events:
            has_events = True

        scores = r.get("scores")
        if isinstance(scores, str):
            try: scores = _json.loads(scores)
            except Exception: scores = {}

        if name not in agents:
            agents[name] = {"results": [], "diagnostics": {}}

        agents[name]["results"].append({"events": events, "scores": scores, "scenario": r.get("scenario", "")})

    # 为每个 Agent 生成诊断
    output = {}
    for name, data in agents.items():
        all_events = []
        for res in data["results"]:
            all_events.extend(res["events"])

        if not all_events:
            output[name] = {"diagnostics": {}, "summary": "无事件数据"}
            continue

        thoughts = [e for e in all_events if e.get("type") == "thought_stream"]
        messages = [e for e in all_events if e.get("type") == "agent_message"]
        actions = [e for e in all_events if e.get("type") == "agent_action"]

        # 聚合分数
        avg_scores = {}
        for res in data["results"]:
            for k, v in (res["scores"] or {}).items():
                if isinstance(v, (int, float)):
                    avg_scores[k] = avg_scores.get(k, 0) + v
        for k in avg_scores:
            avg_scores[k] = round(avg_scores[k] / max(len(data["results"]), 1), 1)

        diagnostics = {}
        for dim, score in avg_scores.items():
            diag = _diagnose_dimension(dim, score, thoughts, messages, actions, all_events)
            diagnostics[dim] = diag

        output[name] = {
            "diagnostics": diagnostics,
            "scores": avg_scores,
            "event_counts": {"thoughts": len(thoughts), "messages": len(messages), "actions": len(actions)},
        }

    return {
        "agents": output,
        "total_agents": len(output),
        "has_events": has_events,
        "hint": None if has_events else "此评测没有原始事件数据（可能来自旧版本），运行一次新的评测以收集事件数据用于诊断",
    }


def _diagnose_dimension(dim: str, score: float, thoughts: list, messages: list, actions: list, all: list) -> dict:
    """诊断单个维度。"""
    reasons: list[str] = []

    if dim == "人格一致性":
        if len(thoughts) < 10:
            reasons.append(f"思考次数偏少({len(thoughts)}次)，内部推理不充分")
        elif len(thoughts) > 40:
            reasons.append(f"思考次数过多({len(thoughts)}次)，可能反复纠结")
        else:
            reasons.append(f"思考节奏正常({len(thoughts)}次)")
        if score < 50:
            reasons.append("人格表现不稳定，建议降低temperature或加强system prompt约束")
        elif score > 75:
            reasons.append("人格维持良好，角色一致性高")

    elif dim == "决策质量":
        action_types = set()
        for e in actions:
            for kw in ["决定", "选择", "计划", "判断", "分析"]:
                if kw in (e.get("content", "") or ""):
                    action_types.add(kw)
        reasons.append(f"决策类型: {len(action_types)}种 ({', '.join(action_types) if action_types else '无'})")
        if score < 50:
            reasons.append("决策方式单一，缺乏多角度思考")
        elif score > 75:
            reasons.append("决策多样化，能综合多种方式判断")

    elif dim == "交互深度":
        avg_len = int(sum(len(e.get("content", "") or "") for e in messages) / max(len(messages), 1))
        reasons.append(f"平均消息长度: {avg_len}字")
        if score < 50:
            reasons.append("回复过于简短，缺乏展开讨论")
        elif score > 75:
            reasons.append("回复内容充实，交互深入")

    elif dim == "创造力":
        event_types = set(e.get("type", "") for e in all)
        reasons.append(f"事件多样性: {len(event_types)}种类型")
        if score < 50:
            reasons.append("行为模式单一重复")
        elif score > 75:
            reasons.append("行为模式丰富多样")

    elif dim == "鲁棒性":
        reasons.append("跨场景稳定性评估（需多次评测）" if score > 70 else "跨场景表现波动较大")

    elif dim == "适应性":
        content_lens = [len(e.get("content", "") or "") for e in all if e.get("content")]
        if content_lens:
            avg = sum(content_lens) / len(content_lens)
            variance = sum((l - avg) ** 2 for l in content_lens) / len(content_lens)
            reasons.append(f"回复长度标准差: {int(variance**0.5)}")
            if score < 50:
                reasons.append("对不同情境的响应缺乏变化")
            else:
                reasons.append("能根据情境调整表达方式")

    return {
        "score": score,
        "reasons": reasons,
        "level": "优秀" if score >= 80 else "良好" if score >= 60 else "一般" if score >= 40 else "较差",
    }


def analyze_fingerprint(results: list[dict]) -> dict:
    """行为指纹（保留兼容，主要用 diagnose_scores）。"""
    return diagnose_scores(results)
    """从多条 BenchResult 中构建行为指纹。

    results: [{agent_template, scenario, events_json, ...}]

    返回: {agents: {name: {patterns, tools, ...}}}
    """
    agents: dict[str, dict] = {}

    for r in results:
        name = r.get("agent_template", "unknown")
        events_raw = r.get("events_json")
        if isinstance(events_raw, str):
            try:
                events = _json.loads(events_raw)
            except Exception:
                events = []
        elif isinstance(events_raw, list):
            events = events_raw
        else:
            events = []

        if name not in agents:
            agents[name] = {"event_types": Counter(), "actions": Counter(),
                           "ticks": 0, "avg_msg_len": 0, "scenarios": set()}

        profile = agents[name]
        lengths = []
        for e in events:
            t = e.get("type", "unknown")
            profile["event_types"][t] += 1
            content = e.get("content", "")
            lengths.append(len(content))
            # 提取动作关键词
            for kw in ["决定", "选择", "建议", "认为", "判断", "分析", "计划",
                       "尝试", "想要", "避免", "拒绝", "接受", "坚持", "妥协"]:
                if kw in content:
                    profile["actions"][kw] += 1

        profile["ticks"] += 8
        profile["avg_msg_len"] = int(sum(lengths) / max(len(lengths), 1))
        profile["scenarios"].add(r.get("scenario", ""))

    # 归一化为百分比
    result = {}
    for name, p in agents.items():
        total = sum(p["event_types"].values()) or 1
        result[name] = {
            "event_distribution": {k: round(v / total * 100) for k, v in p["event_types"].most_common(5)},
            "top_actions": [{"action": k, "count": v} for k, v in p["actions"].most_common(8) if v > 0],
            "avg_message_length": p["avg_msg_len"],
            "scenarios_tested": len(p["scenarios"]),
            "dominant_style": _classify_style(p["actions"]),
        }

    return {"agents": result, "total_agents": len(result)}


def _classify_style(actions: Counter) -> str:
    """根据动作关键词分类 Agent 决策风格。"""
    analytical = actions.get("分析", 0) + actions.get("判断", 0) + actions.get("计划", 0)
    intuitive = actions.get("想要", 0) + actions.get("尝试", 0) + actions.get("选择", 0)
    assertive = actions.get("决定", 0) + actions.get("坚持", 0) + actions.get("接受", 0)
    avoidant = actions.get("避免", 0) + actions.get("拒绝", 0) + actions.get("妥协", 0)

    total = analytical + intuitive + assertive + avoidant
    if total == 0:
        return "中性"

    styles = []
    if analytical / total > 0.3: styles.append("分析型")
    if intuitive / total > 0.3: styles.append("直觉型")
    if assertive / total > 0.3: styles.append("果断型")
    if avoidant / total > 0.3: styles.append("谨慎型")
    return "+".join(styles) if styles else "平衡型"


def detect_degradation(runs: list[dict]) -> dict:
    """检测多次评测中的劣化趋势。

    runs: [{id, created_at, scores_json, llm_model, ...}]

    返回: {model: {trend, declining, points}}
    """
    by_model: dict[str, list] = {}
    for run in runs:
        model = run.get("llm_model", "unknown")
        scores = run.get("scores")
        if isinstance(scores, str):
            try: scores = _json.loads(scores)
            except Exception: continue
        if not scores:
            continue
        overall = sum(v for v in scores.values()) / max(len(scores), 1) if isinstance(scores, dict) else 0
        by_model.setdefault(model, []).append({
            "run_id": run.get("id", ""),
            "created_at": run.get("created_at", ""),
            "overall": round(overall, 1),
        })

    result = {}
    for model, points in by_model.items():
        points.sort(key=lambda p: p["created_at"])
        if len(points) < 2:
            result[model] = {"trend": "数据不足", "declining": False, "points": points}
            continue

        # 最近 3 次 vs 前 3 次
        recent = [p["overall"] for p in points[-3:]]
        earlier = [p["overall"] for p in points[:3]]
        avg_recent = sum(recent) / len(recent)
        avg_earlier = sum(earlier) / len(earlier)

        declining = avg_recent < avg_earlier - 5  # 下降 >5 分

        if avg_recent > avg_earlier + 5:
            trend = "📈 提升"
        elif declining:
            trend = "📉 劣化"
        else:
            trend = "➡ 稳定"

        result[model] = {"trend": trend, "declining": declining, "points": points}

    return result
