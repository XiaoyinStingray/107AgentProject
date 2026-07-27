/**
 * Achievement API hooks — React Query 封装。
 * Step 45: 从 Mock 切换到真实后端 GET /api/achievements。
 */

import { useQuery } from "@tanstack/react-query";
import { client } from "./client";
import { achievementKeys } from "./queryKeys";
import type { Achievement, AchievementSummary } from "../types/archive";

export type { Achievement, AchievementSummary };

export interface AchievementResponse {
  achievements: Achievement[];
  summary: AchievementSummary;
}

interface AchievementApiItem {
  id: string;
  emoji: string;
  title: string;
  description: string;
  progress: number;
  unlocked: boolean;
  unlocked_at?: string | null;
}

interface AchievementApiResponse {
  achievements: AchievementApiItem[];
  summary: {
    total_agents: number;
    total_simulations: number;
    total_ticks: number;
    total_narratives: number;
  };
}

/** 将后端 snake_case 响应转换为前端共享类型使用的 camelCase。 */
export function normalizeAchievementResponse(
  response: AchievementApiResponse,
): AchievementResponse {
  return {
    achievements: response.achievements.map((achievement) => ({
      id: achievement.id,
      emoji: achievement.emoji,
      title: achievement.title,
      description: achievement.description,
      progress: achievement.progress,
      unlocked: achievement.unlocked,
      unlockedAt: achievement.unlocked_at ?? undefined,
    })),
    summary: {
      totalAgents: response.summary.total_agents,
      totalSimulations: response.summary.total_simulations,
      totalTicks: response.summary.total_ticks,
      totalNarratives: response.summary.total_narratives,
    },
  };
}

/** 获取成就列表 + 摘要（真实后端计算） */
export function useAchievements() {
  return useQuery({
    queryKey: achievementKeys.all,
    queryFn: async () =>
      normalizeAchievementResponse(
        await client.get<AchievementApiResponse>("/achievements"),
      ),
    staleTime: 30_000,
  });
}
