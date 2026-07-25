/**
 * World API hooks — React Query 封装。
 * 单人剧场 / 群体沙盒共用。
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { worldKeys } from "./queryKeys";
import type { WorldCreate, WorldResponse } from "../types/world";
import type { SimEvent } from "../types/events";
import type { RelationshipSnapshot } from "../types/relationships";

// ===== Queries =====

/** 列出所有 World */
export function useWorlds() {
  return useQuery({
    queryKey: worldKeys.all,
    queryFn: () => client.get<WorldResponse[]>("/worlds"),
    staleTime: 10_000,
  });
}

/** 获取单个 World 详情 */
export function useWorld(id: string | null) {
  return useQuery({
    queryKey: worldKeys.detail(id ?? ""),
    queryFn: () => client.get<WorldResponse>(`/worlds/${id}`),
    enabled: !!id,
  });
}

/** 查询 World 历史事件（用于 SSE 断线补偿） */
export function useWorldEvents(worldId: string | null, tickFrom = 0) {
  return useQuery({
    queryKey: worldKeys.events(worldId ?? ""),
    queryFn: () =>
      client.get<SimEvent[]>(`/worlds/${worldId}/events?tick_from=${tickFrom}`),
    enabled: !!worldId,
    staleTime: 5_000,
  });
}

/** 获取活跃 World 的当前关系网络快照。 */
export function useWorldRelationships(worldId: string | null) {
  return useQuery({
    queryKey: worldKeys.relationships(worldId ?? ""),
    queryFn: () =>
      client.get<RelationshipSnapshot>(`/worlds/${worldId}/relationships`),
    enabled: !!worldId,
    staleTime: 5_000,
  });
}

// ===== Mutations =====

/** 创建 World */
export function useCreateWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: WorldCreate) =>
      client.post<WorldResponse>("/worlds", req),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: worldKeys.all });
      qc.setQueryData(worldKeys.detail(data.id), data);
    },
  });
}

/** 启动 World 模拟 */
export function useStartWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (worldId: string) =>
      client.post<{ status: string; world_id: string }>(`/worlds/${worldId}/start`),
    onSuccess: (_, worldId) => {
      qc.invalidateQueries({ queryKey: worldKeys.detail(worldId) });
      qc.invalidateQueries({ queryKey: worldKeys.all });
    },
  });
}

/** 暂停 World 模拟 */
export function usePauseWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (worldId: string) =>
      client.post<{ status: string }>(`/worlds/${worldId}/pause`),
    onSuccess: (_, worldId) => {
      qc.invalidateQueries({ queryKey: worldKeys.detail(worldId) });
      qc.invalidateQueries({ queryKey: worldKeys.all });
    },
  });
}

/** 重置 World 模拟——停止引擎、标记 idle */
export function useResetWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (worldId: string) =>
      client.post<{ status: string; world_id: string }>(`/worlds/${worldId}/reset`),
    onSuccess: (_, worldId) => {
      qc.invalidateQueries({ queryKey: worldKeys.detail(worldId) });
      qc.invalidateQueries({ queryKey: worldKeys.all });
      qc.removeQueries({ queryKey: worldKeys.relationships(worldId) });
    },
  });
}

/** 删除 World——清理引擎、结束 simulation、从存储移除 */
export function useDeleteWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (worldId: string) => client.delete(`/worlds/${worldId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: worldKeys.all });
    },
  });
}

/** 向运行中的 World 注入干预事件 */
export function useInjectEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      worldId,
      description,
    }: {
      worldId: string;
      description: string;
    }) =>
      client.post<{ status: string }>(`/worlds/${worldId}/inject`, {
        description,
      }),
    onSuccess: (_, { worldId }) => {
      qc.invalidateQueries({ queryKey: worldKeys.events(worldId) });
    },
  });
}

/** 结束 World 模拟——标记 finished，保留 tick/事件数据供回放 */
export function useFinishWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (worldId: string) =>
      client.post<{ status: string; world_id: string }>(`/worlds/${worldId}/finish`),
    onSuccess: (_, worldId) => {
      qc.invalidateQueries({ queryKey: worldKeys.detail(worldId) });
      qc.invalidateQueries({ queryKey: worldKeys.all });
    },
  });
}
