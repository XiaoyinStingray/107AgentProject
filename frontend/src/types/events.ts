// 与 backend/src/models/event.py 一一对应
// SSE 事件类型——前端消费的核心数据流

export type SSEEventType =
  | "thought_stream"
  | "agent_message"
  | "agent_action"
  | "world_event"
  | "relationship_change"
  | "tick_boundary";

export interface SimEvent {
  id: string;
  world_id: string;
  tick: number;
  type: SSEEventType;
  source_agent_id?: string;
  target_agent_ids: string[];
  description: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface ThoughtEvent extends SimEvent {
  type: "thought_stream";
  phase: string;
  content: string;
  tokens_used: number;
}

export interface AgentMessageEvent extends SimEvent {
  type: "agent_message";
  message: string;
  subtext: string;
  tone: string;
}

export interface AgentActionEvent extends SimEvent {
  type: "agent_action";
  action: string;
  target: string;
  result: string;
}
