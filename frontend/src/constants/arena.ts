import type {
  ArenaModeOption,
  DuelArenaMode,
} from "../types/arena";


export const DUEL_ARENA_ROUNDS = 3;
export const ARENA_REPLAY_INTERVAL_MS = 700;
export const ARENA_JUDGE_REPLAY_MS = 900;
export const MIN_BATTLE_ROYALE_AGENTS = 6;
export const MAX_BATTLE_ROYALE_AGENTS = 8;

/** 四种 1v1 模式的用户可见配置（含盲测）。 */
export const ARENA_MODE_OPTIONS: ArenaModeOption[] = [
  {
    value: "debate",
    label: "辩论赛",
    description: "围绕同一主题交锋，比较论点、表达与应变能力。",
    default_topic: "大学生应优先追求稳定，还是主动承担风险？",
  },
  {
    value: "interview",
    label: "面试竞争",
    description: "竞争同一岗位，比较经历、能力与岗位匹配度。",
    default_topic: "校园 AI 产品经理实习岗位",
  },
  {
    value: "pitch",
    label: "创业路演",
    description: "陈述同一创业方向，比较洞察、方案与落地能力。",
    default_topic: "面向大学生的 AI 学习伙伴",
  },
  {
    value: "blind_test",
    label: "盲测模式",
    description: "裁判评分时隐藏选手身份，仅根据内容质量评判。",
    default_topic: "数据驱动决策是否优于直觉经验？",
  },
];

/** DuelArena 专用模式选项（不含盲测，盲测有独立入口）。 */
export const DUEL_MODE_OPTIONS: ArenaModeOption[] = ARENA_MODE_OPTIONS.filter(
  (opt) => opt.value !== "blind_test",
);

/** 各 1v1 模式的可编辑主题预设。 */
export const ARENA_TOPICS: Record<DuelArenaMode, string[]> = {
  debate: [
    "大学生应优先追求稳定，还是主动承担风险？",
    "大学教育应该更注重理论还是实践？",
    "AI 会取代人类的创造力吗？",
  ],
  interview: [
    "校园 AI 产品经理实习岗位",
    "学生创新实验室项目负责人",
    "AI 教育产品用户研究实习生",
  ],
  pitch: [
    "面向大学生的 AI 学习伙伴",
    "帮助新生适应校园生活的智能服务",
    "低成本校园心理支持平台",
  ],
  blind_test: [
    "数据驱动决策是否优于直觉经验？",
    "团队合作比个人能力更重要吗？",
    "短期利益与长期价值如何取舍？",
  ],
};

/** 大乱斗默认主题，用户仍可自由编辑。 */
export const BATTLE_ROYALE_TOPICS = [
  "有限校园创新基金应该交给谁使用？",
  "谁最适合领导一支跨学科创业团队？",
  "面对突发校园危机，谁能提出最佳解决方案？",
];

/** 后端稳定评分键对应的展示标签。 */
export const ARENA_SCORE_LABELS: Record<string, string> = {
  argument_quality: "内容质量",
  expression: "表达能力",
  adaptability: "应变能力",
  character_consistency: "人设一致",
};
