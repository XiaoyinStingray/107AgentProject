/* ================================================================
   Step 25 — 档案馆 (M8) Mock 数据
   档案馆页面独立运行所需的全部 Mock 数据 + 工具函数。
   后端 API 尚未实现，前端 Mock 模式可完整浏览。
   ================================================================ */

import type {
  ArchiveTab,
  ReplayRecord,
  ExperimentTemplate,
  Achievement,
  AchievementSummary,
} from "../types/archive";
import type { AgentResponse } from "../types/agent";
import { MOCK_AGENTS } from "./agents";
import { MOCK_SANDBOX_SCENARIOS } from "./sandbox";

/** Tab 元数据——驱动 Tab 栏渲染，与 menuData M8 模块 7 项对齐 */
export interface ArchiveTabMeta {
  key: ArchiveTab;
  label: string;
  emoji: string;
  priority: "P2" | "P3";
  available: boolean;
}

export const ARCHIVE_TABS: ArchiveTabMeta[] = [
  { key: "highlights", label: "精彩回放", emoji: "🎬", priority: "P2", available: true },
  { key: "templates", label: "实验模板", emoji: "🧪", priority: "P2", available: true },
  { key: "achievements", label: "成就系统", emoji: "🎖️", priority: "P2", available: true },
  { key: "export", label: "研究报告导出", emoji: "📄", priority: "P2", available: true },
  { key: "market", label: "Agent 市场", emoji: "📦", priority: "P3", available: false },
  { key: "dashboard", label: "社区数据大屏", emoji: "📊", priority: "P3", available: false },
  { key: "api", label: "API 开放", emoji: "🔌", priority: "P3", available: false },
];

/** Mock 精彩回放记录 */
export const MOCK_REPLAYS: ReplayRecord[] = [
  {
    id: "replay-1",
    scenarioName: "新生报到",
    agents: [MOCK_AGENTS[0], MOCK_AGENTS[1], MOCK_AGENTS[2]],
    totalTicks: 20,
    status: "completed",
    createdAt: "2026-07-19T10:00:00Z",
    eventCount: 47,
  },
  {
    id: "replay-2",
    scenarioName: "期末周",
    agents: [MOCK_AGENTS[0], MOCK_AGENTS[1]],
    totalTicks: 15,
    status: "completed",
    createdAt: "2026-07-19T14:30:00Z",
    eventCount: 32,
  },
  {
    id: "replay-3",
    scenarioName: "毕业选择",
    agents: [MOCK_AGENTS[2]],
    totalTicks: 8,
    status: "paused",
    createdAt: "2026-07-19T16:00:00Z",
    eventCount: 12,
  },
];

/** Mock 实验模板——复用 Step 20 的内置场景 */
export const MOCK_TEMPLATES: ExperimentTemplate[] = MOCK_SANDBOX_SCENARIOS.map(
  (sc, i) => ({
    id: `tpl-${i + 1}`,
    name: sc.name ?? "未命名场景",
    description: sc.description ?? "",
    scenario: sc,
    suggestedAgents: i === 0 ? 3 : i === 1 ? 2 : 4,
    estimatedTicks: sc.time_range ?? "1-10",
    tags: getTemplateTags(sc.name ?? ""),
  }),
);

/** Mock 成就列表 */
export const MOCK_ACHIEVEMENTS: Achievement[] = [
  { id: "ach-1", emoji: "🎭", title: "造物主", description: "创建第一个 Agent", progress: 1, unlocked: true, unlockedAt: "2026-07-18T10:00:00Z" },
  { id: "ach-2", emoji: "👥", title: "三人成众", description: "在同一场景中放入 3 个 Agent", progress: 1, unlocked: true, unlockedAt: "2026-07-18T14:00:00Z" },
  { id: "ach-3", emoji: "📖", title: "说书人", description: "生成第一篇叙事", progress: 1, unlocked: true, unlockedAt: "2026-07-19T15:00:00Z" },
  { id: "ach-4", emoji: "🥊", title: "角斗士", description: "发起第一场竞技", progress: 0.5, unlocked: false },
  { id: "ach-5", emoji: "🕐", title: "马拉松", description: "模拟运行超过 100 Tick", progress: 0.43, unlocked: false },
  { id: "ach-6", emoji: "🤝", title: "和平使者", description: "两个 Agent 关系分达到 0.8+", progress: 0.25, unlocked: false },
  { id: "ach-7", emoji: "⚔️", title: "宿敌", description: "两个 Agent 关系分降到 -0.5 以下", progress: 0.2, unlocked: false },
  { id: "ach-8", emoji: "📊", title: "观察者", description: "在控制台查看 10 次以上", progress: 0.7, unlocked: false },
  { id: "ach-9", emoji: "🎬", title: "导演", description: "成功注入 5 次事件", progress: 0.6, unlocked: false },
  { id: "ach-10", emoji: "🏆", title: "全能选手", description: "解锁所有其他成就", progress: 0, unlocked: false },
];

/** Mock 成就统计摘要 */
export const MOCK_ACHIEVEMENT_SUMMARY: AchievementSummary = {
  totalAgents: 3,
  totalSimulations: 3,
  totalTicks: 43,
  totalNarratives: 6,
};

/** 状态 → 显示文本 */
export function formatReplayStatus(status: ReplayRecord["status"]): string {
  const map: Record<ReplayRecord["status"], string> = {
    completed: "已完成",
    paused: "已暂停",
    running: "运行中",
  };
  return map[status] ?? status;
}

/** 状态 → 颜色 class */
export function replayStatusColor(status: ReplayRecord["status"]): string {
  const map: Record<ReplayRecord["status"], string> = {
    completed: "text-accent-green",
    paused: "text-accent-orange",
    running: "text-accent-blue",
  };
  return map[status] ?? "text-text-secondary";
}

/** ISO 时间 → 可读格式 */
export function formatArchiveTime(iso: string): string {
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}-${dd} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}

/** 根据场景名生成标签 */
function getTemplateTags(name: string): string[] {
  const tagMap: Record<string, string[]> = {
    "新生报到": ["社交", "初始关系", "低压"],
    "期末周": ["竞争", "压力", "资源争夺"],
    "毕业选择": ["人生转折", "多目标", "高压"],
  };
  return tagMap[name] ?? ["通用"];
}

/** 生成 Mock 报告内容 */
export function generateMockReport(agentName: string): string {
  return `# 实验报告 — ${agentName}

> 生成时间：${new Date().toISOString()}
> 平台：人生实验室 Life Lab v0.1.0

## 1. Agent 概况

${agentName} 是通过自然语言描述创建的自主 Agent，具备完整的人格系统（MBTI + 大五人格 + 价值观 + 决策风格）。

## 2. 模拟记录

| 指标 | 数值 |
|------|------|
| 参与模拟次数 | 3 |
| 总 Tick 数 | 43 |
| 产生事件数 | 91 |
| 生成叙事数 | 6 |

## 3. 关键发现

- Agent 在社交场景中表现出与人格设定一致的行为模式
- 关系演化符合预期——合作行为提升关系分，竞争行为降低关系分
- 叙事输出保持了角色口吻一致性

## 4. 结论

本次实验验证了 Agent 社会模拟平台的核心能力：自然语言创建 → 自主决策 → 关系演化 → 叙事输出。

---
*报告由 Life Lab 自动生成*
`;
}

/** 下载文本为文件 */
export function downloadAsFile(content: string, filename: string, mimeType = "text/markdown"): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
