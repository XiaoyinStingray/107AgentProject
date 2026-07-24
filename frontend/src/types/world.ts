// 与 backend/src/models/world.py 一一对应
//   Python 侧字段有 default 的 → TS 用 ? 标记为可选

export interface Scenario {
  id?: string | null;
  name?: string;
  description?: string;
  time_range?: string;
  initial_events?: string[];
  environment_params?: Record<string, unknown>;
}

export interface WorldCreate {
  name: string;
  world_type?: "solo" | "group";
  scenario?: Scenario;
  agent_ids?: string[];
}

export interface WorldResponse {
  id: string;
  name: string;
  world_type: "solo" | "group";
  scenario: Scenario;
  agent_ids: string[];
  current_tick: number;
  status: "idle" | "running" | "paused" | "finished";
  created_at: string;
}
