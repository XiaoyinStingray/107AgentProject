/**
 * Team API hooks — React Query 封装。
 * Step 51–52: CRUD + 角色推荐 + Plan 执行。
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { teamKeys } from "./queryKeys";
import type { TeamCreate, TeamSummary, TeamDetail, SuggestedRole, TeamPlan } from "../types/team";

/** 列出全部 Team */
export function useTeams() {
  return useQuery({
    queryKey: teamKeys.all,
    queryFn: () => client.get<TeamSummary[]>("/teams"),
    staleTime: 10_000,
  });
}

/** 获取单个 Team 详情 */
export function useTeam(id: string | null) {
  return useQuery({
    queryKey: teamKeys.detail(id ?? ""),
    queryFn: () => client.get<TeamDetail>(`/teams/${id}`),
    enabled: !!id,
  });
}

/** 创建 Team */
export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: TeamCreate) =>
      client.post<TeamSummary>("/teams", req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

/** 删除 Team */
export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.delete(`/teams/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

/** 角色推荐 */
export function useSuggestRoles() {
  return useMutation({
    mutationFn: (agentIds: string[]) =>
      client.post<SuggestedRole[]>("/teams/suggest-roles", {
        agent_ids: agentIds,
      }),
  });
}

/** 执行 Team——分解任务 + 创建 Plan */
export function useExecuteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) =>
      client.post<TeamPlan>(`/teams/${teamId}/execute`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all });
    },
  });
}

/** 获取 Team 的当前 Plan */
export function useTeamPlan(teamId: string | null) {
  return useQuery({
    queryKey: [...teamKeys.detail(teamId ?? ""), "plan"],
    queryFn: () => client.get<TeamPlan>(`/teams/${teamId}/plan`),
    enabled: !!teamId,
    refetchInterval: 5_000,  // 执行中每 5s 轮询
  });
}
