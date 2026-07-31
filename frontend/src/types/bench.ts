/** Step 58 — LLM Bench 类型 */

export interface BenchRunSummary {
  id: string;
  name: string;
  llm_model: string;
  status: "running" | "done" | "failed" | "cancelled";
  total_tasks: number;
  completed_tasks: number;
  scores: Record<string, number> | null;
  report: string | null;
  created_at: string;
}

export interface BenchResultItem {
  id: string;
  run_id: string;
  agent_template: string;
  scenario: string;
  repeat_index: number;
  scores: Record<string, number> | null;
  status: string;
  error?: string;
  created_at: string;
}

export interface BenchRunDetail extends BenchRunSummary {
  results: BenchResultItem[];
}
