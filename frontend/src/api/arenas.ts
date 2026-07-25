/**
 * Arena API hooks — 页面不感知真实后端或独立 Mock 数据源。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { isMockApi } from "./mockMode";
import { arenaKeys } from "./queryKeys";
import {
  getMockArena,
  getMockArenaReport,
  listMockArenas,
  runMockBattleRoyale,
  runMockDuel,
} from "../mocks/arenaApi";
import type {
  ArenaApiResult,
  ArenaConfig,
  ArenaPresentationResult,
  ArenaReportResponse,
  ArenaScoreBreakdown,
  BattleRoyaleConfig,
  DuelArenaMode,
} from "../types/arena";


/** 将后端竞技结果转换为现有展示组件使用的结构。 */
export function adaptArenaResult(
  api: ArenaApiResult,
): ArenaPresentationResult {
  return {
    id: api.id,
    mode: api.mode,
    winner_id: api.winner_id,
    scores: api.scores,
    judge_reasoning: api.judge_reasoning,
    transcript: api.transcript.map((entry, index) => ({
      id: `${api.id}-${entry.turn}-${index}`,
      round: entry.round,
      speaker_id: entry.speaker_id,
      speaker_name: entry.speaker,
      content: entry.content,
      stage_score: entry.stage_score,
      stage_rank: entry.stage_rank,
      advanced: entry.advanced,
    })),
    topic: api.topic,
    rounds: api.rounds,
    participant_ids: api.participant_ids,
    participant_names: api.participant_names,
    score_breakdowns: Object.fromEntries(
      api.participant_ids.map((agentId) => [
        agentId,
        normalizeBreakdown(api, agentId),
      ]),
    ),
    created_at: api.created_at,
  };
}

/** 按 ID 获取竞技结果。 */
export function useArenaResult(id: string | null) {
  return useQuery({
    queryKey: arenaKeys.detail(id ?? ""),
    queryFn: () => isMockApi
      ? getMockArena(id!)
      : client.get<ArenaApiResult>(`/arenas/${id}`),
    enabled: !!id,
  });
}

/** 列出竞技历史，可按参赛 Agent 过滤。 */
export function useArenas(agentId?: string) {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
  return useQuery({
    queryKey: arenaKeys.list(agentId),
    queryFn: () => isMockApi
      ? listMockArenas(agentId)
      : client.get<ArenaApiResult[]>(`/arenas${query}`),
  });
}

/** 获取一场竞技的结构化 Markdown 战报。 */
export function useArenaReport(id: string | null) {
  return useQuery({
    queryKey: arenaKeys.report(id ?? ""),
    queryFn: () => isMockApi
      ? getMockArenaReport(id!)
      : client.get<ArenaReportResponse>(`/arenas/${id}/report`),
    enabled: !!id,
  });
}

/** 运行指定模式的 1v1 竞技。 */
export function useRunDuel(mode: DuelArenaMode) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: ArenaConfig) => {
      const payload = { ...request, mode };
      return isMockApi
        ? runMockDuel(payload)
        : client.post<ArenaApiResult>(`/arenas/${mode}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arenaKeys.all });
    },
  });
}

/** 兼容既有调用的辩论 mutation。 */
export function useRunDebate() {
  return useRunDuel("debate");
}

/** 运行真实或 Mock 面试竞争。 */
export function useRunInterview() {
  return useRunDuel("interview");
}

/** 运行真实或 Mock 创业路演。 */
export function useRunPitch() {
  return useRunDuel("pitch");
}

/** 运行真实或 Mock 多人自由淘汰赛。 */
export function useRunBattleRoyale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: BattleRoyaleConfig) => isMockApi
      ? runMockBattleRoyale(request)
      : client.post<ArenaApiResult>("/arenas/battle_royale", request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: arenaKeys.all });
    },
  });
}

function normalizeBreakdown(
  api: ArenaApiResult,
  agentId: string,
): ArenaScoreBreakdown {
  const total = api.scores[agentId] ?? 20;
  const quarter = Math.round(total / 4);
  const raw = api.score_breakdown[agentId] ?? {};
  return {
    argument_quality: raw.argument_quality ?? quarter,
    expression: raw.expression ?? quarter,
    adaptability: raw.adaptability ?? quarter,
    character_consistency: raw.character_consistency ?? quarter,
    total,
  };
}
