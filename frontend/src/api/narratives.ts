/**
 * Narrative API hooks — React Query 封装。
 * 对应后端 POST /api/narratives/{story,diary,letter}。
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { narrativeKeys } from "./queryKeys";

/** 后端 NarrativeGenResponse 对应的前端类型 */
export interface NarrativeResponse {
  title: string;
  content: string;
  style: string;
  agent_id: string;
  generated_at: string;
}

/** 后端 NarrativeGenRequest 对应的请求体 */
export interface NarrativeGenRequest {
  agent_id: string;
  world_id: string;
  target?: string | null;
}

/** 生成短篇小说 */
export function useGenerateStory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: NarrativeGenRequest) =>
      client.post<NarrativeResponse>("/narratives/story", req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: narrativeKeys.all });
    },
  });
}

/** 生成 Agent 日记 */
export function useGenerateDiary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: NarrativeGenRequest) =>
      client.post<NarrativeResponse>("/narratives/diary", req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: narrativeKeys.all });
    },
  });
}

/** 生成未来的信 */
export function useGenerateLetter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: NarrativeGenRequest) =>
      client.post<NarrativeResponse>("/narratives/letter", req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: narrativeKeys.all });
    },
  });
}

/** 生成播客脚本 */
export function useGeneratePodcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: NarrativeGenRequest) =>
      client.post<NarrativeResponse>("/narratives/podcast", req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: narrativeKeys.all });
    },
  });
}

/** 生成平行对话 */
export function useGenerateParallel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: NarrativeGenRequest) =>
      client.post<NarrativeResponse>("/narratives/parallel", req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: narrativeKeys.all });
    },
  });
}
