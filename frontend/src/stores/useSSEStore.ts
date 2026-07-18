import { create } from "zustand";
import type { SSEEvent } from "../types/events";

interface SSEStore {
  events: SSEEvent[];
  connected: boolean;
  appendEvent: (e: SSEEvent) => void;
  clear: () => void;
  setConnected: (c: boolean) => void;
}

export const useSSEStore = create<SSEStore>((set) => ({
  events: [],
  connected: false,
  appendEvent: (e) =>
    set((s) => ({
      // 最多保留 500 条，防止 DOM 积压
      events: [...s.events.slice(-499), e],
    })),
  clear: () => set({ events: [] }),
  setConnected: (c) => set({ connected: c }),
}));
