/**
 * useChatHistoryStore — Step 99d: 用户对话选择历史 Zustand store。
 *
 * 记录用户每次在主动搭话中的选择（友善/冷淡/挑衅），
 * 持久化到 localStorage。影响 Agent 后续搭话频率。
 */

import { create } from "zustand";

// ── 类型 ──

export interface ChatHistoryEntry {
  agentId: string;
  agentName: string;
  choice: "A" | "B" | "C"; // A=友善, B=冷淡, C=挑衅
  topic: string;
  timestamp: number;
}

interface ChatHistoryState {
  entries: ChatHistoryEntry[];
  /** 添加一条记录 */
  addEntry: (entry: ChatHistoryEntry) => void;
  /** 获取对某个 Agent 的最近 N 条选择 */
  getRecentForAgent: (agentId: string, n?: number) => ChatHistoryEntry["choice"][];
  /** 获取某 Agent 的搭话频率修正因子（0.5-1.3） */
  getFrequencyModifier: (agentId: string) => number;
  /** 某 Agent 是否在冷却中（上次选了挑衅 C） */
  isAgentBlocked: (agentId: string, blockDurationMs?: number) => boolean;
}

const STORAGE_KEY = "m11-chat-history";
const MAX_ENTRIES = 50;

function loadEntries(): ChatHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveEntries(entries: ChatHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

// ── Store ──

export const useChatHistoryStore = create<ChatHistoryState>((set, get) => ({
  entries: loadEntries(),

  addEntry: (entry) => {
    set((state) => {
      const next = [...state.entries, entry];
      saveEntries(next);
      return { entries: next };
    });
  },

  getRecentForAgent: (agentId, n = 5) => {
    const { entries } = get();
    return entries
      .filter((e) => e.agentId === agentId)
      .slice(-n)
      .map((e) => e.choice);
  },

  getFrequencyModifier: (agentId) => {
    const recent = get().getRecentForAgent(agentId, 5);
    if (recent.length === 0) return 1.0;

    const friendly = recent.filter((c) => c === "A").length;
    const hostile = recent.filter((c) => c === "C").length;

    // 友善 ≥ 4/5 → +30%
    if (friendly >= 4) return 1.3;
    // 挑衅 ≥ 3/5 → -50%
    if (hostile >= 3) return 0.5;

    return 1.0;
  },

  isAgentBlocked: (agentId, blockDurationMs = 5 * 60 * 1000) => {
    const { entries } = get();
    const last = entries
      .filter((e) => e.agentId === agentId)
      .slice(-1)[0];
    if (!last || last.choice !== "C") return false;
    return Date.now() - last.timestamp < blockDurationMs;
  },
}));
