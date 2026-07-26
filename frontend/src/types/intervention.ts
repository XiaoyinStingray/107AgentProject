/* ================================================================
   Step 24 — M7 干预台类型定义
   事件注入表单 + 干预历史会话日志。
   ================================================================ */

/** 可注入的事件类型——与 SSEEventType 对齐（去除 thought_stream / tick_boundary）。 */
export type InjectionEventType =
  | "world_event"
  | "agent_message"
  | "agent_action"
  | "relationship_change";

/** 注入记录——一次干预操作的持久化结构。 */
export interface InjectionRecord {
  id: string;
  type: InjectionEventType;
  /** 目标 Agent id；world_event 时为 null（代表"世界"）。 */
  targetAgentId: string | null;
  targetName: string;
  description: string;
  timestamp: string;
  status: "applied" | "pending" | "failed";
}

/** 注入类型元数据——驱动 UI 类型选择。 */
export interface InjectionTypeMeta {
  key: InjectionEventType;
  label: string;
  emoji: string;
  description: string;
  /** 是否需要选择目标 Agent（world_event 不需要）。 */
  needsTarget: boolean;
}

/** M7 干预台 Tab/Panels key——对齐 menuData.ts M7 模块 7 项。 */
export type InterventionPanel =
  | "inject"
  | "voice_of_god"
  | "rewind"
  | "branch"
  | "persona"
  | "history"
  | "script";

/** 后端干预历史响应（Step 44 — interventions 表持久化）。 */
export interface InterventionResponse {
  id: string;
  world_id: string;
  type: InjectionEventType;
  target_agent_id: string | null;
  target_agent_name: string | null;
  description: string;
  created_at: string;
}
