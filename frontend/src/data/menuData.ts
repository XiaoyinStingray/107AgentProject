/**
 * 56 项功能菜单数据 —— 来源：docs/agent-lab-blueprint.md §3
 * Sidebar 和占位页面共享此数据。
 */

export interface SubItem {
  id: number;
  emoji: string;
  label: string;
  priority: "P0" | "P1" | "P2" | "P3";
  anchor?: string;
}

export interface MenuSection {
  title: string;
  route: string;
  items: SubItem[];
}

export const MENU_SECTIONS: MenuSection[] = [
  {
    title: "M1 铸造厂",
    route: "/agents",
    items: [
      { id: 1, emoji: "🎭", label: "自然语言创建 Agent", priority: "P0" },
      { id: 2, emoji: "🧬", label: "人格引擎", priority: "P0" },
      { id: 3, emoji: "📝", label: "背景故事自动生成", priority: "P1" },
      { id: 4, emoji: "🎯", label: "目标系统", priority: "P1" },
      { id: 5, emoji: "🤔", label: "决策风格参数", priority: "P1" },
      { id: 6, emoji: "🔄", label: "Agent Remix", priority: "P2" },
      { id: 7, emoji: "📦", label: "模板库（30+ Agent）", priority: "P2" },
    ],
  },
  {
    title: "M2 单人剧场",
    route: "/theater",
    items: [
      { id: 8, emoji: "🎬", label: "场景投放", priority: "P0" },
      { id: 9, emoji: "👁️", label: "思维流实时展示", priority: "P0" },
      { id: 10, emoji: "🎯", label: "目标追逐", priority: "P1" },
      { id: 11, emoji: "🧭", label: "动态计划调整", priority: "P1" },
      { id: 12, emoji: "📓", label: "Agent 日记", priority: "P1" },
      { id: 13, emoji: "🔍", label: "决策回放", priority: "P2" },
      { id: 14, emoji: "⏸️", label: "暂停干预", priority: "P2" },
    ],
  },
  {
    title: "M3 群体沙盒",
    route: "/sandbox",
    items: [
      { id: 15, emoji: "🏘️", label: "群体投放", priority: "P0" },
      { id: 16, emoji: "💬", label: "Agent 间对话", priority: "P1" },
      { id: 17, emoji: "🤝", label: "关系演化", priority: "P1" },
      { id: 18, emoji: "⚔️", label: "竞争博弈", priority: "P1" },
      { id: 19, emoji: "🎭", label: "角色冲突", priority: "P2" },
      { id: 20, emoji: "🌐", label: "关系网络图", priority: "P2" },
    ],
  },
  {
    title: "M4 竞技场",
    route: "/arena",
    items: [
      { id: 22, emoji: "🥊", label: "1v1 对抗", priority: "P1" },
      { id: 23, emoji: "🏟️", label: "大乱斗", priority: "P2" },
      { id: 24, emoji: "📋", label: "战报生成", priority: "P2" },
      { id: 25, emoji: "🎯", label: "盲测模式", priority: "P3" },
      { id: 26, emoji: "🔄", label: "复盘对比", priority: "P2" },
      { id: 27, emoji: "🏆", label: "排行榜", priority: "P3" },
      { id: 28, emoji: "🧪", label: "A/B 测试", priority: "P3" },
    ],
  },
  {
    title: "M5 叙事工厂",
    route: "/narratives",
    items: [
      { id: 29, emoji: "📖", label: "小说化叙事", priority: "P1" },
      { id: 30, emoji: "✉️", label: "未来的信", priority: "P2" },
      { id: 31, emoji: "🪞", label: "平行对话", priority: "P2" },
      { id: 32, emoji: "🎙️", label: "播客脚本", priority: "P2" },
      { id: 33, emoji: "🎬", label: "微电影大纲", priority: "P3" },
      { id: 34, emoji: "📔", label: "自动连载", priority: "P3" },
      { id: 35, emoji: "🎨", label: "Agent 自画像", priority: "P3" },
    ],
  },
  {
    title: "M6 控制台",
    route: "/control",
    items: [
      { id: 36, emoji: "📊", label: "多 Agent 仪表盘", priority: "P1" },
      { id: 37, emoji: "🗺️", label: "事件热力图", priority: "P2" },
      { id: 38, emoji: "🔍", label: "Agent 搜索", priority: "P2" },
      { id: 21, emoji: "📊", label: "群体动力学报告", priority: "P2" },
      { id: 39, emoji: "🧠", label: "决策模式识别", priority: "P2" },
      { id: 40, emoji: "⚠️", label: "异常检测", priority: "P3" },
      { id: 41, emoji: "📈", label: "长期追踪", priority: "P3" },
      { id: 42, emoji: "🎯", label: "策略提取", priority: "P3" },
    ],
  },
  {
    title: "M7 干预台",
    route: "/intervention",
    items: [
      { id: 43, emoji: "💉", label: "事件注入", priority: "P2" },
      { id: 44, emoji: "🗣️", label: "上帝之声", priority: "P3" },
      { id: 45, emoji: "⏪", label: "时间回溯", priority: "P3" },
      { id: 46, emoji: "🔀", label: "分支探索", priority: "P3" },
      { id: 47, emoji: "🧬", label: "人格篡改", priority: "P3" },
      { id: 48, emoji: "📋", label: "干预历史", priority: "P3" },
      { id: 49, emoji: "🎮", label: "剧本模式", priority: "P3" },
    ],
  },
  {
    title: "M8 档案馆",
    route: "/archive",
    items: [
      { id: 50, emoji: "📦", label: "Agent 市场", priority: "P3" },
      { id: 51, emoji: "🎬", label: "精彩回放", priority: "P2" },
      { id: 52, emoji: "🧪", label: "实验模板", priority: "P2" },
      { id: 53, emoji: "📊", label: "社区数据大屏", priority: "P3" },
      { id: 54, emoji: "🎖️", label: "成就系统", priority: "P2" },
      { id: 55, emoji: "📄", label: "研究报告导出", priority: "P2" },
      { id: 56, emoji: "🔌", label: "API 开放", priority: "P3" },
    ],
  },
  {
    title: "M9 Agent Team",
    route: "/team",
    items: [],
  },
  {
    title: "M10 LLM Bench",
    route: "/bench",
    items: [],
  },
  {
    title: "M11 游戏化场景",
    route: "/scene",
    items: [
      { id: 57, emoji: "💾", label: "存档系统", priority: "P2", anchor: "checkpoints" },
      { id: 58, emoji: "🎬", label: "导演模式", priority: "P2", anchor: "director" },
      { id: 59, emoji: "📖", label: "叙事导出", priority: "P3", anchor: "export" },
    ],
  },
];

/** 按 id 快速查找子项 */
export function findItemById(id: number): (SubItem & { sectionTitle: string }) | undefined {
  for (const section of MENU_SECTIONS) {
    const found = section.items.find((item) => item.id === id);
    if (found) return { ...found, sectionTitle: section.title };
  }
  return undefined;
}
