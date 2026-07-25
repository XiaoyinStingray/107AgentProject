import { beforeEach, describe, expect, it } from "vitest";
import {
  createMockAgent,
  listMockAgents,
  resetMockAgents,
} from "./agentApi";
import {
  getMockArena,
  getMockArenaReport,
  listMockArenas,
  resetMockArenas,
  runMockBattleRoyale,
  runMockDuel,
} from "./arenaApi";
import type { DuelArenaMode } from "../types/arena";


beforeEach(() => {
  resetMockAgents();
  resetMockArenas();
});

describe("Step 46 independent Arena Mock API", () => {
  it.each<DuelArenaMode>(["debate", "interview", "pitch"])(
    "runs and persists the %s mode without a backend",
    async (mode) => {
      const [agentA, agentB] = await listMockAgents();
      const result = await runMockDuel({
        agent_a_id: agentA!.id,
        agent_b_id: agentB!.id,
        mode,
        topic: " 校园创新项目 ",
        rounds: 3,
      });

      expect(result.mode).toBe(mode);
      expect(result.participant_ids).toEqual([agentA!.id, agentB!.id]);
      expect(result.transcript).toHaveLength(6);
      expect(await getMockArena(result.id)).toEqual(result);
      expect((await listMockArenas())[0]).toEqual(result);
    },
  );

  it("filters persisted history by participant", async () => {
    const [agentA, agentB, outsider] = await listMockAgents();
    const created = await runMockDuel({
      agent_a_id: agentA!.id,
      agent_b_id: agentB!.id,
      mode: "debate",
      topic: "筛选测试",
      rounds: 3,
    });

    expect(await listMockArenas(agentA!.id)).toContainEqual(created);
    expect(await listMockArenas(outsider!.id)).not.toContainEqual(created);
  });

  it("runs the 6 → 3 → 2 → 1 battle flow and creates a report", async () => {
    for (let index = 0; index < 3; index += 1) {
      await createMockAgent(`大乱斗补充角色 ${index + 1}`);
    }
    const agents = await listMockAgents();
    const participants = agents.slice(0, 6);
    const result = await runMockBattleRoyale({
      agent_ids: participants.map((agent) => agent.id),
      topic: "月球基地资源分配",
    });

    expect(result.mode).toBe("battle_royale");
    expect(result.rounds).toBe(3);
    expect(result.transcript).toHaveLength(11);
    expect(result.participant_ids).toHaveLength(6);
    expect(result.participant_ids).toContain(result.winner_id);
    expect(result.transcript.every(
      (entry) =>
        entry.stage_score != null
        && entry.stage_rank != null
        && entry.advanced != null,
    )).toBe(true);

    const report = await getMockArenaReport(result.id);
    expect(report.arena_id).toBe(result.id);
    expect(report.title).toContain("月球基地资源分配");
    expect(report.markdown).toContain("## 淘汰路径");
    expect(report.markdown).toContain("第 1 阶段 · 6 → 3");
    expect(report.markdown).toContain("第 3 阶段 · 2 → 1");
    expect(report.markdown).toContain(
      result.participant_names[result.winner_id],
    );
  });

  it("rejects invalid battle participant sets", async () => {
    const agents = await listMockAgents();
    await expect(
      runMockBattleRoyale({
        agent_ids: agents.map((agent) => agent.id),
        topic: "人数不足",
      }),
    ).rejects.toThrow("6–8");

    const duplicateIds = Array.from({ length: 6 }, () => agents[0]!.id);
    await expect(
      runMockBattleRoyale({
        agent_ids: duplicateIds,
        topic: "重复角色",
      }),
    ).rejects.toThrow("不能重复");
  });

  it("returns clear errors for missing agents and records", async () => {
    const [agentA] = await listMockAgents();
    await expect(
      runMockDuel({
        agent_a_id: agentA!.id,
        agent_b_id: "missing-agent",
        mode: "pitch",
        topic: "缺失 Agent",
        rounds: 1,
      }),
    ).rejects.toThrow("参赛 Agent 不存在");
    await expect(getMockArena("missing-arena")).rejects.toThrow(
      "Arena missing-arena not found",
    );
  });
});
