import type { AgentResponse } from "../types/agent";
import type {
  ArenaConfig,
  DuelArenaMode,
  ArenaPresentationResult,
  ArenaScoreBreakdown,
  ArenaTranscriptEntry,
} from "../types/arena";
import {
  ARENA_MODE_OPTIONS,
  ARENA_TOPICS,
  DUEL_ARENA_ROUNDS,
} from "../constants/arena";

export { ARENA_MODE_OPTIONS, ARENA_TOPICS };

type ArenaSide = "agent_a" | "agent_b";

interface MockTranscriptTemplate {
  round: number;
  speaker: ArenaSide;
  content: string;
}

interface MockArenaScript {
  transcript: MockTranscriptTemplate[];
  scores: Record<ArenaSide, number>;
  score_breakdowns: Record<ArenaSide, ArenaScoreBreakdown>;
  winner: ArenaSide;
  judge_reasoning: string;
}

function scoreBreakdown(
  argument_quality: number,
  expression: number,
  adaptability: number,
  character_consistency: number,
): ArenaScoreBreakdown {
  return {
    argument_quality,
    expression,
    adaptability,
    character_consistency,
    total: argument_quality + expression + adaptability + character_consistency,
  };
}

/** 兼容 Step 22 已有导入；真实来源已移至 constants/arena.ts。 */
export const MOCK_ARENA_ROUNDS = DUEL_ARENA_ROUNDS;

/**
 * Step 22 的确定性 Mock 脚本。
 *
 * 分数使用 development-plan.md 的四项 1-10 分标准，总分 0-40。
 */
export const MOCK_ARENA_SCRIPTS: Record<DuelArenaMode, MockArenaScript> = {
  debate: {
    transcript: [
      {
        round: 1,
        speaker: "agent_a",
        content: "我支持主动承担风险。面对「{topic}」，尝试本身会带来无法从稳定路径获得的信息。",
      },
      {
        round: 1,
        speaker: "agent_b",
        content: "我更看重稳定积累。风险只有在承受能力和退出方案清晰时，才不是冲动。",
      },
      {
        round: 2,
        speaker: "agent_a",
        content: "稳定并不等于安全，环境变化也会让原有路径失效。小规模试错可以控制成本。",
      },
      {
        round: 2,
        speaker: "agent_b",
        content: "小规模试错值得认可，但它仍应建立在基本能力和资源储备之上。",
      },
      {
        round: 3,
        speaker: "agent_a",
        content: "我的结论是先设止损线，再主动行动；可控风险比被动等待更有成长价值。",
      },
      {
        round: 3,
        speaker: "agent_b",
        content: "我的结论是先建立稳定底座，再选择高价值机会；准备充分能提高冒险成功率。",
      },
    ],
    scores: { agent_a: 35, agent_b: 33 },
    score_breakdowns: {
      agent_a: scoreBreakdown(9, 8, 9, 9),
      agent_b: scoreBreakdown(8, 9, 8, 8),
    },
    winner: "agent_a",
    judge_reasoning:
      "{agent_a}的论点推进更完整，并正面回应了稳定路径的优势；{agent_b}的风险控制观点清晰，但反驳力度略弱。",
  },
  interview: {
    transcript: [
      {
        round: 1,
        speaker: "agent_a",
        content: "应聘「{topic}」，我的优势是能把模糊需求拆成可验证的问题，并快速组织实验。",
      },
      {
        round: 1,
        speaker: "agent_b",
        content: "我的优势是持续跟进用户反馈，并协调设计、工程和业务团队完成交付。",
      },
      {
        round: 2,
        speaker: "agent_a",
        content: "如果首周留存下降，我会先分群定位流失环节，再用最小改动验证原因。",
      },
      {
        round: 2,
        speaker: "agent_b",
        content: "我会同时访谈流失用户，避免只看指标而忽略他们真正遇到的阻力。",
      },
      {
        round: 3,
        speaker: "agent_a",
        content: "我能提供结构化分析和快速试验，让团队在信息不足时仍然稳定推进。",
      },
      {
        round: 3,
        speaker: "agent_b",
        content: "我能把数据判断与用户理解结合起来，让产品决策既可验证，也能被团队执行。",
      },
    ],
    scores: { agent_a: 32, agent_b: 36 },
    score_breakdowns: {
      agent_a: scoreBreakdown(8, 8, 8, 8),
      agent_b: scoreBreakdown(9, 9, 9, 9),
    },
    winner: "agent_b",
    judge_reasoning:
      "{agent_b}同时覆盖用户研究、跨团队协作和数据验证，与岗位要求的匹配更全面；{agent_a}分析清晰，但案例维度稍窄。",
  },
  pitch: {
    transcript: [
      {
        round: 1,
        speaker: "agent_a",
        content: "针对「{topic}」，我会从学习计划失控和反馈不及时两个高频问题切入。",
      },
      {
        round: 1,
        speaker: "agent_b",
        content: "我会先聚焦考试复习场景，用更明确的周期和结果降低首次使用门槛。",
      },
      {
        round: 2,
        speaker: "agent_a",
        content: "产品通过每日目标、即时解释和复盘建议形成闭环，并用完成率衡量效果。",
      },
      {
        round: 2,
        speaker: "agent_b",
        content: "我会提供课程资料整理和错题追踪，先证明单一场景中的真实价值。",
      },
      {
        round: 3,
        speaker: "agent_a",
        content: "先在一个院系验证四周，达到留存目标后再扩展课程，控制模型和运营成本。",
      },
      {
        round: 3,
        speaker: "agent_b",
        content: "我会与校园社团合作获取首批用户，通过考试周期验证付费意愿和传播效率。",
      },
    ],
    scores: { agent_a: 37, agent_b: 34 },
    score_breakdowns: {
      agent_a: scoreBreakdown(9, 9, 10, 9),
      agent_b: scoreBreakdown(9, 8, 8, 9),
    },
    winner: "agent_a",
    judge_reasoning:
      "{agent_a}对问题、产品闭环和验证指标的说明更完整，落地路径也更清晰；{agent_b}的获客方案具体，但产品差异化不足。",
  },
  blind_test: {
    transcript: [
      {
        round: 1,
        speaker: "agent_a",
        content: "我认为核心在于建立可验证的假设，而非依赖直觉。面对「{topic}」，数据驱动的决策能降低不确定性。",
      },
      {
        round: 1,
        speaker: "agent_b",
        content: "直觉和经验同样重要。面对「{topic}」，过度依赖数据可能忽略人的真实需求和情感因素。",
      },
      {
        round: 2,
        speaker: "agent_a",
        content: "数据不是万能的，但它是纠偏的基础。我们可以用定性研究补充定量分析，而不是二选一。",
      },
      {
        round: 2,
        speaker: "agent_b",
        content: "我同意两者结合，但优先级应该是先理解人，再用数据验证。顺序错了，结论就会偏。",
      },
      {
        round: 3,
        speaker: "agent_a",
        content: "我的结论是：先建立数据基线，再用用户研究解释异常值，形成闭环决策。",
      },
      {
        round: 3,
        speaker: "agent_b",
        content: "我的结论是：先从用户场景出发定义问题，再用数据衡量方案效果，以人为本。",
      },
    ],
    scores: { agent_a: 34, agent_b: 36 },
    score_breakdowns: {
      agent_a: scoreBreakdown(9, 8, 8, 9),
      agent_b: scoreBreakdown(9, 9, 9, 9),
    },
    winner: "agent_b",
    judge_reasoning:
      "匿名评审下，选手B 的论证更注重人文关怀与逻辑平衡，在不知道身份的情况下，其内容质量略胜一筹。",
  },
};

/** 使用所选 Agent 和竞技配置生成可独立播放的完整 Mock 结果。 */
export function buildMockArenaResult(
  config: ArenaConfig,
  agentA: AgentResponse,
  agentB: AgentResponse,
): ArenaPresentationResult {
  if (agentA.id !== config.agent_a_id || agentB.id !== config.agent_b_id) {
    throw new Error("竞技配置与所选 Agent 不一致");
  }
  if (agentA.id === agentB.id) {
    throw new Error("1v1 竞技必须选择两个不同的 Agent");
  }
  if (!config.topic.trim()) {
    throw new Error("竞技主题不能为空");
  }
  if (config.rounds !== MOCK_ARENA_ROUNDS) {
    throw new Error(`Step 22 Mock 仅支持 ${MOCK_ARENA_ROUNDS} 轮竞技`);
  }

  const script = MOCK_ARENA_SCRIPTS[config.mode];
  const transcript: ArenaTranscriptEntry[] = script.transcript.map(
    (entry, index) => {
      const speaker = entry.speaker === "agent_a" ? agentA : agentB;
      return {
        id: `${config.mode}-${entry.round}-${index + 1}`,
        round: entry.round,
        speaker_id: speaker.id,
        speaker_name: speaker.name,
        content: formatTemplate(entry.content, config.topic.trim(), agentA, agentB),
      };
    },
  );

  return {
    id: `mock-${config.mode}-${agentA.id}-${agentB.id}`,
    mode: config.mode,
    winner_id: script.winner === "agent_a" ? agentA.id : agentB.id,
    scores: {
      [agentA.id]: script.scores.agent_a,
      [agentB.id]: script.scores.agent_b,
    },
    score_breakdowns: {
      [agentA.id]: script.score_breakdowns.agent_a,
      [agentB.id]: script.score_breakdowns.agent_b,
    },
    judge_reasoning: formatTemplate(
      script.judge_reasoning,
      config.topic.trim(),
      agentA,
      agentB,
    ),
    transcript,
    topic: config.topic.trim(),
    rounds: config.rounds,
    participant_ids: [agentA.id, agentB.id],
    participant_names: {
      [agentA.id]: agentA.name,
      [agentB.id]: agentB.name,
    },
    created_at: "2026-07-19T00:00:00.000Z",
  };
}

function formatTemplate(
  template: string,
  topic: string,
  agentA: AgentResponse,
  agentB: AgentResponse,
): string {
  return template
    .split("{topic}")
    .join(topic)
    .split("{agent_a}")
    .join(agentA.name)
    .split("{agent_b}")
    .join(agentB.name);
}
