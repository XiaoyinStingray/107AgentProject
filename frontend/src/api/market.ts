/**
 * Market API hooks — Agent Team 市场。
 * Step 56: 发布/浏览/下载/评分。
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import type { MarketItemSummary, MarketItemDetail, MarketCreate, TeamDownload } from "../types/market";

export const marketKeys = {
  all: ["market"] as const,
  detail: (id: string) => ["market", id] as const,
};

export function useMarketList() {
  return useQuery({
    queryKey: marketKeys.all,
    queryFn: () => client.get<MarketItemSummary[]>("/market"),
    staleTime: 10_000,
  });
}

export function useMarketItem(id: string | null) {
  return useQuery({
    queryKey: marketKeys.detail(id ?? ""),
    queryFn: () => client.get<MarketItemDetail>(`/market/${id}`),
    enabled: !!id,
  });
}

export function usePublishTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: MarketCreate) =>
      client.post<MarketItemSummary>("/market", req),
    onSuccess: () => qc.invalidateQueries({ queryKey: marketKeys.all }),
  });
}

export function useDownloadTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      client.post<TeamDownload>(`/market/${itemId}/download`),
    onSuccess: () => qc.invalidateQueries({ queryKey: marketKeys.all }),
  });
}

export function useRateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, score }: { itemId: string; score: number }) =>
      client.post<{ rating: number; rating_count: number }>(`/market/${itemId}/rate`, { score }),
    onSuccess: () => qc.invalidateQueries({ queryKey: marketKeys.all }),
  });
}
