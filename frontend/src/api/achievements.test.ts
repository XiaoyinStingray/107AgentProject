import { describe, expect, it } from "vitest";
import { normalizeAchievementResponse } from "./achievements";

describe("normalizeAchievementResponse", () => {
  it("maps backend snake_case fields to frontend camelCase fields", () => {
    const response = normalizeAchievementResponse({
      achievements: [
        {
          id: "ach-1",
          emoji: "🎭",
          title: "造物主",
          description: "创建第一个 Agent",
          progress: 1,
          unlocked: true,
          unlocked_at: "2026-07-27T10:00:00Z",
        },
      ],
      summary: {
        total_agents: 3,
        total_simulations: 4,
        total_ticks: 43,
        total_narratives: 8,
      },
    });

    expect(response.summary).toEqual({
      totalAgents: 3,
      totalSimulations: 4,
      totalTicks: 43,
      totalNarratives: 8,
    });
    expect(response.achievements[0].unlockedAt).toBe(
      "2026-07-27T10:00:00Z",
    );
  });
});
