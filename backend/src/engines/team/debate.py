"""
DebateDetector — 实时辩论检测引擎（Step 67）。

分析 Agent 消息中的观点冲突，提取正反方+分歧度+共识进度。
"""

from collections import Counter
from loguru import logger


def detect_debate(
    agent_messages: list[dict],
    agents: list[dict],
    current_tick: int,
) -> dict | None:
    """从近期消息中检测辩论状态。

    agent_messages: [{agent_id, name, content, ...}]
    agents: [{id, name, ...}]

    返回 DebateState dict，无争议时返回 None。
    """
    if len(agent_messages) < 2:
        return None

    # 取最近 6 条消息分析（降低阈值，更快响应）
    recent = agent_messages[-6:]

    # ── 关键词分歧检测（扩词库）──
    POSITIVE_KW = ["支持", "同意", "对", "好", "可以", "行", "就这样", "我觉得对", "没错",
                   "赞成", "合理", "没问题", "这个方案", "我建议", "应该", "需要",
                   "赞同", "认可", "推荐", "好主意", "就这么办"]
    NEGATIVE_KW = ["不对", "不行", "但是", "可是", "我反对", "不同意", "有问题", "错了",
                   "风险", "担心", "未必", "不一定", "换个角度", "不太合适",
                   "再想想", "质疑", "不赞同", "弊端", "缺点", "不太现实"]

    positions: dict[str, list[str]] = {}  # agent_id → [stances]
    for msg in recent:
        content = msg.get("content", "") or msg.get("message", "")
        aid = msg.get("agent_id", "")
        if not aid or not content:
            continue
        pro = sum(1 for kw in POSITIVE_KW if kw in content)
        con = sum(1 for kw in NEGATIVE_KW if kw in content)
        if pro > con:
            positions.setdefault(aid, []).append("pro")
        elif con > pro:
            positions.setdefault(aid, []).append("con")
        else:
            positions.setdefault(aid, []).append("neutral")

    if len(positions) < 2:
        return None

    # 统计立场
    pro_agents: list[str] = []
    con_agents: list[str] = []
    neutral_agents: list[str] = []
    for aid, stances in positions.items():
        c = Counter(stances)
        if c["pro"] > c["con"] and c["pro"] > c["neutral"]:
            pro_agents.append(aid)
        elif c["con"] > c["pro"] and c["con"] > c["neutral"]:
            con_agents.append(aid)
        else:
            neutral_agents.append(aid)

    if not pro_agents and not con_agents:
        # 无显著立场: 返回空辩论状态
        name_map = {a["id"]: a.get("name", a["id"][:8]) for a in agents}
        return {
            "topic": "讨论中…",
            "phase": "discussing",
            "divergence": 0,
            "stance_gap": 0,
            "pro_agents": [],
            "con_agents": [],
            "neutral_agents": [{"id": aid, "name": name_map.get(aid, aid)} for aid in positions.keys()],
            "total_agents": len(agents),
            "tick": current_tick,
        }

    # ── 分歧度计算（修正：无人反对 → 0% 分歧）──
    total = len(pro_agents) + len(con_agents) + len(neutral_agents)
    # 分歧度 = 少数派占比 × 2（双方都有时才有意义）
    has_both = len(pro_agents) > 0 and len(con_agents) > 0
    if has_both:
        minority = min(len(pro_agents), len(con_agents))
        divergence = (minority / max(total, 1)) * 2  # 少数派越多→越分裂
    else:
        divergence = 0.0  # 一边倒 = 无分歧

    # 立场差：pro 占比 vs con 占比的差距（0=势均力敌, 1=一边倒）
    stance_gap = abs(len(pro_agents) - len(con_agents)) / max(len(pro_agents) + len(con_agents), 1)

    # ── 共识判定（修正优先级）──
    if not has_both:
        phase = "discussing"   # 无人反对，普通讨论
    elif divergence > 0.5:
        phase = "debating"     # 少数派 > 25%，激烈辩论
    elif stance_gap > 0.6:
        phase = "polarized"    # 一边人多但有人坚持反对
    elif neutral_agents and len(neutral_agents) >= total * 0.3:
        phase = "converging"   # 趋于共识
    else:
        phase = "discussing"

    # ── 尝试提取辩论主题 ──
    topic = _extract_topic(recent)

    # ── 构建 Agent 名称映射 ──
    name_map = {a["id"]: a.get("name", a["id"][:8]) for a in agents}

    return {
        "topic": topic,
        "phase": phase,
        "divergence": round(divergence, 2),
        "stance_gap": round(stance_gap, 2),
        "pro_agents": [{"id": aid, "name": name_map.get(aid, aid)} for aid in pro_agents],
        "con_agents": [{"id": aid, "name": name_map.get(aid, aid)} for aid in con_agents],
        "neutral_agents": [{"id": aid, "name": name_map.get(aid, aid)} for aid in neutral_agents],
        "total_agents": total,
        "tick": current_tick,
    }


def _extract_topic(messages: list[dict]) -> str:
    """从消息中提取可能的辩论主题。"""
    # 简单策略：找出现频率最高的名词片段
    topic_words = ["方案", "设计", "架构", "技术", "产品", "功能", "需求",
                   "计划", "任务", "接口", "数据", "测试", "部署", "预算",
                   "时间", "优先级", "角色", "分工", "标准", "流程"]
    all_text = " ".join(m.get("content", "") or m.get("message", "") for m in messages)
    best = None
    best_count = 0
    for w in topic_words:
        c = all_text.count(w)
        if c > best_count:
            best_count = c
            best = w
    return best if best else "方案方向"
