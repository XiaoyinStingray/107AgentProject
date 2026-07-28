/**
 * Scene State API hooks — React Query 封装。
 * 对应后端 GET/POST /api/scenes/{sceneId}/state
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { sceneKeys } from "./queryKeys";
import type { AgentSpriteData } from "../game/sprites/AgentSprite";

interface SceneStateResponse {
  sceneId: string;
  agents: AgentSpriteData[];
}

/** 获取某场景的后端 Agent 状态 */
export function useSceneState(sceneId: string) {
  return useQuery({
    queryKey: sceneKeys.state(sceneId),
    queryFn: () =>
      client
        .get<SceneStateResponse>(`/scenes/${sceneId}/state`)
        .then((r) => r.agents),
    enabled: sceneId.length > 0,
    staleTime: 30_000,
  });
}

/** 全量同步 Agent 状态到后端 */
export function useSyncSceneState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sceneId,
      agents,
    }: {
      sceneId: string;
      agents: AgentSpriteData[];
    }) =>
      client.post<SceneStateResponse>(`/scenes/${sceneId}/state`, agents),
    onSuccess: (_data, { sceneId }) => {
      queryClient.invalidateQueries({ queryKey: sceneKeys.state(sceneId) });
    },
  });
}

/* ── 存档（Step 65）── */

interface CheckpointItem {
  id: string;
  name: string;
  agents: AgentSpriteData[];
  created_at: string;
}

export function useCheckpoints(sceneId: string) {
  return useQuery({
    queryKey: sceneKeys.checkpoints(sceneId),
    queryFn: () =>
      client.get<CheckpointItem[]>(`/scenes/${sceneId}/checkpoints`),
    enabled: sceneId.length > 0,
  });
}

export function useCreateCheckpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sceneId,
      name,
      agents,
    }: {
      sceneId: string;
      name: string;
      agents: AgentSpriteData[];
    }) =>
      client.post<CheckpointItem>(`/scenes/${sceneId}/checkpoints`, { name, agents }),
    onSuccess: (_data, { sceneId }) => {
      queryClient.invalidateQueries({ queryKey: sceneKeys.checkpoints(sceneId) });
    },
  });
}

export function useDeleteCheckpoint() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sceneId, id }: { sceneId: string; id: string }) =>
      client.delete(`/scenes/${sceneId}/checkpoints/${id}`),
    onSuccess: (_data, { sceneId }) => {
      queryClient.invalidateQueries({ queryKey: sceneKeys.checkpoints(sceneId) });
    },
  });
}
