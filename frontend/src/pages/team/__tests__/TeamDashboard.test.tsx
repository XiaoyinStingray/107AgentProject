/**
 * TeamDashboard 组件测试 — Step T1。
 * 覆盖: Team 创建表单渲染、Team 列表、执行、报告、评估与下载。
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TeamDashboard from "../../TeamDashboard";
import type { TeamPlan, TeamSummary } from "../../../types/team";

// ── Mock API hooks ─────────────────────────────────────

const hookState = vi.hoisted(() => ({
  execute: vi.fn(),
  evaluate: vi.fn(),
  clear: vi.fn(),
  disconnect: vi.fn(),
  pause: vi.fn(),
  start: vi.fn(),
  plan: null as TeamPlan | null,
  events: [] as Array<Record<string, unknown>>,
}));

const MOCK_AGENTS = [
  { id: "a1", name: "小红", persona: { mbti: "ENFP" } },
  { id: "a2", name: "小明", persona: { mbti: "ISTJ" } },
];

const MOCK_TEAMS: TeamSummary[] = [
  {
    id: "t1",
    name: "产品团队",
    description: "设计校园App",
    agent_ids: ["a1", "a2"],
    roles: [{ agent_id: "a1", role: "产品经理", reason: "ENFP" }],
    status: "idle",
    created_at: "2026-01-01T00:00:00Z",
  },
];

const MOCK_PLAN: TeamPlan = {
  id: "p1",
  team_id: "t1",
  task: "设计校园App",
  steps: [
    {
      id: "s1",
      title: "输出方案",
      assignee: "a1",
      description: "整理产品方案",
      status: "done",
      progress: 1,
      depends_on: [],
    },
  ],
  status: "finished",
  world_id: "w1",
  created_at: "2026-01-01T00:00:00Z",
  progress_pct: 1,
  report: {
    title: "团队任务完成报告",
    content: "完成校园应用原型与风险清单。",
  },
};

vi.mock("../../../api/agents", () => ({
  useAgents: () => ({ data: MOCK_AGENTS }),
}));

vi.mock("../../../api/teams", () => ({
  useTeams: () => ({ data: MOCK_TEAMS, isLoading: false }),
  useCreateTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTeam: () => ({ mutateAsync: vi.fn() }),
  useSuggestRoles: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useExecuteTeam: () => ({ mutateAsync: hookState.execute, isPending: false }),
  useEvaluateTeam: () => ({ mutateAsync: hookState.evaluate, isPending: false }),
  useTeamPlan: () => ({ data: hookState.plan }),
  useTeamHistory: () => ({ data: [], isLoading: false }),
  useLearningCurve: () => ({ data: null }),
  useScoreTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../../../api/market", () => ({
  usePublishTeam: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../../api/worlds", () => ({
  usePauseWorld: () => ({ mutateAsync: hookState.pause }),
  useStartWorld: () => ({ mutateAsync: hookState.start }),
}));

vi.mock("../../../hooks/useSSE", () => ({
  useSSE: () => ({
    events: hookState.events,
    connected: false,
    disconnect: hookState.disconnect,
    clear: hookState.clear,
  }),
}));

vi.mock("../../../hooks/useTeamSSE", () => ({
  useTeamSSE: () => ({
    connected: false,
    isRunning: false,
    isDone: false,
    error: null,
  }),
}));

// ── Helper ─────────────────────────────────────────────

function renderDashboard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TeamDashboard />
    </QueryClientProvider>
  );
}

// =====================================================================
// Tests
// =====================================================================

describe("TeamDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MOCK_TEAMS[0].status = "idle";
    MOCK_TEAMS[0].outcome = "pending";
    MOCK_TEAMS[0].failed_steps = 0;
    hookState.plan = null;
    hookState.events = [];
    hookState.execute.mockResolvedValue(MOCK_PLAN);
    hookState.evaluate.mockResolvedValue({ evaluation: "协作质量：9/10" });
    hookState.pause.mockResolvedValue({});
    hookState.start.mockResolvedValue({});
  });

  it("renders page title", () => {
    renderDashboard();
    expect(screen.getByText("M9 Agent Team")).toBeInTheDocument();
  });

  it("renders team list", () => {
    renderDashboard();
    expect(screen.getByText("产品团队")).toBeInTheDocument();
    expect(screen.getByText("设计校园App")).toBeInTheDocument();
  });

  it("shows team member names", () => {
    renderDashboard();
    // Agent names should be resolved from the agents list
    expect(screen.getByText(/小红/)).toBeInTheDocument();
  });

  it("shows create button", () => {
    renderDashboard();
    expect(screen.getByText("+ 新建 Team")).toBeInTheDocument();
  });

  it("shows team template button", () => {
    renderDashboard();
    expect(screen.getByText(/Team 模板/)).toBeInTheDocument();
  });

  it("shows idle status badge", () => {
    renderDashboard();
    expect(screen.getByText("待执行")).toBeInTheDocument();
  });

  it("shows partial completion instead of completed when a step failed", () => {
    MOCK_TEAMS[0].status = "finished";
    MOCK_TEAMS[0].outcome = "partial";
    MOCK_TEAMS[0].failed_steps = 1;

    renderDashboard();

    expect(screen.getByText("部分完成（1 步失败）")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /部分完成.*查看/ })).toBeInTheDocument();
  });

  it("shows execute button for idle teams", () => {
    renderDashboard();
    // 使用 getByRole 精确匹配按钮，避免匹配到 "待执行" Badge
    const btn = screen.getByRole("button", { name: /执行/ });
    expect(btn).toBeInTheDocument();
  });

  it("executes a team and enters the live dashboard", async () => {
    hookState.plan = MOCK_PLAN;
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: /执行/ }));

    await waitFor(() => {
      expect(hookState.execute).toHaveBeenCalledWith("t1");
    });
    expect(await screen.findByRole("button", { name: /返回列表/ })).toBeInTheDocument();
    expect(screen.getByText("完成校园应用原型与风险清单。")).toBeInTheDocument();
  });

  it("evaluates a completed team and displays the result", async () => {
    hookState.plan = MOCK_PLAN;
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /执行/ }));

    fireEvent.click(await screen.findByRole("button", { name: /评估团队/ }));

    await waitFor(() => {
      expect(hookState.evaluate).toHaveBeenCalledWith("t1");
    });
    expect(await screen.findByText("协作质量：9/10")).toBeInTheDocument();
  });

  it("downloads the persisted report as markdown", async () => {
    const createObjectURL = vi.fn(() => "blob:team-report");
    const revokeObjectURL = vi.fn();
    let clickedAnchor: HTMLAnchorElement | null = null;
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedAnchor = this;
        expect(this.isConnected).toBe(true);
      });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    hookState.plan = MOCK_PLAN;
    renderDashboard();
    fireEvent.click(screen.getByRole("button", { name: /执行/ }));

    fireEvent.click(await screen.findByRole("button", { name: /下载/ }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(clickedAnchor).not.toBeNull();
    expect(document.body.contains(clickedAnchor)).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:team-report");
    });
    anchorClick.mockRestore();
  });

  it("shows an execute failure instead of failing silently", async () => {
    hookState.execute.mockRejectedValueOnce(new Error("执行失败：后端不可用"));
    renderDashboard();

    fireEvent.click(screen.getByRole("button", { name: /执行/ }));

    expect(await screen.findByText("执行失败：后端不可用")).toBeInTheDocument();
  });
});
