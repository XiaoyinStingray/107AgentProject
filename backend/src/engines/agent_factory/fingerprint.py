"""
Behavior Trace — Step 83: 行为指纹采集与分析。

每 tick 结束时采集 Agent 的决策数据（tool 选择、对话风格、情绪变化），
跨 tick 聚合为"行为指纹"——展示 Agent 的决策偏好路径。
"""

from dataclasses import dataclass, field
from collections import Counter

from loguru import logger


@dataclass
class BehaviorTrace:
    """每 tick 采集一条行为轨迹。"""
    agent_id: str
    tick: int
    tools_called: list[str] = field(default_factory=list)
    message_count: int = 0
    message_total_length: int = 0
    emotion_start: str = "neutral"
    emotion_end: str = "neutral"
    targets_interacted: list[str] = field(default_factory=list)

    @property
    def message_avg_length(self) -> int:
        if self.message_count == 0:
            return 0
        return self.message_total_length // self.message_count


@dataclass
class BehaviorFingerprint:
    """跨 tick 聚合后的行为指纹。"""
    agent_id: str
    total_ticks: int
    tool_distribution: dict[str, int] = field(default_factory=dict)
    emotion_trajectory: list[str] = field(default_factory=list)
    social_network: dict[str, int] = field(default_factory=dict)
    decision_pattern: str = ""
    consistency_score: float = 0.0

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "total_ticks": self.total_ticks,
            "tool_distribution": self.tool_distribution,
            "emotion_trajectory": self.emotion_trajectory[-20:],
            "social_network": self.social_network,
            "decision_pattern": self.decision_pattern,
            "consistency_score": self.consistency_score,
        }


class FingerprintCollector:
    """行为轨迹采集器——每 tick 结束时记录 Agent 行为。"""

    def __init__(self):
        self._traces: dict[str, list[BehaviorTrace]] = {}

    def collect(
        self,
        agent_id: str,
        tick: int,
        tools_called: list[str],
        messages: list[dict],
        emotion_before: str,
        emotion_after: str,
        targets: list[str],
    ) -> BehaviorTrace:
        """记录一个 tick 的行为轨迹。"""
        trace = BehaviorTrace(
            agent_id=agent_id,
            tick=tick,
            tools_called=list(tools_called),
            message_count=len(messages),
            message_total_length=sum(len(m.get("content", "")) for m in messages),
            emotion_start=emotion_before,
            emotion_end=emotion_after,
            targets_interacted=list(targets),
        )
        self._traces.setdefault(agent_id, []).append(trace)
        return trace

    def get_traces(self, agent_id: str) -> list[BehaviorTrace]:
        return self._traces.get(agent_id, [])

    def analyze(self, agent_id: str) -> BehaviorFingerprint:
        """聚合 Agent 的所有轨迹 → 行为指纹。"""
        traces = self._traces.get(agent_id, [])
        if not traces:
            return BehaviorFingerprint(agent_id=agent_id, total_ticks=0)

        tool_counter: Counter = Counter()
        emotion_path: list[str] = []
        social_counter: Counter = Counter()

        for t in traces:
            for tool in t.tools_called:
                tool_counter[tool] += 1
            emotion_path.append(t.emotion_end)
            for target in t.targets_interacted:
                social_counter[target] += 1

        # 决策模式总结
        decision_pattern = _summarize_pattern(tool_counter)

        return BehaviorFingerprint(
            agent_id=agent_id,
            total_ticks=len(traces),
            tool_distribution=dict(tool_counter.most_common(10)),
            emotion_trajectory=emotion_path,
            social_network=dict(social_counter.most_common(10)),
            decision_pattern=decision_pattern,
            consistency_score=_calc_consistency(tool_counter),
        )

    def clear(self, agent_id: str = ""):
        """清除 Agent 的轨迹数据。"""
        if agent_id:
            self._traces.pop(agent_id, None)
        else:
            self._traces.clear()


def _summarize_pattern(tool_counter: Counter) -> str:
    """从 tool 使用分布生成决策模式描述。"""
    total = sum(tool_counter.values()) or 1
    observe_pct = tool_counter.get("observe", 0) / total
    think_pct = tool_counter.get("think_aloud", 0) / total
    send_pct = tool_counter.get("send_message", 0) / total

    if observe_pct > 0.4:
        return "观察型——倾向于先收集信息再行动"
    if think_pct > 0.4:
        return "思考型——偏好内省和计划"
    if send_pct > 0.5:
        return "社交型——主动与他人互动"
    if observe_pct > 0.2 and think_pct > 0.2:
        return "审慎型——观察与思考并重"
    return "平衡型——根据情境灵活调整"


def _calc_consistency(tool_counter: Counter) -> float:
    """计算 tool 使用的一致性分数（0-1）。越高越聚焦，越低越分散。"""
    total = sum(tool_counter.values())
    if total < 3:
        return 1.0
    # 熵归一化：max entropy = log(N)，实际 entropy / max → 一致性与熵反比
    import math
    n = len(tool_counter)
    if n <= 1:
        return 1.0
    entropy = -sum((v / total) * math.log2(v / total) for v in tool_counter.values())
    max_entropy = math.log2(n)
    return round(1.0 - (entropy / max_entropy), 2)
