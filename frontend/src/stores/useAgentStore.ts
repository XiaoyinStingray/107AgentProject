import { create } from "zustand";
import type { AgentResponse } from "../types/agent";

interface AgentStore {
  /** 当前会话中已创建的 Agent 列表（页面刷新后清空） */
  agents: AgentResponse[];
  addAgent: (agent: AgentResponse) => void;
  removeAgent: (id: string) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  addAgent: (agent) => set((s) => ({ agents: [...s.agents, agent] })),
  removeAgent: (id) =>
    set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),
}));
