export interface SubItem {
  id: number;
  emoji: string;
  label: string;
  priority: "P0" | "P1" | "P2";
  anchor?: string;
  redirect?: string;
}

export interface MenuSection {
  title: string;
  route: string;
  items: SubItem[];
}

export const MENU_SECTIONS: MenuSection[] = [
  {
    title: "M1 铸造厂", route: "/agents",
    items: [
      { id: 1, emoji: "🎭", label: "创建 Agent", priority: "P0", anchor: "foundry" },
      { id: 6, emoji: "🔄", label: "Agent Remix", priority: "P2", anchor: "item-6" },
      { id: 4, emoji: "🎯", label: "目标系统", priority: "P1", anchor: "foundry" },
      { id: 7, emoji: "📦", label: "模板库", priority: "P2", anchor: "item-7" },
    ],
  },
  {
    title: "M2 单人剧场", route: "/theater",
    items: [
      { id: 8, emoji: "🎬", label: "场景投放", priority: "P0" },
      { id: 9, emoji: "👁️", label: "思维流实时展示", priority: "P0" },
      { id: 14, emoji: "⏸️", label: "暂停/干预", priority: "P2" },
      { id: 13, emoji: "🔍", label: "决策回放", priority: "P2" },
    ],
  },
  {
    title: "M3 群体沙盒", route: "/sandbox",
    items: [
      { id: 15, emoji: "🏘️", label: "群体投放", priority: "P0" },
      { id: 16, emoji: "💬", label: "Agent 间实时对话", priority: "P1" },
      { id: 20, emoji: "🌐", label: "关系网络图", priority: "P2" },
    ],
  },
  {
    title: "M4 竞技场", route: "/arena",
    items: [
      { id: 22, emoji: "🥊", label: "1v1 对抗", priority: "P1", anchor: "duel" },
      { id: 23, emoji: "🏟️", label: "大乱斗", priority: "P2", anchor: "battle" },
      { id: 24, emoji: "📋", label: "战报生成", priority: "P2", anchor: "report" },
      { id: 25, emoji: "🎯", label: "盲测模式", priority: "P2", redirect: "/bench#compare" },
      { id: 26, emoji: "🔄", label: "复盘对比", priority: "P2", anchor: "review" },
      { id: 27, emoji: "🏆", label: "排行榜", priority: "P2", redirect: "/bench#leaderboard" },
      { id: 28, emoji: "🧪", label: "A/B 测试", priority: "P2", redirect: "/bench#compare" },
    ],
  },
  {
    title: "M5 叙事工厂", route: "/narratives",
    items: [
      { id: 29, emoji: "📖", label: "小说化叙事", priority: "P1", anchor: "story" },
      { id: 30, emoji: "✉️", label: "未来的信", priority: "P2", anchor: "letter" },
      { id: 31, emoji: "💬", label: "平行对话", priority: "P2", anchor: "parallel" },
      { id: 32, emoji: "🎙️", label: "播客脚本", priority: "P2", anchor: "podcast" },
      { id: 33, emoji: "🎬", label: "微电影大纲", priority: "P2", anchor: "microfilm" },
      { id: 34, emoji: "📔", label: "自动连载", priority: "P2", anchor: "serial" },
      { id: 35, emoji: "🎨", label: "Agent 自画像", priority: "P2", anchor: "selfportrait" },
    ],
  },
  {
    title: "M6 控制台", route: "/control",
    items: [
      { id: 36, emoji: "📊", label: "多 Agent 仪表盘", priority: "P1", anchor: "dashboard" },
      { id: 37, emoji: "🗺️", label: "事件热力图", priority: "P2", anchor: "heatmap" },
      { id: 38, emoji: "🔍", label: "Agent 搜索", priority: "P2", anchor: "search" },
      { id: 21, emoji: "📊", label: "群体动力学报告", priority: "P2", anchor: "dynamics" },
      { id: 39, emoji: "🧠", label: "决策模式识别", priority: "P2", anchor: "decisions" },
    ],
  },
  {
    title: "M7 干预台", route: "/intervention",
    items: [
      { id: 43, emoji: "💉", label: "事件注入", priority: "P2" },
      { id: 48, emoji: "📋", label: "干预历史", priority: "P2" },
    ],
  },
  {
    title: "M8 档案馆", route: "/archive",
    items: [
      { id: 52, emoji: "🧪", label: "实验模板", priority: "P2", anchor: "templates" },
      { id: 51, emoji: "🎬", label: "精彩回放", priority: "P2", anchor: "highlights" },
      { id: 54, emoji: "🎖️", label: "成就系统", priority: "P2", anchor: "achievements" },
      { id: 55, emoji: "📄", label: "研究报告导出", priority: "P2", anchor: "export" },
    ],
  },
  { title: "M9 Agent Team", route: "/team", items: [] },
  { title: "M10 LLM Bench", route: "/bench", items: [] },
  {
    title: "M11 游戏化场景", route: "/scene",
    items: [
      { id: 57, emoji: "💾", label: "存档系统", priority: "P2", anchor: "checkpoints" },
      { id: 58, emoji: "🎬", label: "导演模式", priority: "P2", anchor: "director" },
    ],
  },
  {
    title: "M12 Worker", route: "/worker",
    items: [
      { id: 59, emoji: "⚡", label: "终端工作台", priority: "P0" },
      { id: 60, emoji: "🔗", label: "管道编辑器", priority: "P2" },
      { id: 61, emoji: "📁", label: "文件浏览器", priority: "P2" },
    ],
  },
];

export function findItemById(id: number): (SubItem & { sectionTitle: string }) | undefined {
  for (const section of MENU_SECTIONS) {
    const found = section.items.find((item) => item.id === id);
    if (found) return { ...found, sectionTitle: section.title };
  }
  return undefined;
}
