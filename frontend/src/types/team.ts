/**
 * M9 Agent Team 类型定义（State 8 更新）。
 */

export interface TeamRole {
  agent_id: string;
  role: string;
  reason: string;
}

export interface SuggestedRole {
  agent_id: string;
  role: string;
  reason: string;
}

export interface TeamCreate {
  name: string;
  description: string;
  agent_ids: string[];
  roles?: TeamRole[];
}

export type TeamOutcome = "pending" | "in_progress" | "success" | "partial" | "failed";

export interface TeamSummary {
  id: string;
  name: string;
  description: string;
  agent_ids: string[];
  roles: TeamRole[];
  status: "idle" | "executing" | "paused" | "finished";
  created_at: string;
  outcome?: TeamOutcome;
  total_steps?: number;
  completed_steps?: number;
  failed_steps?: number;
}

export interface AgentBrief {
  id: string;
  name: string;
  mbti: string;
}

export interface TeamDetail extends TeamSummary {
  agents: AgentBrief[];
}

export interface PlanStep {
  id: string;
  title: string;
  assignee: string | null;
  description: string;
  status: "pending" | "active" | "done" | "error";
  progress: number;
  depends_on: string[];
  result?: {
    files?: string[];
    output_summary?: string;
    steps_used?: number;
    duration_secs?: number;
    error?: string | null;
  };
}

export interface TeamPlan {
  id: string;
  team_id: string;
  task: string;
  steps: PlanStep[];
  status: "executing" | "paused" | "finished";
  world_id: string | null;
  created_at: string;
  progress_pct?: number;
  outcome?: TeamOutcome;
  total_steps?: number;
  completed_steps?: number;
  failed_steps?: number;
  report?: { title: string; content: string; outcome?: TeamOutcome } | null;
}

// ── State 8: Team SSE 事件类型 ──

export interface TeamPlanCreated {
  plan_id: string;
  task: string;
  total_steps: number;
  steps: Array<{
    id: string;
    title: string;
    assignee_id: string | null;
    assignee_name: string;
    description: string;
  }>;
}

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface StepState {
  id: string;
  title: string;
  assigneeId: string | null;
  assigneeName: string;
  status: StepStatus;
  stepIndex: number;
  totalSteps: number;
  files: string[];
  outputSummary: string;
  stepsUsed: number;
  durationSecs: number | null;
  error: string | null;
  events: TeamSSEEvent[];  // buffered step.* events
}

export interface TeamSSEEvent {
  type: string;
  step_id?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface RoleEvolution {
  agent_id: string;
  agent_name?: string;
  name?: string;
  old_role: string;
  new_role: string;
  reason: string;
  step_title?: string;
}

export interface StepWorkerDone {
  success: boolean;
  files: string[];
  output_summary: string;
  steps_used: number;
  duration_secs: number;
}

export interface TeamDoneData {
  outcome?: TeamOutcome;
  total_duration_secs: number;
  total_steps_completed: number;
  failed_steps?: number;
  total_steps: number;
  steps: Array<{
    step_title: string;
    success: boolean;
    files: string[];
    duration_secs: number;
  }>;
  report: { title: string; content: string };
  workspace_root: string;
}

export interface TeamExecuteResponse {
  team_id: string;
  plan_id: string;
  status: string;
}

export interface TeamFileResponse {
  path: string;
  content: string;
  size: number;
}
