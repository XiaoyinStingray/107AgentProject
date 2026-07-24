import { useQuery } from "@tanstack/react-query";

import { client } from "./client";
import { isMockApi } from "./mockMode";
import { agentTemplateKeys } from "./queryKeys";
import { MOCK_AGENT_TEMPLATES } from "../mocks/agentTemplates";
import type { AgentTemplate } from "../types/agentTemplate";


export function useAgentTemplates() {
  return useQuery({
    queryKey: agentTemplateKeys.all,
    queryFn: async () => isMockApi
      ? structuredClone(MOCK_AGENT_TEMPLATES)
      : client.get<AgentTemplate[]>("/templates"),
    staleTime: Infinity,
  });
}
