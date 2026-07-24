/**
 * Agent API hooks — React Query 封装。
 * 所有模块统一用这些 hook 读写 Agent 数据，保证缓存一致。
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { agentKeys } from "./queryKeys";
import { isMockApi } from "./mockMode";
import {
  createMockAgent,
  deleteMockAgent,
  listMockAgents,
  remixMockAgent,
} from "../mocks/agentApi";
import type { AgentResponse } from "../types/agent";
import type { RemixRequest, RemixResponse } from "../types/remix";

export interface RemixMutationInput {
  agentId: string;
  request: RemixRequest;
}

// ===== Queries =====

/** 获取所有 Agent 列表（全模块共享缓存） */
export function useAgents() {
  return useQuery({
    queryKey: agentKeys.all,
    queryFn: () => isMockApi
      ? listMockAgents()
      : client.get<AgentResponse[]>("/agents"),
    staleTime: 30_000, // 30s 内不重复请求
  });
}

/** 获取单个 Agent 详情 */
export function useAgent(id: string | null) {
  return useQuery({
    queryKey: agentKeys.detail(id ?? ""),
    queryFn: async () => {
      if (isMockApi) {
        const agents = await listMockAgents();
        const agent = agents.find((item) => item.id === id);
        if (!agent) throw new Error(`Agent ${id} not found`);
        return agent;
      }
      return client.get<AgentResponse>(`/agents/${id}`);
    },
    enabled: !!id,
  });
}

// ===== Mutations =====

/** 创建 Agent（自然语言描述 → 完整人格） */
export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (description: string) => isMockApi
      ? createMockAgent(description)
      : client.post<AgentResponse>("/agents", { description }),
    onSuccess: () => {
      // invalidate(['agents']) → 所有模块的 useAgents() 自动刷新
      qc.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}

/** 删除 Agent */
export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => isMockApi
      ? deleteMockAgent(id)
      : client.delete(`/agents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}

/** 预览或确认创建 Agent Remix。 */
export function useRemixAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, request }: RemixMutationInput) => isMockApi
      ? remixMockAgent(agentId, request)
      : client.post<RemixResponse>(`/agents/${agentId}/remix`, request),
    onSuccess: (result) => {
      if (result.status === "created") {
        qc.invalidateQueries({ queryKey: agentKeys.all });
      }
    },
  });
}
