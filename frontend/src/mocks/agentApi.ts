import { MOCK_AGENTS } from "./agents";
import type { AgentResponse } from "../types/agent";
import type {
  RemixChange,
  RemixDraft,
  RemixRequest,
  RemixResponse,
} from "../types/remix";

let nextId = 1;
let agents: AgentResponse[] = structuredClone(MOCK_AGENTS);

export async function listMockAgents(): Promise<AgentResponse[]> {
  return structuredClone(agents);
}

export async function createMockAgent(description: string): Promise<AgentResponse> {
  const base = structuredClone(MOCK_AGENTS[nextId % MOCK_AGENTS.length]!);
  const now = new Date().toISOString();
  const name = `Mock Agent ${agents.length + 1}`;
  const agent: AgentResponse = {
    ...base,
    id: `mock-created-${nextId++}`,
    name,
    persona: {
      ...base.persona,
      name,
      narrative: description,
    },
    emotional_state: {
      valence: 0.5,
      arousal: 0.5,
      dominance: 0.5,
      label: "neutral",
    },
    energy: 100,
    created_at: now,
    updated_at: now,
  };
  agents.push(agent);
  return structuredClone(agent);
}

export async function deleteMockAgent(id: string): Promise<void> {
  agents = agents.filter((agent) => agent.id !== id);
}

export async function remixMockAgent(
  agentId: string,
  request: RemixRequest,
): Promise<RemixResponse> {
  const source = agents.find((agent) => agent.id === agentId);
  if (!source) throw new Error(`Agent ${agentId} not found`);

  if (request.action === "preview") {
    const draft = enforceSpec(source, makeCandidate(source, request), request);
    const changes = collectMockChanges(source, draft);
    if (changes.length === 0) throw new Error("Remix 没有产生实际变化");
    return {
      status: "preview",
      source_agent_id: agentId,
      spec: request.spec,
      draft,
      changes,
      summary: "Mock 模式已按修改要求生成最小预览。",
      agent: null,
    };
  }

  if (!request.draft) throw new Error("create 请求缺少 draft");
  const draft = enforceSpec(source, structuredClone(request.draft), request);
  const changes = collectMockChanges(source, draft);
  if (changes.length === 0) throw new Error("Remix 没有产生实际变化");

  const now = new Date().toISOString();
  const created: AgentResponse = {
    id: `mock-remix-${nextId++}`,
    name: draft.persona.name,
    ...structuredClone(draft),
    emotional_state: {
      valence: 0.5,
      arousal: 0.5,
      dominance: 0.5,
      label: "neutral",
    },
    energy: 100,
    created_at: now,
    updated_at: now,
  };
  agents.push(created);
  return {
    status: "created",
    source_agent_id: agentId,
    spec: request.spec,
    draft,
    changes,
    summary: "已按预览内容创建 Mock Remix Agent。",
    agent: structuredClone(created),
  };
}

export function resetMockAgents(): void {
  agents = structuredClone(MOCK_AGENTS);
  nextId = 1;
}

function makeCandidate(
  source: AgentResponse,
  request: RemixRequest,
): RemixDraft {
  const draft: RemixDraft = {
    persona: structuredClone(source.persona),
    background: structuredClone(source.background),
    goals: structuredClone(source.goals),
  };
  Object.assign(draft.persona.big_five, request.spec.trait_targets);
  if (request.spec.instruction && !request.spec.preserve_fields.includes("narrative")) {
    draft.persona.narrative = `${draft.persona.narrative}\nRemix：${request.spec.instruction}`;
  } else if (
    request.spec.instruction
    && !request.spec.preserve_fields.includes("decision_style")
  ) {
    draft.persona.decision_style.risk_preference = "seeking";
  }
  return draft;
}

function enforceSpec(
  source: AgentResponse,
  candidate: RemixDraft,
  request: RemixRequest,
): RemixDraft {
  const draft = structuredClone(candidate);
  for (const field of request.spec.preserve_fields) {
    if (field === "background") draft.background = structuredClone(source.background);
    else if (field === "goals") draft.goals = structuredClone(source.goals);
    else {
      (draft.persona as unknown as Record<string, unknown>)[field] =
        structuredClone((source.persona as unknown as Record<string, unknown>)[field]);
    }
  }
  Object.assign(draft.persona.big_five, request.spec.trait_targets);
  return draft;
}

function collectMockChanges(
  source: AgentResponse,
  draft: RemixDraft,
): RemixChange[] {
  const changes: RemixChange[] = [];
  for (const [field, after] of Object.entries(draft.persona.big_five)) {
    const before = source.persona.big_five[field as keyof typeof source.persona.big_five];
    if (before !== after) {
      changes.push({
        field: `persona.big_five.${field}`,
        before: String(before),
        after: String(after),
      });
    }
  }
  if (source.persona.narrative !== draft.persona.narrative) {
    changes.push({
      field: "persona.narrative",
      before: source.persona.narrative,
      after: draft.persona.narrative,
    });
  }
  if (
    source.persona.decision_style.risk_preference
    !== draft.persona.decision_style.risk_preference
  ) {
    changes.push({
      field: "persona.decision_style.risk_preference",
      before: source.persona.decision_style.risk_preference,
      after: draft.persona.decision_style.risk_preference,
    });
  }
  return changes;
}
