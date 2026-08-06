/**
 * 成就系统 — localStorage 持久化，跨页面触发。
 * 用法：import { unlock } from "../game/achievements"; unlock("settings-master");
 */

const STORAGE_KEY = "lifelab-achievements";

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  module: string;
}

export const ACHIEVEMENTS: Record<string, Achievement> = {
  /* ── 平台通用 ── */
  "settings-master": { id: "settings-master", title: "调参大师", desc: "修改并保存参数设置 3 次", icon: "⚙️", module: "平台" },
  "data-steward": { id: "data-steward", title: "数据管家", desc: "使用过数据库清空或载入功能", icon: "🗄️", module: "平台" },
  "guide-complete": { id: "guide-complete", title: "学无止境", desc: "阅读全部 12 个模块的使用教程", icon: "🏆", module: "平台" },
  "self-starter": { id: "self-starter", title: "自力更生", desc: "通过 WelcomeModal 配置成功 API Key", icon: "🔑", module: "平台" },

  /* ── M9 Agent Team ── */
  "team-formed": { id: "team-formed", title: "团队组建者", desc: "组建第一个 Agent 团队", icon: "👥", module: "M9" },
  "team-task-done": { id: "team-task-done", title: "协作完成", desc: "团队完成第一个协作任务", icon: "✅", module: "M9" },
  "team-veteran": { id: "team-veteran", title: "老队长", desc: "团队累计完成 5 个任务", icon: "🎖️", module: "M9" },

  /* ── M10 LLM Bench ── */
  "bench-first-run": { id: "bench-first-run", title: "评测入门", desc: "完成第一次批量评测", icon: "🔬", module: "M10" },
  "bench-fingerprint": { id: "bench-fingerprint", title: "指纹收集者", desc: "为 Agent 生成行为指纹", icon: "🧬", module: "M10" },

  /* ── M11 游戏化场景 ── */
  "scene-first-deploy": { id: "scene-first-deploy", title: "首演", desc: "第一次投放 Agent 到场景", icon: "🎬", module: "M11" },
  "scene-whisperer": { id: "scene-whisperer", title: "耳语调教师", desc: "发送 20 条耳语指令", icon: "👂", module: "M11" },
  "scene-proactive": { id: "scene-proactive", title: "搭话王", desc: "被 Agent 主动搭话 5 次", icon: "💭", module: "M11" },

  /* ── M12 Worker ── */
  "worker-first-task": { id: "worker-first-task", title: "第一个任务", desc: "Worker 完成第一个任务", icon: "⚡", module: "M12" },
  "worker-pipeline": { id: "worker-pipeline", title: "管道工", desc: "创建并保存第一个 Pipeline", icon: "🔗", module: "M12" },
  "worker-special-tool": { id: "worker-special-tool", title: "工具大师", desc: "使用过 3 种不同的特殊工具", icon: "🛠️", module: "M12" },
  "worker-output-10": { id: "worker-output-10", title: "产出达人", desc: "Worker 累计产出 10 个文件", icon: "🏆", module: "M12" },
};

/** 获取已解锁成就 ID 集合 */
export function getUnlocked(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]")); } catch { return new Set(); }
}

/** 检查是否已解锁 */
export function isUnlocked(id: string): boolean { return getUnlocked().has(id); }

/** 解锁成就——返回 true 表示首次解锁，false 表示已解锁过 */
export function unlock(id: string): boolean {
  const unlocked = getUnlocked();
  if (unlocked.has(id)) return false;
  unlocked.add(id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...unlocked]));
  // 广播事件以供其他组件监听（如 toast）
  window.dispatchEvent(new CustomEvent("achievement-unlocked", { detail: ACHIEVEMENTS[id] }));
  return true;
}
