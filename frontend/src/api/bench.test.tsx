/**
 * Bench Query hooks 回归测试 — State 3 T4。
 * 验证列表仅在存在运行中任务时轮询。
 */

import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBenchRuns } from "./bench";
import type { BenchRunSummary } from "../types/bench";

const getMock = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  client: {
    get: getMock,
  },
}));

const RUNNING_RUN: BenchRunSummary = {
  id: "run-running",
  name: "运行中评测",
  llm_model: "deepseek-v4-flash",
  status: "running",
  total_tasks: 27,
  completed_tasks: 1,
  scores: null,
  report: null,
  created_at: "2026-07-29T00:00:00Z",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("useBenchRuns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    getMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not poll when no run is active", async () => {
    getMock.mockResolvedValue([]);
    renderHook(() => useBenchRuns(), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });

    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("polls every three seconds while a run is active", async () => {
    getMock.mockResolvedValue([RUNNING_RUN]);
    renderHook(() => useBenchRuns(), { wrapper: createWrapper() });
    await vi.waitFor(() => expect(getMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_100);
    });

    await vi.waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
  });
});
