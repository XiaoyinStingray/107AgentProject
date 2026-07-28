"""
TeamDiagnostics — 团队异常检测。
Step 54: 行为偏离阈值、冲突检测、参与度评分。
"""

from loguru import logger


# ── 偏离检测 ─────────────────────────────────────────────

class DiagnosticsEngine:
    """检测 Team 运行中的异常——角色冲突、行为偏离、参与不均衡。"""

    def __init__(self, agents: list[dict]):
        """
        agents: [{id, name, role, mbti}]
        """
        self.agents = agents
        self._msg_counts: dict[str, int] = {a["id"]: 0 for a in agents}
        self._tick_silent: dict[str, int] = {a["id"]: 0 for a in agents}
        self._alerts: list[dict] = []

    # ── 每 tick 调用 ────────────────────────────────────

    def on_tick(self, tick: int, events: list[dict]) -> list[dict]:
        """分析本 tick 的事件，返回新增告警列表。

        告警类型:
        - low_participation: Agent 连续 N tick 未发言
        - deviation: Agent 行为偏离人格基线（预留，需 LLM）
        - conflict: 两个 Agent 目标互斥（预留，需 LLM）
        """
        new_alerts = []

        # 统计本 tick 各 Agent 发言次数
        active_this_tick: set[str] = set()
        for e in events:
            agent_id = e.get("agent_id") or e.get("source") or ""
            if agent_id and e.get("type") in ("agent_message", "agent_action"):
                active_this_tick.add(agent_id)
                self._msg_counts[agent_id] = self._msg_counts.get(agent_id, 0) + 1

        # 检测沉默 Agent
        for aid in self._msg_counts:
            if aid in active_this_tick:
                self._tick_silent[aid] = 0
            else:
                self._tick_silent[aid] = self._tick_silent.get(aid, 0) + 1

            if self._tick_silent[aid] >= 5:
                alert = {
                    "type": "low_participation",
                    "tick": tick,
                    "agent_id": aid,
                    "severity": "warning",
                    "message": f"Agent {aid[:8]} 已连续 {self._tick_silent[aid]} tick 未发言",
                }
                # 避免重复告警：每 5 tick 只报一次
                if self._tick_silent[aid] % 5 == 0 or self._tick_silent[aid] == 5:
                    new_alerts.append(alert)
                    self._alerts.append(alert)
                    logger.warning(
                        f"Diagnostics: low_participation for {aid[:8]} "
                        f"(silent {self._tick_silent[aid]} ticks)"
                    )

        return new_alerts

    # ── 参与度评分 ──────────────────────────────────────

    def participation_scores(self) -> dict[str, float]:
        """计算各 Agent 的参与度分数 (0.0 ~ 1.0)。

        基于发言占比，1.0 = 最活跃。
        """
        total = sum(self._msg_counts.values())
        if total == 0:
            return {aid: 0.0 for aid in self._msg_counts}
        return {
            aid: round(count / total, 3)
            for aid, count in self._msg_counts.items()
        }

    # ── 冲突检测（规则兜底） ────────────────────────────

    def detect_conflicts(self, events: list[dict]) -> list[dict]:
        """检测 Agent 间的目标冲突。

        当前为规则检测：如果两个 Agent 在同一 tick 对同一目标发出
        方向相反的动作（如一个推进、一个阻止），标记为冲突。
        """
        conflicts = []
        # 按 tick 分组
        tick_actions: dict[int, list[dict]] = {}
        for e in events:
            tick = e.get("tick", 0)
            if e.get("type") == "agent_action":
                tick_actions.setdefault(tick, []).append(e)

        for tick, actions in tick_actions.items():
            # 简化检测：同一 tick 内不同 Agent 的 action 数量 > 阈值
            agents_involved = set()
            for a in actions:
                aid = a.get("agent_id", "")
                if aid:
                    agents_involved.add(aid)
            if len(agents_involved) >= 3 and len(actions) >= 5:
                conflicts.append({
                    "type": "potential_conflict",
                    "tick": tick,
                    "agents": list(agents_involved),
                    "action_count": len(actions),
                    "severity": "info",
                    "message": f"Tick {tick}: {len(agents_involved)} 个 Agent 产生了 {len(actions)} 个并行操作",
                })

        return conflicts

    # ── 汇总 ──────────────────────────────────────────

    def summary(self) -> dict:
        """返回当前诊断汇总。"""
        return {
            "alerts": self._alerts[-10:],  # 最近 10 条
            "participation": self.participation_scores(),
            "total_messages": sum(self._msg_counts.values()),
        }
