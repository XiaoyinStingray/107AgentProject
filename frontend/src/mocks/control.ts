import type { AgentResponse } from "../types/agent";
import type { SSEEvent } from "../types/events";
import type {
  AgentStats,
  ControlTab,
  DecisionPattern,
  HeatmapCell,
} from "../types/control";

/* ================================================================
   Step 24 — M6 控制台 Mock 数据 + 聚合工具
   不调后端，直接从 MOCK_AGENTS + MOCK_SANDBOX_EVENTS 聚合统计。
   ================================================================ */

/** M6 Tab 元数据——与 menuData.ts M6 模块 7 项对齐。 */
export interface ControlTabMeta {
  key: ControlTab;
  label: string;
  emoji: string;
  description: string;
  priority: "P1" | "P2";
  available: boolean;
}

/** 7 个 Tab：4 可用 + 3 P3 占位。 */
export const CONTROL_TABS: ControlTabMeta[] = [
  {
    key: "dashboard",
    label: "多 Agent 仪表盘",
    emoji: "📊",
    description: "所有 Agent 的实时状态汇总：精力、情绪、行动计数",
    priority: "P1",
    available: true,
  },
  {
    key: "heatmap",
    label: "事件热力图",
    emoji: "🗺️",
    description: "Agent × Tick 事件密度矩阵，定位活跃时段",
    priority: "P2",
    available: true,
  },
  {
    key: "search",
    label: "Agent 搜索",
    emoji: "🔍",
    description: "按姓名 / MBTI / 画像 / 目标模糊匹配",
    priority: "P2",
    available: true,
  },
  {
    key: "patterns",
    label: "决策模式识别",
    emoji: "🧠",
    description: "Agent 群体的决策风格分布",
    priority: "P2",
    available: true,
  },
  {
    key: "dynamics",
    label: "群体动力学",
    emoji: "🌐",
    description: "LLM 分析群体互动：领导、孤立、氛围、转折点",
    priority: "P2",
    available: true,
  },
];

/** 情绪 label 中文映射——与 AgentStatusPanel EMOTION_LABELS 对齐。 */
const EMOTION_LABELS: Record<string, string> = {
  happy: "😊 开心",
  sad: "😢 悲伤",
  angry: "😤 愤怒",
  anxious: "😰 焦虑",
  excited: "😆 兴奋",
  neutral: "😐 平静",
};

/** 从 Agent + 事件流聚合单个 Agent 的统计。 */
export function computeAgentStats(
  agent: AgentResponse,
  events: SSEEvent[],
): AgentStats {
  let actionCount = 0;
  let messageCount = 0;
  let thoughtCount = 0;
  let relationCount = 0;
  let lastActiveTick = 0;

  for (const event of events) {
    if (event.agent_id !== agent.id) continue;
    switch (event.type) {
      case "agent_action":
        actionCount += 1;
        break;
      case "agent_message":
        messageCount += 1;
        break;
      case "thought_stream":
        thoughtCount += 1;
        break;
      case "relationship_change":
        relationCount += 1;
        break;
      default:
        break;
    }
    if (event.tick > lastActiveTick) lastActiveTick = event.tick;
  }

  // 精力模拟衰减（与 AgentStatusPanel 一致：每 5 条事件 -2%，下限 10%）
  const energyDecay = Math.max(10, agent.energy - Math.floor(events.length / 5) * 2);

  return {
    agentId: agent.id,
    agentName: agent.name,
    mbti: agent.persona.mbti,
    energy: energyDecay,
    emotionLabel: EMOTION_LABELS[agent.emotional_state.label] ?? agent.emotional_state.label,
    actionCount,
    messageCount,
    thoughtCount,
    relationCount,
    lastActiveTick,
    values: agent.persona.values,
  };
}

/** 批量聚合所有 Agent 统计。 */
export function computeAllAgentStats(
  agents: AgentResponse[],
  events: SSEEvent[],
): AgentStats[] {
  return agents.map((agent) => computeAgentStats(agent, events));
}

/** 控制台顶部汇总统计。 */
export interface ControlSummary {
  agentCount: number;
  totalEvents: number;
  totalTicks: number;
  totalActions: number;
  totalMessages: number;
  totalThoughts: number;
}

export function computeSummary(
  agents: AgentResponse[],
  events: SSEEvent[],
): ControlSummary {
  let totalActions = 0;
  let totalMessages = 0;
  let totalThoughts = 0;
  let totalTicks = 0;

  for (const event of events) {
    switch (event.type) {
      case "agent_action":
        totalActions += 1;
        break;
      case "agent_message":
        totalMessages += 1;
        break;
      case "thought_stream":
        totalThoughts += 1;
        break;
      default:
        break;
    }
    if (event.tick > totalTicks) totalTicks = event.tick;
  }

  return {
    agentCount: agents.length,
    totalEvents: events.length,
    totalTicks,
    totalActions,
    totalMessages,
    totalThoughts,
  };
}

/** 构建热力图单元格矩阵——Agent (行) × Tick (列)。 */
export function buildHeatmap(
  agents: AgentResponse[],
  events: SSEEvent[],
): { cells: HeatmapCell[]; ticks: number[] } {
  if (agents.length === 0 || events.length === 0) {
    return { cells: [], ticks: [] };
  }

  // 收集所有出现过事件的 tick（排序去重）
  const tickSet = new Set<number>();
  for (const event of events) {
    tickSet.add(event.tick);
  }
  const ticks = [...tickSet].sort((a, b) => a - b);

  // 构建每个 Agent × Tick 的计数
  const cells: HeatmapCell[] = [];
  for (const agent of agents) {
    for (const tick of ticks) {
      const count = events.filter(
        (event) => event.agent_id === agent.id && event.tick === tick,
      ).length;
      cells.push({
        agentId: agent.id,
        agentName: agent.name,
        tick,
        count,
      });
    }
  }

  return { cells, ticks };
}

/** 根据事件数返回热力图单元格的背景色 class。 */
export function heatmapCellColor(count: number): string {
  if (count === 0) return "bg-bg-secondary/40";
  if (count === 1) return "bg-accent-blue/20";
  if (count === 2) return "bg-accent-blue/40";
  if (count === 3) return "bg-accent-blue/60";
  return "bg-accent-blue/80";
}

/** 聚合 Agent 群体的决策风格分布。 */
export function computeDecisionPatterns(
  agents: AgentResponse[],
): DecisionPattern {
  const pattern: DecisionPattern = {
    info_processing: {},
    risk_preference: {},
    social_tendency: {},
    stress_response: {},
  };

  for (const agent of agents) {
    const ds = agent.persona.decision_style;
    pattern.info_processing[ds.info_processing] =
      (pattern.info_processing[ds.info_processing] ?? 0) + 1;
    pattern.risk_preference[ds.risk_preference] =
      (pattern.risk_preference[ds.risk_preference] ?? 0) + 1;
    pattern.social_tendency[ds.social_tendency] =
      (pattern.social_tendency[ds.social_tendency] ?? 0) + 1;
    pattern.stress_response[ds.stress_response] =
      (pattern.stress_response[ds.stress_response] ?? 0) + 1;
  }

  return pattern;
}

/** 决策风格维度的中文标签映射。 */
export const DECISION_DIMENSION_LABELS: Record<
  keyof DecisionPattern,
  { label: string; emoji: string }
> = {
  info_processing: { label: "信息处理", emoji: "🧩" },
  risk_preference: { label: "风险偏好", emoji: "🎲" },
  social_tendency: { label: "社交倾向", emoji: "👥" },
  stress_response: { label: "压力应对", emoji: "🌊" },
};

/** 决策风格各选项的中文标签映射。 */
export const DECISION_OPTION_LABELS: Record<string, string> = {
  // info_processing
  intuitive: "直觉型",
  analytical: "分析型",
  balanced: "平衡型",
  // risk_preference
  averse: "规避型",
  moderate: "中立型",
  seeking: "寻求型",
  // social_tendency
  competitive: "竞争型",
  cooperative: "合作型",
  independent: "独立型",
  // stress_response
  avoidant: "回避型",
  reactive: "反应型",
  adaptive: "适应型",
  resilient: "韧性型",
};

/** Agent 搜索——模糊匹配 name / MBTI / narrative / goals / values。 */
export function searchAgents(
  agents: AgentResponse[],
  query: string,
): AgentResponse[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return agents;
  return agents.filter((agent) => {
    const haystack = [
      agent.name,
      agent.persona.mbti,
      agent.persona.narrative,
      ...agent.goals.map((g) => g.description),
      ...agent.persona.values,
      agent.background.hometown,
      agent.background.education,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

/** 高亮搜索匹配片段——返回片段列表（matched=true 的片段需高亮）。 */
export function highlightMatch(
  text: string,
  query: string,
): { text: string; matched: boolean }[] {
  const q = query.trim();
  if (q.length === 0) return [{ text, matched: false }];
  const lower = text.toLowerCase();
  const ql = q.toLowerCase();
  const result: { text: string; matched: boolean }[] = [];
  let cursor = 0;
  let idx = lower.indexOf(ql, cursor);
  while (idx !== -1) {
    if (idx > cursor) {
      result.push({ text: text.slice(cursor, idx), matched: false });
    }
    result.push({ text: text.slice(idx, idx + q.length), matched: true });
    cursor = idx + q.length;
    idx = lower.indexOf(ql, cursor);
  }
  if (cursor < text.length) {
    result.push({ text: text.slice(cursor), matched: false });
  }
  return result;
}
