import { beforeEach, describe, expect, it } from "vitest";
import type { SSEEvent } from "../types/events";
import { relationshipKey, useSSEStore } from "./useSSEStore";

function relationshipEvent(score = 0.25): SSEEvent {
  return {
    id: "rel-1",
    type: "relationship_change",
    tick: 2,
    data: {
      from: "a1",
      to: "a2",
      interaction: "friendly",
      intensity: 1.5,
      old_score: 0.1,
      new_score: score,
    },
  };
}

describe("Step 33 useSSEStore", () => {
  beforeEach(() => useSSEStore.getState().clear());

  it("retains at most 500 events", () => {
    for (let index = 0; index <= 500; index += 1) {
      useSSEStore.getState().appendEvent({
        id: `event-${index}`,
        type: "world_event",
        tick: index,
      });
    }
    const events = useSSEStore.getState().events;
    expect(events).toHaveLength(500);
    expect(events[0]?.id).toBe("event-1");
  });

  it("normalizes relationship_change events", () => {
    useSSEStore.getState().appendEvent(relationshipEvent());
    const state = useSSEStore.getState();
    expect(state.relationships[relationshipKey("a1", "a2")]).toMatchObject({
      score: 0.25,
      interaction: "friendly",
      lastChange: 0.15,
    });
  });

  it("keeps newer SSE state when a REST snapshot arrives late", () => {
    useSSEStore.getState().appendEvent(relationshipEvent(0.4));
    useSSEStore.getState().hydrateRelationships({
      nodes: [],
      edges: [{ source: "a1", target: "a2", score: 0.1 }],
    });
    expect(
      useSSEStore.getState().relationships[relationshipKey("a1", "a2")]?.score,
    ).toBe(0.4);
  });

  it("ignores malformed relationship payloads", () => {
    useSSEStore.getState().appendEvent({
      type: "relationship_change",
      tick: 1,
      data: { from: "a1" },
    });
    expect(useSSEStore.getState().relationships).toEqual({});
  });
});
