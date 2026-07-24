import type {
  AgentResponse,
  Background,
  BigFive,
  Goal,
  Persona,
} from "./agent";

export type RemixAction = "preview" | "create";
export type RemixStatus = "preview" | "created";
export type RemixField =
  | "name"
  | "mbti"
  | "big_five"
  | "values"
  | "decision_style"
  | "narrative"
  | "background"
  | "goals";

export type BigFivePatch = Partial<BigFive>;

export interface RemixSpec {
  instruction: string;
  trait_targets: BigFivePatch;
  preserve_fields: RemixField[];
}

export interface RemixDraft {
  persona: Persona;
  background: Background;
  goals: Goal[];
}

export interface RemixChange {
  field: string;
  before: string;
  after: string;
}

export interface RemixRequest {
  action: RemixAction;
  spec: RemixSpec;
  draft?: RemixDraft | null;
}

export interface RemixResponse {
  status: RemixStatus;
  source_agent_id: string;
  spec: RemixSpec;
  draft: RemixDraft;
  changes: RemixChange[];
  summary: string;
  agent: AgentResponse | null;
}
