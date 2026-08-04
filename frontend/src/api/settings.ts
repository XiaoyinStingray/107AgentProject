/**
 * Step 103: 用户可调参数 API hooks。
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";

export interface UserSettingsData {
  temperature_think: number;
  temperature_act: number;
  randomness_pct: number;
  proactive_chat_interval_min: number;
  idle_pause_minutes: number;
  emotion_decay_seconds: number;
  worker_max_steps: number;
  worker_max_revisions: number;
  worker_timeout_minutes: number;
}

export type SettingsUpdateInput = Partial<UserSettingsData>;

export const SETTINGS_KEY = ["settings"] as const;

/** 获取当前用户参数 */
export function useSettings() {
  return useQuery<UserSettingsData>({
    queryKey: SETTINGS_KEY,
    queryFn: () => client.get<UserSettingsData>("/settings"),
    staleTime: 60_000, // 1 分钟内不重复请求
  });
}

/** 更新用户参数（部分或全部） */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsUpdateInput) =>
      client.put<UserSettingsData>("/settings", input),
    onSuccess: (data) => {
      qc.setQueryData(SETTINGS_KEY, data);
    },
  });
}

/** 恢复默认值 */
export function useResetSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post<UserSettingsData>("/settings/reset"),
    onSuccess: (data) => {
      qc.setQueryData(SETTINGS_KEY, data);
    },
  });
}
