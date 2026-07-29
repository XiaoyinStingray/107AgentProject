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
    mutationFn: (config: { api_key: string; base_url: string; model: string; name?: string }) =>
      client.post<{ id: string; status: string }>("/bench/runs", config),
    onSuccess: () => qc.invalidateQueries({ queryKey: benchKeys.all }),
  });
}
