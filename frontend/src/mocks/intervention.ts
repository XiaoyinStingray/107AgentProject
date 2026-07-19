import type { InjectionEventType, InjectionTypeMeta, InjectionRecord } from "../types/intervention";

/* ================================================================
   Step 24 — M7 干预台 Mock 数据
   注入类型元数据 + 预置示例干预历史，供前端独立开发。
   后端 /api/worlds/{id}/inject 实现后替换为真实 API 调用。
   ================================================================ */

/** 4 种可注入的事件类型——与 SSEEventType 对齐（去除 thought_stream / tick_boundary）。 */
export const INJECTION_TYPES: InjectionTypeMeta[] = [
  {
    key: "world_event",
    label: "世界事件",
    emoji: "🌐",
    description: "向整个世界注入一个外部事件（如天气变化、突发事件）",
    needsTarget: false,
  },
  {
    key: "agent_message",
    label: "Agent 消息",
    emoji: "💬",
    description: "替目标 Agent 发送一条消息",
    needsTarget: true,
  },
  {
    key: "agent_action",
    label: "Agent 行动",
    emoji: "⚡",
    description: "让目标 Agent 执行一个特定行动",
    needsTarget: true,
  },
  {
    key: "relationship_change",
    label: "关系变化",
    emoji: "🤝",
    description: "直接修改两个 Agent 之间的关系分数",
    needsTarget: true,
  },
];

/** M7 P3 占位面板元数据——与 menuData.ts M7 模块后 6 项对齐。 */
export interface PlaceholderPanelMeta {
  key: string;
  label: string;
  emoji: string;
  description: string;
  priority: "P3";
  available: false;
}

export const INTERVENTION_PLACEHOLDERS: PlaceholderPanelMeta[] = [
  {
    key: "voice_of_god",
    label: "上帝之声",
    emoji: "🗣️",
    description: "向所有 Agent 广播一条指令性消息",
    priority: "P3",
    available: false,
  },
  {
    key: "rewind",
    label: "时间回溯",
    emoji: "⏪",
    description: "回退到指定 Tick 重新模拟",
    priority: "P3",
    available: false,
  },
  {
    key: "branch",
    label: "分支探索",
    emoji: "🔀",
    description: "从任意 Tick 创建平行宇宙分支",
    priority: "P3",
    available: false,
  },
  {
    key: "persona",
    label: "人格篡改",
    emoji: "🧬",
    description: "直接修改 Agent 的人格参数",
    priority: "P3",
    available: false,
  },
  {
    key: "script",
    label: "剧本模式",
    emoji: "🎮",
    description: "预设剧本，按节拍触发事件",
    priority: "P3",
    available: false,
  },
];

/** 预置示例干预历史——展示历史列表的视觉样貌。 */
export const MOCK_INTERVENTION_HISTORY: InjectionRecord[] = [
  {
    id: "mock-inj-1",
    type: "world_event",
    targetAgentId: null,
    targetName: "世界",
    description: "突然下起暴雨，图书馆外的露天自习区被迫关闭。",
    timestamp: "2026-07-19T14:30:00Z",
    status: "applied",
  },
  {
    id: "mock-inj-2",
    type: "agent_message",
    targetAgentId: "mock-1",
    targetName: "小明",
    description: "高中班主任突然发来微信：「保研名额有变，速回电话。」",
    timestamp: "2026-07-19T15:05:00Z",
    status: "applied",
  },
  {
    id: "mock-inj-3",
    type: "relationship_change",
    targetAgentId: "mock-3",
    targetName: "小刚",
    description: "小红的突然示好让小刚警惕，关系分数 -0.15。",
    timestamp: "2026-07-19T15:42:00Z",
    status: "applied",
  },
];

/** 生成唯一注入 id。 */
export function generateInjectionId(): string {
  return `inj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 创建一条新的注入记录。 */
export function createInjectionRecord(
  type: InjectionEventType,
  targetAgentId: string | null,
  targetName: string,
  description: string,
): InjectionRecord {
  return {
    id: generateInjectionId(),
    type,
    targetAgentId,
    targetName,
    description,
    timestamp: new Date().toISOString(),
    status: "applied",
  };
}

/** 注入类型 key → 元数据查找。 */
export function getInjectionTypeMeta(
  key: InjectionEventType,
): InjectionTypeMeta | undefined {
  return INJECTION_TYPES.find((t) => t.key === key);
}

/** ISO 时间 → 可读格式（YYYY-MM-DD HH:MM）。 */
export function formatInjectionTime(iso: string): string {
  try {
    const d = new Date(iso);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}
