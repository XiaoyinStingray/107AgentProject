import { listMockAgents } from "./agentApi";
import { MOCK_AGENTS } from "./agents";
import { buildMockArenaResult } from "./arena";
import type {
  ArenaApiResult,
  ArenaConfig,
  ArenaReportResponse,
  BattleRoyaleConfig,
} from "../types/arena";


let nextArenaId = 1;
let arenaResults: ArenaApiResult[] = createSeedResults();

/** 在 Mock API 中运行一场确定性的 1v1 竞技。 */
export async function runMockDuel(
  request: ArenaConfig,
): Promise<ArenaApiResult> {
  const agents = await listMockAgents();
  const agentA = agents.find((agent) => agent.id === request.agent_a_id);
  const agentB = agents.find((agent) => agent.id === request.agent_b_id);
  if (!agentA || !agentB) throw new Error("参赛 Agent 不存在");

  const presentation = buildMockArenaResult(request, agentA, agentB);
  const result = presentationToApi(
    presentation,
    `mock-arena-${nextArenaId++}`,
  );
  arenaResults.unshift(result);
  return structuredClone(result);
}

/** 在 Mock API 中运行一场 6–8 人分阶段自由淘汰赛。 */
export async function runMockBattleRoyale(
  request: BattleRoyaleConfig,
): Promise<ArenaApiResult> {
  const agents = await listMockAgents();
  const participants = request.agent_ids.map((id) =>
    agents.find((agent) => agent.id === id),
  );
  if (participants.some((agent) => !agent)) {
    throw new Error("参赛 Agent 不存在");
  }
  if (new Set(request.agent_ids).size !== request.agent_ids.length) {
    throw new Error("大乱斗不能重复选择同一个 Agent");
  }
  if (request.agent_ids.length < 6 || request.agent_ids.length > 8) {
    throw new Error("大乱斗需要选择 6–8 个 Agent");
  }

  const resolved = participants.flatMap((agent) => agent ? [agent] : []);
  const transcript: ArenaApiResult["transcript"] = [];
  const scores: Record<string, number> = {};
  let survivors = [...resolved];
  let turn = 0;
  let round = 1;
  while (survivors.length > 1) {
    const survivorCount = Math.max(1, Math.ceil(survivors.length / 2));
    survivors.forEach((agent, index) => {
      const stageScore = Math.max(4, 40 - index * 3);
      scores[agent.id] = stageScore;
      transcript.push({
        turn: turn++,
        round,
        speaker_id: agent.id,
        speaker: agent.name,
        content: `${agent.name}围绕“${request.topic}”提交了第 ${round} 阶段方案，重点展示其判断与应变能力。`,
        stage_score: stageScore,
        stage_rank: index + 1,
        advanced: index < survivorCount,
      });
      if (index > 0) transcript[transcript.length - 1]!.content += "并回应了前一位参赛者。";
    });
    survivors = survivors.slice(0, survivorCount);
    round += 1;
  }

  const scoreBreakdown = Object.fromEntries(
    resolved.map((agent) => {
      const quarter = Math.round((scores[agent.id] ?? 20) / 4);
      return [agent.id, {
        argument_quality: quarter,
        expression: quarter,
        adaptability: quarter,
        character_consistency: quarter,
      }];
    }),
  );
  const result: ArenaApiResult = {
    id: `mock-arena-${nextArenaId++}`,
    mode: "battle_royale",
    winner_id: survivors[0]!.id,
    scores,
    score_breakdown: scoreBreakdown,
    judge_reasoning: `${survivors[0]!.name}在多阶段竞争中保持了最完整的方案和最稳定的临场回应。`,
    transcript,
    topic: request.topic.trim(),
    rounds: round - 1,
    participant_ids: resolved.map((agent) => agent.id),
    participant_names: Object.fromEntries(
      resolved.map((agent) => [agent.id, agent.name]),
    ),
    created_at: new Date().toISOString(),
  };
  arenaResults.unshift(result);
  return structuredClone(result);
}

/** 查询 Mock 竞技历史，可按参赛 Agent 过滤。 */
export async function listMockArenas(
  agentId?: string,
): Promise<ArenaApiResult[]> {
  const results = agentId
    ? arenaResults.filter((result) => result.participant_ids.includes(agentId))
    : arenaResults;
  return structuredClone(results);
}

/** 按 ID 获取一条 Mock 竞技记录。 */
export async function getMockArena(id: string): Promise<ArenaApiResult> {
  const result = arenaResults.find((item) => item.id === id);
  if (!result) throw new Error(`Arena ${id} not found`);
  return structuredClone(result);
}

/** 从已保存的 Mock 记录生成结构化 Markdown 战报。 */
export async function getMockArenaReport(
  id: string,
): Promise<ArenaReportResponse> {
  const result = await getMockArena(id);
  const winner = result.participant_names[result.winner_id] ?? result.winner_id;
  const scoreLines = result.participant_ids
    .map((agentId) =>
      `- ${result.participant_names[agentId] ?? agentId}：${result.scores[agentId] ?? 0} 分`
    )
    .join("\n");
  const outcomeLines = result.mode === "battle_royale"
    ? buildMockBattlePath(result)
    : ["## 最终比分", scoreLines];
  return {
    arena_id: id,
    title: `${result.topic} · 竞技战报`,
    markdown: [
      `# ${result.topic} · 竞技战报`,
      "",
      `- 模式：${result.mode}`,
      `- 胜者：${winner}`,
      `- 阶段：${result.rounds}`,
      "",
      ...outcomeLines,
      "",
      "## 胜负关键",
      result.judge_reasoning,
    ].join("\n"),
  };
}

function buildMockBattlePath(result: ArenaApiResult): string[] {
  const rounds = new Map<number, ArenaApiResult["transcript"]>();
  result.transcript.forEach((entry) => {
    const entries = rounds.get(entry.round) ?? [];
    entries.push(entry);
    rounds.set(entry.round, entries);
  });
  const lines = ["## 淘汰路径"];
  [...rounds.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([round, entries]) => {
      const ranked = [...new Map(
        entries.map((entry) => [entry.speaker_id, entry]),
      ).values()].sort(
        (left, right) => (left.stage_rank ?? 999) - (right.stage_rank ?? 999),
      );
      const survivorCount = ranked.filter((entry) => entry.advanced).length;
      lines.push(`### 第 ${round} 阶段 · ${ranked.length} → ${survivorCount}`);
      ranked.forEach((entry) => {
        const status = entry.advanced
          ? (round === result.rounds ? "冠军" : "晋级")
          : "淘汰";
        const score = entry.stage_score == null
          ? "分数未保存"
          : `${entry.stage_score} 分`;
        lines.push(
          `- #${entry.stage_rank ?? "?"} ${entry.speaker}：`
          + `${score} · ${status}`,
        );
      });
      lines.push("");
    });
  return lines.slice(0, -1);
}

/** 重置竞技 Mock 仓库，供测试隔离使用。 */
export function resetMockArenas(): void {
  nextArenaId = 1;
  arenaResults = createSeedResults();
}

function presentationToApi(
  result: ReturnType<typeof buildMockArenaResult>,
  id: string,
): ArenaApiResult {
  return {
    id,
    mode: result.mode,
    winner_id: result.winner_id,
    scores: result.scores,
    score_breakdown: Object.fromEntries(
      Object.entries(result.score_breakdowns).map(([agentId, breakdown]) => [
        agentId,
        {
          argument_quality: breakdown.argument_quality,
          expression: breakdown.expression,
          adaptability: breakdown.adaptability,
          character_consistency: breakdown.character_consistency,
        },
      ]),
    ),
    judge_reasoning: result.judge_reasoning,
    transcript: result.transcript.map((entry, turn) => ({
      turn,
      round: entry.round,
      speaker_id: entry.speaker_id,
      speaker: entry.speaker_name,
      content: entry.content,
    })),
    topic: result.topic,
    rounds: result.rounds,
    participant_ids: result.participant_ids,
    participant_names: result.participant_names,
    created_at: result.created_at,
  };
}

function createSeedResults(): ArenaApiResult[] {
  const agentA = MOCK_AGENTS[0]!;
  const agentB = MOCK_AGENTS[1]!;
  return (["debate", "interview"] as const).map((mode, index) => {
    const presentation = buildMockArenaResult({
      agent_a_id: agentA.id,
      agent_b_id: agentB.id,
      mode,
      topic: mode === "debate" ? "AI 是否会改变大学教育？" : "校园创新项目负责人",
      rounds: 3,
    }, agentA, agentB);
    return presentationToApi(presentation, `mock-seed-${index + 1}`);
  });
}
