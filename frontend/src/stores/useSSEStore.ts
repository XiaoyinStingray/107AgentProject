import { create } from "zustand";
import type { SSEEvent } from "../types/events";
import type {
  RelationshipChangeData,
  RelationshipSnapshot,
  RelationshipState,
} from "../types/relationships";

interface SSEStore {
  events: SSEEvent[];
  totalEventCount: number;
  connected: boolean;
  relationships: Record<string, RelationshipState>;
  lastRelationshipKey: string | null;
  /** O(1) 事件 id 去重集合 */
  _eventIds: Set<string>;
  appendEvent: (e: SSEEvent) => void;
  /** 去重追加事件（O(1) id 检查），返回 true 表示已存在被跳过 */
  appendUnique: (e: SSEEvent) => boolean;
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

export const useSSEStore = create<SSEStore>((set, get) => ({
  events: [],
  totalEventCount: 0,
  connected: false,
  relationships: {},
  lastRelationshipKey: null,
  _eventIds: new Set<string>(),
  appendEvent: (event) =>
    set((state) => {
      const relationship = parseRelationshipEvent(event);
      const key = relationship
        ? relationshipKey(relationship.source, relationship.target)
        : null;
      // 原地维护 id 集合（_eventIds 仅内部去重用，不参与 React 渲染，无需不可变复制）
      if (event.id) state._eventIds.add(event.id);
      const nextEvents = [...state.events.slice(-499), event];
      // 裁剪时移除被挤出窗口的旧 id
      if (state.events.length >= 500) {
        const trimmed = state.events[0];
        if (trimmed?.id) state._eventIds.delete(trimmed.id);
      }
      return {
        events: nextEvents,
        totalEventCount: state.totalEventCount + 1,
        relationships: relationship && key
          ? { ...state.relationships, [key]: relationship }
          : state.relationships,
        lastRelationshipKey: key ?? state.lastRelationshipKey,
      };
    }),
  appendUnique: (event) => {
    const { _eventIds, appendEvent } = get();
    // O(1) id 去重
    if (event.id && _eventIds.has(event.id)) return true;
    // 无 id 的基础设施事件——防重复堆积
    if (!event.id) {
      const existing = get().events;
      const last = existing[existing.length - 1];
      if (last && last.type === event.type && last.tick === event.tick) return true;
    }
    appendEvent(event);
    return false;
  },
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
    set({ events: [], totalEventCount: 0, relationships: {}, lastRelationshipKey: null, _eventIds: new Set() }),
  setConnected: (c) => set({ connected: c }),
}));
