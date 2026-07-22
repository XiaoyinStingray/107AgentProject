/**
 * Arena API hooks — React Query 封装。
 * 对应后端 POST /api/arenas/debate, GET /api/arenas/{id}, GET /api/arenas。
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { arenaKeys } from "./queryKeys";
import type { ArenaPresentationResult, ArenaTranscriptEntry } from "../types/arena";

/** 后端 ArenaResultResponse 的原始 transcript 条目 */
interface RawTranscriptEntry {
  turn: number;
  speaker: string;
  content: string;
}

/** 后端 ArenaResultResponse 的完整形状 */
interface ArenaApiResponse {
  id: string;
  mode: string;
  winner_id: string;
  scores: Record<string, number>;
  judge_reasoning: string;
  transcript: RawTranscriptEntry[];
  topic: string;
  rounds: number;
  created_at: string;
}

/** 辩论请求体 */
export interface ArenaDebateRequest {
  mode: string;
  agent_a_id: string;
  agent_b_id: string;
  topic: string;
  rounds: number;
}

/**
 * 将后端原始 transcript 映射为前端展示格式。
 * 利用调用方已知的 Agent 信息填充 speaker_id / speaker_name。
 */
function adaptTranscript(
  raw: RawTranscriptEntry[],
  agentAMap: { id: string; name: string },
  agentBMap: { id: string; name: string },
): ArenaTranscriptEntry[] {
  return raw.map((entry, index) => {
    // AutoGen speaker name → agent id + display name
    const agent =
      entry.speaker === agentAMap.name || entry.speaker.includes(agentAMap.id.slice(0, 8))
        ? agentAMap
        : agentBMap;
    return {
      id: `t-${index}`,
      round: Math.floor(entry.turn / 2) + 1,
      speaker_id: agent.id,
      speaker_name: agent.name,
      content: entry.content,
    };
  });
}

/**
 * 将后端 API 响应适配为前端 ArenaPresentationResult。
 * score_breakdowns 在后端仅返回总分时用均分填充。
 */
export function adaptArenaResult(
  api: ArenaApiResponse,
  agentA: { id: string; name: string },
  agentB: { id: string; name: string },
): ArenaPresentationResult {
  const transcript = adaptTranscript(api.transcript, agentA, agentB);
  const quarter = (score: number) => Math.round(score / 4);
  return {
    winner_id: api.winner_id,
    scores: api.scores,
    judge_reasoning: api.judge_reasoning,
    transcript,
    score_breakdowns: {
      [agentA.id]: {
        argument_quality: quarter(api.scores[agentA.id] ?? 20),
        expression: quarter(api.scores[agentA.id] ?? 20),
        adaptability: quarter(api.scores[agentA.id] ?? 20),
        character_consistency: quarter(api.scores[agentA.id] ?? 20),
        total: api.scores[agentA.id] ?? 20,
      },
      [agentB.id]: {
        argument_quality: quarter(api.scores[agentB.id] ?? 20),
        expression: quarter(api.scores[agentB.id] ?? 20),
        adaptability: quarter(api.scores[agentB.id] ?? 20),
        character_consistency: quarter(api.scores[agentB.id] ?? 20),
        total: api.scores[agentB.id] ?? 20,
      },
    },
  };
}

// ===== Queries =====

/** 按 ID 获取竞技结果 */
export function useArenaResult(id: string | null) {
  return useQuery({
    queryKey: arenaKeys.detail(id ?? ""),
    queryFn: () => client.get<ArenaApiResponse>(`/arenas/${id}`),
    enabled: !!id,
  });
}

/** 列出所有竞技记录 */
export function useArenas() {
  return useQuery({
    queryKey: arenaKeys.all,
    queryFn: () => client.get<ArenaApiResponse[]>("/arenas"),
  });
}

// ===== Mutations =====

/** 运行一场 1v1 辩论 */
export function useRunDebate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ArenaDebateRequest) =>
      client.post<ArenaApiResponse>("/arenas/debate", req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: arenaKeys.all });
    },
  });
}
