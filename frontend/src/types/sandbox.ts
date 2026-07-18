import type { SSEEvent } from "./events";

/** 群体沙盒页面当前所处的阶段。 */
export type SandboxPhase = "setup" | "running";

/** Mock 模拟支持的播放速度。 */
export type SandboxSpeed = 1 | 2;

/** 群体沙盒页面自身维护的交互状态。 */
export interface SandboxState {
  phase: SandboxPhase;
  selectedAgentIds: string[];
  selectedScenario: string;
  selectedTick: number | null;
  speed: SandboxSpeed;
}

/** 时间线上的单个 Tick 聚合信息。 */
export interface TimelineTick {
  tick: number;
  eventCount: number;
  hasRelationshipChange: boolean;
}

/** Timeline 组件接口。 */
export interface TimelineProps {
  events: SSEEvent[];
  selectedTick: number | null;
  onSelectTick: (tick: number | null) => void;
  className?: string;
}

/** EventFeed 组件接口。 */
export interface EventFeedProps {
  events: SSEEvent[];
  selectedTick?: number | null;
  className?: string;
}
