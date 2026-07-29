/**
 * BenchLab 页面回归测试 — State 3 T4。
 * 覆盖运行态保护、评测启动、轮询与盲测交互。
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BenchLab from "../../BenchLab";
import type { BenchRunDetail, BenchRunSummary } from "../../../types/bench";

const hookState = vi.hoisted(() => ({
  runs: [] as BenchRunSummary[],
  details: {} as Record<string, BenchRunDetail>,
  createRun: vi.fn(),
  deleteRun: vi.fn(),
}));

vi.mock("../../../api/bench", () => ({
  useBenchRuns: () => ({ data: hookState.runs }),
  useBenchRun: (id: string | null) => ({
    data: id ? hookState.details[id] : undefined,
  }),
  useCreateBenchRun: () => ({
    mutateAsync: hookState.createRun,
    isPending: false,
  }),
  useDeleteBenchRun: () => ({
    mutate: hookState.deleteRun,
    isPending: false,
  }),
}));

const RUNNING_RUN: BenchRunSummary = {
  id: "run-running",
  name: "运行中评测",
  llm_model: "deepseek-v4-flash",
  status: "running",
  total_tasks: 27,
  completed_tasks: 3,
  scores: null,
  report: null,
  created_at: "2026-07-29T00:00:00Z",
};

function completedRun(
  id: string,
  name: string,
  score: number,
  createdAt: string,
  model = "deepseek-v4-flash",
): BenchRunSummary {
  return {
    id,
    name,
    llm_model: model,
    status: "done",
    total_tasks: 27,
    completed_tasks: 27,
    scores: {
      "人格一致性": score,
      "决策质量": score,
      "交互深度": score,
      "鲁棒性": score,
      "创造力": score,
      "适应性": score,
    },
    report: `${name} 报告`,
    created_at: createdAt,
  };
}

function detailFor(run: BenchRunSummary): BenchRunDetail {
  return {
    ...run,
    results: [],
  };
}

describe("BenchLab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookState.runs = [];
    hookState.details = {};
    hookState.createRun.mockResolvedValue({
      id: "run-created",
      status: "running",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("disables deletion while a bench run is active", () => {
    hookState.runs = [RUNNING_RUN];

    render(<BenchLab />);

    const deleteButton = screen.getByRole("button", { name: "删除" });
    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute("title", "运行中的评测不可删除");
    expect(hookState.deleteRun).not.toHaveBeenCalled();
  });

  it("shows an API connection failure without creating a run", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: false, error: "认证失败" }),
    }));
    render(<BenchLab />);
    fireEvent.change(screen.getByPlaceholderText("API Key"), {
      target: { value: "sk-invalid" },
    });

    fireEvent.click(screen.getByRole("button", { name: "▶ 开始评测" }));

    expect(await screen.findByText("API 连接失败: 认证失败")).toBeInTheDocument();
    expect(hookState.createRun).not.toHaveBeenCalled();
  });

  it("starts a run and clears the API key from the form", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, elapsed: 0.2, response: "OK" }),
    }));
    render(<BenchLab />);
    const apiKeyInput = screen.getByPlaceholderText("API Key");
    fireEvent.change(apiKeyInput, { target: { value: "sk-secret" } });

    fireEvent.click(screen.getByRole("button", { name: "▶ 开始评测" }));

    await waitFor(() => {
      expect(hookState.createRun).toHaveBeenCalledWith({
        api_key: "sk-secret",
        base_url: "https://api.deepseek.com",
        model: "deepseek-v4-flash",
        name: "deepseek-v4-flash 评测",
      });
    });
    expect(apiKeyInput).toHaveValue("");
    expect(await screen.findByText("评测已启动，后台运行中…")).toBeInTheDocument();
  });

  it("hides model identity until blind comparison is revealed", async () => {
    const runA = completedRun("run-a", "模型甲", 80, "2026-07-27T00:00:00Z");
    const runB = completedRun("run-b", "模型乙", 60, "2026-07-28T00:00:00Z");
    hookState.runs = [runA, runB];
    hookState.details = {
      [runA.id]: detailFor(runA),
      [runB.id]: detailFor(runB),
    };
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    render(<BenchLab />);

    fireEvent.click(screen.getByRole("button", { name: /盲测对比/ }));

    expect(await screen.findByText("盲测中——身份已隐藏")).toBeInTheDocument();
    expect(screen.getAllByText("Model X").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Model Y").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "🔓 揭盲" }));
    expect(await screen.findByText(/已揭盲：X = 模型甲 · Y = 模型乙/)).toBeInTheDocument();
  });

  it("shows a degradation warning after three consecutive declines", () => {
    hookState.runs = [
      completedRun("run-1", "第一次", 90, "2026-07-27T00:00:00Z"),
      completedRun("run-2", "第二次", 70, "2026-07-28T00:00:00Z"),
      completedRun("run-3", "第三次", 50, "2026-07-29T00:00:00Z"),
    ];

    render(<BenchLab />);

    expect(screen.getByText("⚠️ 综合连续下降，可能退化")).toBeInTheDocument();
    expect(screen.getByText("🏆 排行榜")).toBeInTheDocument();
  });

  it("sorts and filters the leaderboard", () => {
    hookState.runs = [
      completedRun(
        "run-low",
        "低分模型",
        40,
        "2026-07-27T00:00:00Z",
        "model-a",
      ),
      completedRun(
        "run-high",
        "高分模型",
        90,
        "2026-07-28T00:00:00Z",
        "model-b",
      ),
    ];
    render(<BenchLab />);
    const leaderboard = screen.getByText("🏆 排行榜").parentElement;
    expect(leaderboard).not.toBeNull();

    fireEvent.change(screen.getByDisplayValue("综合分"), {
      target: { value: "人格一致性" },
    });
    let rows = within(leaderboard as HTMLElement).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("高分模型");

    fireEvent.change(screen.getByDisplayValue("全部模型"), {
      target: { value: "model-a" },
    });
    rows = within(leaderboard as HTMLElement).getAllByRole("row");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toHaveTextContent("低分模型");
    expect(rows[1]).not.toHaveTextContent("高分模型");
  });
});
