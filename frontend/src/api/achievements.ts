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

/** 获取成就列表 + 摘要（真实后端计算） */
export function useAchievements() {
  return useQuery({
    queryKey: achievementKeys.all,
    queryFn: () => client.get<AchievementResponse>("/achievements"),
    staleTime: 30_000,
  });
}
