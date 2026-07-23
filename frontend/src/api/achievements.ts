/**
 * Achievement API hooks — React Query 封装。
 * 后端暂无真实成就端点（P2 待 Step 45），当前返回 Mock 数据。
 */

import { useQuery } from "@tanstack/react-query";
import { achievementKeys } from "./queryKeys";
import { MOCK_ACHIEVEMENTS, MOCK_ACHIEVEMENT_SUMMARY } from "../mocks/archive";
import type { Achievement, AchievementSummary } from "../types/archive";

export type { Achievement, AchievementSummary };

/** 获取成就列表 + 摘要（当前为 Mock，Step 45 切后端） */
export function useAchievements() {
  return useQuery({
    queryKey: achievementKeys.all,
    queryFn: async () => ({
      achievements: MOCK_ACHIEVEMENTS,
      summary: MOCK_ACHIEVEMENT_SUMMARY,
    }),
    staleTime: Infinity, // Mock 数据永不过期
  });
}
