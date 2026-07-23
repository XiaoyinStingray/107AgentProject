/**
 * Scenario API hooks — React Query 封装。
 * 对应后端 GET/POST/DELETE /api/scenarios。
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { scenarioKeys } from "./queryKeys";
import type { Scenario } from "../types/world";

export interface ScenarioCreate {
  name: string;
  description: string;
  time_range: string;
  initial_events: string[];
  environment_params: Record<string, string>;
}

/** 列出所有场景（内置 + 自定义） */
export function useScenarios() {
  return useQuery({
    queryKey: scenarioKeys.all,
    queryFn: () => client.get<Scenario[]>("/scenarios"),
    staleTime: 30_000,
  });
}

/** 创建自定义场景 */
export function useCreateScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ScenarioCreate) =>
      client.post<Scenario>("/scenarios", req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scenarioKeys.all });
    },
  });
}

/** 删除自定义场景 */
export function useDeleteScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.delete(`/scenarios/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scenarioKeys.all });
    },
  });
}
