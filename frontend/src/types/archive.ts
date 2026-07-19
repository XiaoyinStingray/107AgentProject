/* ================================================================
   Step 25 — 档案馆 (M8) 类型定义
   档案馆页面共用的 TypeScript 类型。
   ================================================================ */

import type { AgentResponse } from "./agent";
import type { Scenario } from "./world";

/** 档案馆 Tab 键——与 menuData M8 模块 7 项对齐 */
export type ArchiveTab =
  | "highlights"
  | "templates"
  | "achievements"
  | "export"
  | "market"
  | "dashboard"
  | "api";

/** 精彩回放记录 */
export interface ReplayRecord {
  id: string;
  scenarioName: string;
  agents: AgentResponse[];
  totalTicks: number;
  status: "completed" | "paused" | "running";
  createdAt: string;
  eventCount: number;
}

/** 实验模板 */
export interface ExperimentTemplate {
  id: string;
  name: string;
  description: string;
  scenario: Scenario;
  suggestedAgents: number;
  estimatedTicks: string;
  tags: string[];
}

/** 成就定义 */
export interface Achievement {
  id: string;
  emoji: string;
  title: string;
  description: string;
  /** 0-1，解锁进度 */
  progress: number;
  unlocked: boolean;
  unlockedAt?: string;
}

/** 成就统计摘要 */
export interface AchievementSummary {
  totalAgents: number;
  totalSimulations: number;
  totalTicks: number;
  totalNarratives: number;
}

/** 报告导出配置 */
export interface ExportConfig {
  agentId: string;
  format: "markdown" | "json";
  includeNarratives: boolean;
  includeEvents: boolean;
  includeStats: boolean;
}

/** 组件 Props */
export interface HighlightsPanelProps {
  replays: ReplayRecord[];
}

export interface TemplatesPanelProps {
  templates: ExperimentTemplate[];
}

export interface AchievementsPanelProps {
  achievements: Achievement[];
  summary: AchievementSummary;
}

export interface ExportPanelProps {
  agents: AgentResponse[];
}
