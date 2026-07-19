import { describe, expect, it } from "vitest";
import { MOCK_AGENTS } from "./agents";
import {
  ARENA_TOPICS,
  buildMockArenaResult,
  MOCK_ARENA_ROUNDS,
} from "./arena";
import type { ArenaConfig, ArenaMode } from "../types/arena";

const agentA = MOCK_AGENTS[0]!;
const agentB = MOCK_AGENTS[1]!;

function createConfig(overrides: Partial<ArenaConfig> = {}): ArenaConfig {
  return {
    agent_a_id: agentA.id,
    agent_b_id: agentB.id,
    mode: "debate",
    topic: "测试竞技主题",
    rounds: MOCK_ARENA_ROUNDS,
    ...overrides,
  };
}

describe("Step 22 buildMockArenaResult", () => {
  it.each<ArenaMode>(["debate", "interview", "pitch"])(
    "builds a complete deterministic %s result",
    (mode) => {
      const result = buildMockArenaResult(createConfig({ mode }), agentA, agentB);

      expect([agentA.id, agentB.id]).toContain(result.winner_id);
      expect(Object.keys(result.scores).sort()).toEqual(
        [agentA.id, agentB.id].sort(),
      );
      Object.values(result.scores).forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(40);
      });
      expect(Object.keys(result.score_breakdowns).sort()).toEqual(
        [agentA.id, agentB.id].sort(),
      );
      Object.entries(result.score_breakdowns).forEach(([agentId, breakdown]) => {
        expect(breakdown.total).toBe(result.scores[agentId]);
        expect(
          breakdown.argument_quality +
            breakdown.expression +
            breakdown.adaptability +
            breakdown.character_consistency,
        ).toBe(breakdown.total);
      });

      expect(result.transcript).toHaveLength(6);
      expect(result.transcript.map((entry) => entry.round)).toEqual([
        1, 1, 2, 2, 3, 3,
      ]);
      expect(
        result.transcript.filter((entry) => entry.speaker_id === agentA.id),
      ).toHaveLength(3);
      expect(
        result.transcript.filter((entry) => entry.speaker_id === agentB.id),
      ).toHaveLength(3);
      expect(result.transcript[0]?.speaker_name).toBe(agentA.name);
      expect(result.transcript[1]?.speaker_name).toBe(agentB.name);

      const renderedText = `${result.judge_reasoning} ${result.transcript
        .map((entry) => entry.content)
        .join(" ")}`;
      expect(renderedText).not.toMatch(/\{topic\}|\{agent_a\}|\{agent_b\}/);
      expect(result.judge_reasoning).toContain(agentA.name);
      expect(result.judge_reasoning).toContain(agentB.name);
    },
  );

  it.each<ArenaMode>(["debate", "interview", "pitch"])(
    "provides editable topic presets for %s",
    (mode) => {
      expect(ARENA_TOPICS[mode]).toHaveLength(3);
      expect(ARENA_TOPICS[mode].every((topic) => topic.trim().length > 0)).toBe(true);
    },
  );

  it("rejects the same Agent on both sides", () => {
    const config = createConfig({ agent_b_id: agentA.id });
    expect(() => buildMockArenaResult(config, agentA, agentA)).toThrow(
      "必须选择两个不同的 Agent",
    );
  });

  it("rejects config and Agent mismatches", () => {
    const config = createConfig({ agent_a_id: "unknown-agent" });
    expect(() => buildMockArenaResult(config, agentA, agentB)).toThrow(
      "竞技配置与所选 Agent 不一致",
    );
  });

  it.each(["", "   "])("rejects a blank topic: %j", (topic) => {
    expect(() =>
      buildMockArenaResult(createConfig({ topic }), agentA, agentB),
    ).toThrow("竞技主题不能为空");
  });

  it("rejects unsupported Mock round counts", () => {
    expect(() =>
      buildMockArenaResult(createConfig({ rounds: 2 }), agentA, agentB),
    ).toThrow(`仅支持 ${MOCK_ARENA_ROUNDS} 轮竞技`);
  });
});
