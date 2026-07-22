import { create } from "zustand";
import type { SSEEvent } from "../types/events";
import type {
  RelationshipChangeData,
  RelationshipSnapshot,
  RelationshipState,
} from "../types/relationships";

interface SSEStore {
  events: SSEEvent[];
  connected: boolean;
  relationships: Record<string, RelationshipState>;
  lastRelationshipKey: string | null;
  appendEvent: (e: SSEEvent) => void;
  hydrateRelationships: (snapshot: RelationshipSnapshot) => void;
  clear: () => void;
  setConnected: (c: boolean) => void;
}

/** Build a stable key for one directed relationship. */
export function relationshipKey(source: string, target: string): string {
  return `${source}::${target}`;
}

function parseRelationshipEvent(event: SSEEvent): RelationshipState | null {
  if (event.type !== "relationship_change" || !event.data) return null;
  const data = event.data as Partial<RelationshipChangeData>;
  if (
    typeof data.from !== "string" ||
    typeof data.to !== "string" ||
    typeof data.new_score !== "number"
  ) {
    return null;
  }
  const oldScore = typeof data.old_score === "number" ? data.old_score : 0;
  return {
    source: data.from,
    target: data.to,
    score: data.new_score,
    interaction: data.interaction ?? "neutral",
    lastChange: data.new_score - oldScore,
  };
}

export const useSSEStore = create<SSEStore>((set) => ({
  events: [],
  connected: false,
  relationships: {},
  lastRelationshipKey: null,
  appendEvent: (event) =>
    set((state) => {
      const relationship = parseRelationshipEvent(event);
      const key = relationship
        ? relationshipKey(relationship.source, relationship.target)
        : null;
      return {
        // 最多保留 500 条，防止 DOM 积压
        events: [...state.events.slice(-499), event],
        relationships: relationship && key
          ? { ...state.relationships, [key]: relationship }
          : state.relationships,
        lastRelationshipKey: key ?? state.lastRelationshipKey,
      };
    }),
  hydrateRelationships: (snapshot) =>
    set((state) => {
      const seeded = Object.fromEntries(
        snapshot.edges.map((edge) => [
          relationshipKey(edge.source, edge.target),
          { ...edge, interaction: "neutral", lastChange: 0 },
        ]),
      );
      // 已到达的 SSE 比稍后返回的 REST 快照更新，必须保留。
      return { relationships: { ...seeded, ...state.relationships } };
    }),
  clear: () =>
    set({ events: [], relationships: {}, lastRelationshipKey: null }),
  setConnected: (c) => set({ connected: c }),
}));
