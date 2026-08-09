import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { client } from "../api/client";
import { useSSEStore } from "../stores/useSSEStore";
import { useSSE } from "./useSSE";

vi.mock("../api/client", () => ({
  client: { get: vi.fn() },
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];

  readonly url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  close = vi.fn();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
}

describe("M2 useSSE lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    FakeEventSource.instances = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    useSSEStore.getState().clear();
    vi.mocked(client.get).mockResolvedValue([]);
  });

  it("connects, receives events, and closes the stream on unmount", async () => {
    const { result, unmount } = renderHook(() => useSSE("world-1"));

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const source = FakeEventSource.instances[0]!;
    expect(source.url).toBe("/api/worlds/world-1/stream");

    act(() => source.onopen?.());
    expect(result.current.connected).toBe(true);

    act(() => {
      source.emit({
        id: "event-1",
        type: "thought_stream",
        tick: 1,
        agent_id: "agent-1",
        content: "我在思考",
      });
    });
    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]?.content).toBe("我在思考");

    unmount();
    expect(source.close).toHaveBeenCalledTimes(1);
    expect(useSSEStore.getState().connected).toBe(false);
  });

  it("replays persisted events and maps REST fields to the SSE shape", async () => {
    vi.mocked(client.get).mockResolvedValue([
      {
        id: "persisted-1",
        world_id: "world-1",
        tick: 2,
        type: "agent_message",
        source_agent_id: "agent-1",
        target_agent_ids: [],
        description: "历史发言",
        data: {
          agent_name: "陈墨",
          message: "历史发言",
          subtext: "平静地说",
          tone: "neutral",
        },
        created_at: "2026-08-09T00:00:00Z",
      },
    ]);

    const { result } = renderHook(() => useSSE("world-1"));

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(client.get).toHaveBeenCalledWith(
      "/worlds/world-1/events?tick_from=0",
    );
    expect(result.current.events[0]).toMatchObject({
      id: "persisted-1",
      type: "agent_message",
      agent_id: "agent-1",
      agent_name: "陈墨",
      content: "历史发言",
      message: "历史发言",
      subtext: "平静地说",
      tone: "neutral",
      tick: 2,
    });
  });

  it("deduplicates a persisted event received again from the live stream", async () => {
    vi.mocked(client.get).mockResolvedValue([
      {
        id: "same-event",
        world_id: "world-1",
        tick: 1,
        type: "world_event",
        target_agent_ids: [],
        description: "同一个事件",
        data: {},
        created_at: "2026-08-09T00:00:00Z",
      },
    ]);

    const { result } = renderHook(() => useSSE("world-1"));
    await waitFor(() => expect(result.current.events).toHaveLength(1));

    const source = FakeEventSource.instances[0]!;
    act(() => {
      source.emit({
        id: "same-event",
        type: "world_event",
        tick: 1,
        description: "同一个事件",
      });
    });

    expect(result.current.events).toHaveLength(1);
  });

  it("clears the previous World events before connecting to another World", async () => {
    const { result, rerender } = renderHook(
      ({ worldId }) => useSSE(worldId),
      { initialProps: { worldId: "world-1" as string | null } },
    );
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

    act(() => {
      FakeEventSource.instances[0]!.emit({
        id: "old-event",
        type: "world_event",
        tick: 1,
        description: "旧世界事件",
      });
    });
    expect(result.current.events).toHaveLength(1);

    rerender({ worldId: "world-2" });

    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(2));
    expect(result.current.events).toHaveLength(0);
    expect(FakeEventSource.instances[0]!.close).toHaveBeenCalled();
    expect(client.get).toHaveBeenCalledWith(
      "/worlds/world-2/events?tick_from=0",
    );
  });
});
