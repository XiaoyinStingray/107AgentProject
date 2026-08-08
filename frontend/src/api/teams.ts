/**
 * Team API hooks — React Query 封装。
 * Step 51–52: CRUD + 角色推荐 + Plan 执行。
 * State 8: 新增 execute/stream/history/files。
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { teamKeys } from "./queryKeys";
import type { TeamCreate, TeamSummary, TeamDetail, SuggestedRole, TeamPlan, TeamExecuteResponse, TeamFileResponse } from "../types/team";

export function useTeams() {
  return useQuery({
    queryKey: teamKeys.all,
    queryFn: () => client.get<TeamSummary[]>("/teams"),
    staleTime: 10_000,
  });
}

export function useTeam(id: string | null) {
  return useQuery({
    queryKey: teamKeys.detail(id ?? ""),
    queryFn: () => client.get<TeamDetail>(`/teams/${id}`),
    enabled: !!id,
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: TeamCreate) => client.post<TeamSummary>("/teams", req),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamKeys.all }); },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.delete(`/teams/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamKeys.all }); },
  });
}

export function useSuggestRoles() {
  return useMutation({
    mutationFn: (agentIds: string[]) =>
      client.post<SuggestedRole[]>("/teams/suggest-roles", { agent_ids: agentIds }),
  });
}

/** State 8: 执行 Team——后台启动 Worker 执行 */
export function useExecuteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (teamId: string) =>
      client.post<TeamExecuteResponse>(`/teams/${teamId}/execute`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: teamKeys.all }); },
  });
}

export function useEvaluateTeam() {
  return useMutation({
    mutationFn: (teamId: string) =>
      client.post<{ evaluation: string }>(`/teams/${teamId}/evaluate`),
  });
}

/** 获取 Team 的当前 Plan（轮询） */
export function useTeamPlan(teamId: string | null) {
  return useQuery({
    queryKey: [...teamKeys.detail(teamId ?? ""), "plan"],
    queryFn: () => client.get<TeamPlan>(`/teams/${teamId}/plan`),
    enabled: !!teamId,
    refetchInterval: 5_000,
  });
}

/** State 8: Team 历史执行记录 */
export function useTeamHistory(teamId: string | null) {
  return useQuery({
    queryKey: [...teamKeys.detail(teamId ?? ""), "history"],
    queryFn: () => client.get<TeamPlan[]>(`/teams/${teamId}/history`),
    enabled: !!teamId,
  });
}

/** State 8: 读取 Team 工作区文件 */
export function useTeamFile(teamId: string | null, filePath: string | null) {
  return useQuery({
    queryKey: [...teamKeys.detail(teamId ?? ""), "file", filePath ?? ""],
    queryFn: () => client.get<TeamFileResponse>(`/teams/${teamId}/files/${encodeURIComponent(filePath!)}`),
    enabled: !!teamId && !!filePath,
  });
}

// ── 68: Team 评分 ──

export interface ScoreResult {
  team_name: string;
  scores: Record<string, { score: number; comment: string }>;
  overall: number;
  strengths: string[];
  weaknesses: string[];
  summary: string;
}

export function useScoreTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, task }: { teamId: string; task: string }) =>
      client.post<ScoreResult>(`/teams/${teamId}/score`, { task }),
    onSuccess: () => qc.invalidateQueries({ queryKey: teamKeys.all }),
  });
}

// ── 68: Team 对抗 ──

export interface VersusResult {
  winner: "A" | "B" | "tie";
  scores_a: Record<string, { score: number; comment: string }>;
  scores_b: Record<string, { score: number; comment: string }>;
  overall_a: number; overall_b: number;
  strengths_a: string[]; strengths_b: string[];
  weaknesses_a: string[]; weaknesses_b: string[];
  summary_a: string; summary_b: string;
  key_diffs: Array<{ dim: string; a: number; b: number; winner: string; gap: number }>;
  team_a_name: string; team_b_name: string;
  task: string;
}

export function useTeamVersus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { team_a_id: string; team_b_id: string; task: string }) =>
      client.post<VersusResult>("/teams/versus", req),
  });
}

// ── 68: 学习曲线 ──

export interface LearningCurve {
  team_name: string;
  points: Array<{ index: number; task: string; completion_pct: number; has_report: boolean }>;
  trend: string; total_plans: number;
  latest_task: string; latest_report: any;
}

export function useLearningCurve(teamId: string | null) {
  return useQuery({
    queryKey: [...teamKeys.detail(teamId ?? ""), "learning-curve"],
    queryFn: () => client.get<LearningCurve>(`/teams/${teamId}/learning-curve`),
    enabled: !!teamId,
  });
}
