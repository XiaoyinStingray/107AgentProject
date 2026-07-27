/**
 * Step 51 — Agent Team 类型定义。
 * Team 的任务类型是开放的：产品设计、市场调研、代码工作等。
 */

/** 单个 Agent 在 Team 中的角色分配 */
export interface TeamRole {
  agent_id: string;
  role: string;   // "产品经理" | "后端开发" | ...
  reason: string; // LLM 推荐理由
}

/** 角色推荐 API 返回项 */
export interface SuggestedRole {
  agent_id: string;
  role: string;
  reason: string;
}

/** 创建 Team 的请求体 */
export interface TeamCreate {
  name: string;
  description: string;
  agent_ids: string[];
  roles?: TeamRole[];
}

/** Team 摘要（列表用） */
export interface TeamSummary {
  id: string;
  name: string;
  description: string;
  agent_ids: string[];
  roles: TeamRole[];
  status: "idle" | "executing" | "paused" | "finished";
  created_at: string;
}

/** Team 详情（含 Agent 摘要） */
export interface AgentBrief {
  id: string;
  name: string;
  mbti: string;
}

export interface TeamDetail extends TeamSummary {
  agents: AgentBrief[];
}

/** Plan 步骤 */
export interface PlanStep {
  id: string;
  title: string;
  assignee: string | null;
  description: string;
  status: "pending" | "active" | "done";
  progress: number;
  depends_on: string[];
}

/** Team 执行 Plan */
export interface TeamPlan {
  id: string;
  team_id: string;
  task: string;
  steps: PlanStep[];
  status: "executing" | "paused" | "finished";
  world_id: string | null;
  created_at: string;
  progress_pct?: number;
  report?: { title: string; content: string } | null;
}
