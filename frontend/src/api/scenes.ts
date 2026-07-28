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
        .get<SceneStateResponse>(`/api/scenes/${sceneId}/state`)
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
      client.post<SceneStateResponse>(`/api/scenes/${sceneId}/state`, agents),
    onSuccess: (_data, { sceneId }) => {
      queryClient.invalidateQueries({ queryKey: sceneKeys.state(sceneId) });
    },
  });
}
