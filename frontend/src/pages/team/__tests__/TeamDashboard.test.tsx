/**
 * TeamDashboard 组件测试 — Step T1。
 * 覆盖: Team 创建表单渲染、Team 列表展示。
 */

import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import TeamDashboard from "../../TeamDashboard";
import type { TeamSummary } from "../../../types/team";

// ── Mock API hooks ─────────────────────────────────────

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

vi.mock("../../../api/agents", () => ({
  useAgents: () => ({ data: MOCK_AGENTS }),
}));

vi.mock("../../../api/teams", () => ({
  useTeams: () => ({ data: MOCK_TEAMS, isLoading: false }),
  useCreateTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTeam: () => ({ mutateAsync: vi.fn() }),
  useSuggestRoles: () => ({ mutateAsync: vi.fn(), isPending: false, isError: false }),
  useExecuteTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEvaluateTeam: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTeamPlan: () => ({ data: null }),
}));

vi.mock("../../../api/market", () => ({
  usePublishTeam: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../../api/worlds", () => ({
  usePauseWorld: () => ({ mutateAsync: vi.fn() }),
  useStartWorld: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("../../../hooks/useSSE", () => ({
  useSSE: () => ({ events: [], connected: false, disconnect: vi.fn(), clear: vi.fn() }),
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

  it("shows execute button for idle teams", () => {
    renderDashboard();
    // 使用 getByRole 精确匹配按钮，避免匹配到 "待执行" Badge
    const btn = screen.getByRole("button", { name: /执行/ });
    expect(btn).toBeInTheDocument();
  });
});
