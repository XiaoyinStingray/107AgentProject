import type { AgentResponse } from "./agent";
import type { SSEEvent, SimEvent } from "./events";

/* ================================================================
   Step 24 — M6 控制台类型定义
   聚合 Agent + 事件流，支撑仪表盘 / 热力图 / 搜索 / 决策模式识别。
   ================================================================ */

/** M6 控制台 Tab key——与 menuData.ts M6 模块 7 项对齐。 */
export type ControlTab =
  | "dashboard"
  | "heatmap"
  | "search"
  | "patterns"
  | "anomaly"
  | "tracking"
  | "strategy";

/** 单个 Agent 在事件流中的聚合统计。 */
export interface AgentStats {
  agentId: string;
  agentName: string;
  mbti: string;
  energy: number;
  emotionLabel: string;
  actionCount: number;
  messageCount: number;
  thoughtCount: number;
  relationCount: number;
  lastActiveTick: number;
  values: string[];
}

/** 热力图单元格——Agent × Tick 的事件计数。 */
export interface HeatmapCell {
  agentId: string;
  agentName: string;
  tick: number;
  count: number;
}

/** 决策风格维度分布——key=维度，value={选项: Agent 数}。 */
export interface DecisionPattern {
  info_processing: Record<string, number>;
  risk_preference: Record<string, number>;
  social_tendency: Record<string, number>;
  stress_response: Record<string, number>;
}

/** AgentDashboard 组件 Props。 */
export interface AgentDashboardProps {
  agents: AgentResponse[];
  events: SSEEvent[];
  className?: string;
}

/** EventHeatmap 组件 Props。 */
export interface EventHeatmapProps {
  agents: AgentResponse[];
  events: SSEEvent[];
  className?: string;
}

/** AgentSearch 组件 Props。 */
export interface AgentSearchProps {
  agents: AgentResponse[];
  className?: string;
}

/** DecisionPatterns 组件 Props。 */
export interface DecisionPatternsProps {
  agents: AgentResponse[];
  className?: string;
}

/**
 * 将后端 SimEvent[] 转为子组件消费的 SSEEvent[]。
 * 字段映射：source_agent_id → agent_id，其余字段直接透传。
 */
export function convertSimEventsToSSE(events: SimEvent[]): SSEEvent[] {
  return events.map((e) => ({
    id: e.id,
    type: e.type,
    agent_id: e.source_agent_id,
    description: e.description,
    content: e.description,
    tick: e.tick,
    data: e.data,
  }));
}
