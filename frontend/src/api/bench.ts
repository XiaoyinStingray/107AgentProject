/**
 * Bench API hooks — LLM 评测。
 * Step 58: 创建评测 + 查询结果。
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import type { BenchRunSummary, BenchRunDetail } from "../types/bench";

export const benchKeys = {
  all: ["bench"] as const,
  detail: (id: string) => ["bench", id] as const,
};

export function useBenchRuns() {
  return useQuery({
    queryKey: benchKeys.all,
    queryFn: () => client.get<BenchRunSummary[]>("/bench/runs"),
    // 空闲时停止轮询，避免用户停留在 Bench 页时永久请求后端。
    refetchInterval: (query) =>
      query.state.data?.some((run) => run.status === "running")
        ? 3_000
        : false,
  });
}

export function useBenchRun(id: string | null) {
  return useQuery({
    queryKey: benchKeys.detail(id ?? ""),
    queryFn: () => client.get<BenchRunDetail>(`/bench/runs/${id}`),
    enabled: !!id,
    refetchInterval: (query) => query.state.data?.status === "running" ? 3_000 : false,
  });
}

export function useDeleteBenchRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => client.delete(`/bench/runs/${runId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: benchKeys.all }),
  });
}

export function useCreateBenchRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: { api_key: string; base_url: string; model: string; name?: string;
      agents?: any[]; scenarios?: any[]; repeats?: number; template_id?: string }) =>
      client.post<{ id: string; status: string; total_tasks: number }>("/bench/runs", config),
    onSuccess: () => qc.invalidateQueries({ queryKey: benchKeys.all }),
  });
}

// 69: 模板
export interface BenchTemplate { id: string; name: string; agents: any[]; scenarios: any[]; repeats: number; created_at: string; }

export function useBenchTemplates() {
  return useQuery({
    queryKey: [...benchKeys.all, "templates"],
    queryFn: () => client.get<BenchTemplate[]>("/bench/templates"),
  });
}

export function useCreateBenchTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tpl: { name: string; agents: any[]; scenarios: any[]; repeats: number }) =>
      client.post<BenchTemplate>("/bench/templates", tpl),
    onSuccess: () => qc.invalidateQueries({ queryKey: benchKeys.all }),
  });
}

export function useDeleteBenchTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.delete(`/bench/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: benchKeys.all }),
  });
}

// 69: 取消
export function useCancelBenchRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => client.post(`/bench/runs/${runId}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: benchKeys.all }),
  });
}

// 69: 分场景雷达
export interface ByScenario { run_id: string; model: string; scenarios: Record<string, Record<string, number>>; }
export function useBenchByScenario(runId: string | null) {
  return useQuery({
    queryKey: [...benchKeys.detail(runId ?? ""), "by-scenario"],
    queryFn: () => client.get<ByScenario>(`/bench/runs/${runId}/by-scenario`),
    enabled: !!runId,
  });
}

// 70: 评分诊断
export interface Fingerprint {
  agents: Record<string, { diagnostics: Record<string,{score:number;reasons:string[];level:string}>; scores: Record<string,number>; event_counts: Record<string,number> }>;
  total_agents: number;
}
export function useBenchFingerprint(runId: string | null, runStatus?: string) {
  return useQuery({
    queryKey: [...benchKeys.detail(runId ?? ""), "fingerprint"],
    queryFn: () => client.get<Fingerprint>(`/bench/runs/${runId}/fingerprint`),
    enabled: !!runId && runStatus === "done",
    refetchInterval: runStatus === "done" ? false : 5_000,
  });
}

// 70: 劣化检测
export interface Degradation { [model: string]: { trend: string; declining: boolean; points: Array<{run_id:string;created_at:string;overall:number}> } }
export function useDegradation() {
  return useQuery({
    queryKey: [...benchKeys.all, "degradation"],
    queryFn: () => client.get<Degradation>("/bench/degradation"),
  });
}
