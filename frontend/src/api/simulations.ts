/**
 * Simulation API hooks — React Query 封装。
 * 对应后端 GET /api/simulations, GET /api/simulations/{id}。
 */

import { useQuery } from "@tanstack/react-query";
import { client } from "./client";
import { simulationKeys } from "./queryKeys";

export interface SimulationResponse {
  id: string;
  world_id: string;
  started_at: string;
  ended_at: string | null;
  total_ticks: number;
  status: string;
}

/** 列出所有模拟记录 */
export function useSimulations(worldId?: string | null) {
  return useQuery({
    queryKey: worldId
      ? [...simulationKeys.all, { world_id: worldId }]
      : simulationKeys.all,
    queryFn: () =>
      client.get<SimulationResponse[]>(
        worldId ? `/simulations?world_id=${worldId}` : "/simulations",
      ),
  });
}

/** 获取单条模拟详情 */
export function useSimulation(id: string | null) {
  return useQuery({
    queryKey: simulationKeys.detail(id ?? ""),
    queryFn: () => client.get<SimulationResponse>(`/simulations/${id}`),
    enabled: !!id,
  });
}
