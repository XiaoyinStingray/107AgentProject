import type { AgentResponse } from "../types/agent";

/* ================================================================
   Step 22 — 竞技场 Mock 数据
   预置一场辩论赛完整结果，供前端独立开发。
   Phase 8 才会接真实 ArenaEngine。
   ================================================================ */

export interface ArenaScore {
  agentId: string;
  logic: number;        // 论点质量 0–10
  eloquence: number;     // 表达能力 0–10
  adaptability: number;  // 应变能力 0–10
  character: number;     // 人设一致性 0–10
  total: number;         // 总分 0–40
}

export interface ArenaTranscriptRound {
  round: number;
  speakerId: string;
  speakerName: string;
  content: string;
}

export interface ArenaJudgeComment {
  winnerId: string;
  winnerName: string;
  scores: ArenaScore[];
  reasoning: string;
  transcript: ArenaTranscriptRound[];
}

/** 预置辩题 */
export const ARENA_TOPICS = [
  "期末该不该熬夜复习？",
  "大学教育应该更注重理论还是实践？",
  "AI 会取代人类的创造力吗？",
];

/** 小明 vs 小刚 辩论赛完整结果 */
export const MOCK_ARENA_RESULT: ArenaJudgeComment = {
  winnerId: "mock-1",
  winnerName: "小明",
  scores: [
    {
      agentId: "mock-1",
      logic: 8.5,
      eloquence: 7.0,
      adaptability: 8.0,
      character: 9.0,
      total: 32.5,
    },
    {
      agentId: "mock-3",
      logic: 7.5,
      eloquence: 8.0,
      adaptability: 6.5,
      character: 7.5,
      total: 29.5,
    },
  ],
  reasoning:
    `小明的论点以实证研究为基础，逻辑严密，引用了睡眠科学的具体数据支撑「规律作息比熬夜临时抱佛脚更有效」的主张。小刚虽然表达更流畅、气场更强，但过度依赖个人经验，未能有效回应小明提出的睡眠剥夺对记忆固化的影响这一核心论据。在角色一致性上，小明的理性、计划性强的人格特质贯穿始终，而小刚在第三轮明显偏离了平日的竞争型风格——他罕见地承认了对方的优点，与 ESTJ 的赢家心态不符。总的来说，小明以内容深度取胜，小刚以表达技巧占优，但深度比技巧更难替代。`,
  transcript: [
    {
      round: 1,
      speakerId: "mock-3",
      speakerName: "小刚",
      content:
        "熬夜复习是大学的必修课。我在投行实习时，每天只睡 4 个小时，一样拿了最高评价。效率比睡眠时间重要得多——你若是把时间花在睡觉上，别人就比你多 6 小时刷题。这个世界只问结果，不问过程。",
    },
    {
      round: 1,
      speakerId: "mock-1",
      speakerName: "小明",
      content:
        "我理解小刚的拼搏精神，但科学告诉我们：睡眠不足会严重损害记忆固化。研究显示，海马体在深度睡眠期间负责将短期记忆转化为长期记忆。你熬夜学了 6 小时，第二天可能忘了 40%。这不是'努力'，这是低效的自我感动。",
    },
    {
      round: 2,
      speakerId: "mock-3",
      speakerName: "小刚",
      content:
        "你说的那些研究是实验室里的大样本平均值，不代表每个人。我自己的 GPA 就是最好的反例——熬夜复习拿到了专业第一。如果你总是躲在'科学'背后，永远到不了顶尖。顶尖的人制定规则，其他人遵守规则。",
    },
    {
      round: 2,
      speakerId: "mock-1",
      speakerName: "小明",
      content:
        "个人经验不等于普遍规律，这是统计学基础。你的 GPA 第一值得敬佩，但我们讨论的不是'小刚能不能'，而是'大多数人该不该'。另外，我想问小刚一个问题——你拿了专业第一，但代价是什么？身体、社交、还是那些被你归类为'无效率'的思考时间？人生不是只有成绩单。",
    },
    {
      round: 3,
      speakerId: "mock-3",
      speakerName: "小刚",
      content:
        "小明你这个问题问得好…（停顿）好吧，我承认代价确实存在。但在这个阶段，成绩就是硬通货。保研、投行、咨询——第一轮筛的都是 GPA。你可以有你的生活平衡，我选择把全部筹码押在一件事上。这不代表我错了，只是我们选择了不同的战场。",
    },
    {
      round: 3,
      speakerId: "mock-1",
      speakerName: "小明",
      content:
        "尊重你的选择，小刚。但我想修正一个前提：GPA 的边际效用是递减的。3.9 和 4.0 之间的差距，远小于健康作息带来的持久学习力。大学不是 100 米冲刺，是马拉松。今天熬夜拿到的那 0.1 分，可能让你在毕业前燃烧殆尽。与其争夺同一条跑道，不如找到适合自己的节奏。",
    },
  ],
};
