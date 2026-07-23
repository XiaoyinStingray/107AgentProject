import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "../App";
import { MOCK_AGENTS } from "../mocks/agents";
import { ARENA_MODE_OPTIONS } from "../mocks/arena";
import Arena from "./Arena";
import type { AgentResponse } from "../types/agent";

// --- Arena 测试用 Agent 数据控制 ---
let testAgents: AgentResponse[] = [];

vi.mock("../api/agents", () => ({
  useAgents: () => ({ data: testAgents }),
  useAgent: () => ({ data: null }),
  useCreateAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAgent: () => ({ mutateAsync: vi.fn() }),
}));

// Step 34b: Mock useRunDebate — real API path, returns mock data
const { arenaMockResult } = vi.hoisted(() => ({
  arenaMockResult: {
    id: "arena-debate-test",
    mode: "debate",
    winner_id: "mock-1",
    scores: { mock_1: 32, mock_2: 28 },
    judge_reasoning: "正方论点更有说服力",
    transcript: [
      { turn: 0, speaker: "agent_1", content: "我认为稳定比风险更重要。" },
      { turn: 1, speaker: "agent_2", content: "年轻人不承担风险就没有未来。" },
    ],
    topic: "测试辩题",
    rounds: 3,
    created_at: "2026-07-22T00:00:00",
  },
}));

vi.mock("../api/arenas", () => ({
  useRunDebate: () => ({
    mutateAsync: () => Promise.resolve(arenaMockResult),
    isPending: false,
  }),
  useArenaResult: () => ({ data: null }),
  useArenas: () => ({ data: [] }),
  adaptArenaResult: (
    api: typeof arenaMockResult,
    a: { id: string; name: string },
    b: { id: string; name: string },
  ) => ({
    winner_id: api.winner_id,
    scores: api.scores,
    judge_reasoning: api.judge_reasoning,
    transcript: (api.transcript || []).map((t, i) => ({
      id: `t-${i}`,
      round: Math.floor(t.turn / 2) + 1,
      speaker_id: t.speaker === "agent_1" ? a.id : b.id,
      speaker_name: t.speaker === "agent_1" ? a.name : b.name,
      content: t.content,
    })),
    score_breakdowns: {
      [a.id]: { argument_quality: 8, expression: 8, adaptability: 8, character_consistency: 8, total: 32 },
      [b.id]: { argument_quality: 7, expression: 7, adaptability: 7, character_consistency: 7, total: 28 },
    },
  }),
}));

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderApp() {
  return render(
    <QueryClientProvider client={testQueryClient}>
      <App />
    </QueryClientProvider>,
  );
}

const TRANSCRIPT_INTERVAL_MS = 800;
const JUDGE_DELAY_MS = 1200;

function renderArena(initialEntry = "/arena") {
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Arena />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderArenaWithNavigation(initialEntry = "/arena") {
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Link to="/arena#item-23">前往大乱斗</Link>
        <Link to="/arena#item-22">返回 1v1</Link>
        <Arena />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function advanceMatchToResult() {
  for (let index = 0; index < 7; index += 1) {
    act(() => vi.advanceTimersByTime(TRANSCRIPT_INTERVAL_MS));
  }
  act(() => vi.advanceTimersByTime(JUDGE_DELAY_MS));
}

beforeEach(() => {
  // jsdom polyfill — recharts 依赖 ResizeObserver
  if (typeof ResizeObserver === "undefined") {
    (window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  testAgents = [...MOCK_AGENTS];
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Step 22 Arena page state", () => {
  it("renders valid defaults and keeps mode and topic controlled", () => {
    renderArena();

    expect(
      screen.getByRole("heading", { name: "1v1 Agent 对抗" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("AGENT A")).toHaveValue(MOCK_AGENTS[0]!.id);
    expect(screen.getByLabelText("AGENT B")).toHaveValue(MOCK_AGENTS[1]!.id);
    expect(
      screen.getByRole("button", { name: "开始 1v1 竞技" }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /面试竞争/ }));
    const interview = ARENA_MODE_OPTIONS.find(
      (option) => option.value === "interview",
    )!;
    expect(screen.getByLabelText("竞技主题")).toHaveValue(
      interview.default_topic,
    );

    fireEvent.change(screen.getByLabelText("竞技主题"), {
      target: { value: "   " },
    });
    expect(
      screen.getByRole("button", { name: "开始 1v1 竞技" }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText("竞技主题"), {
      target: { value: "定制面试主题" },
    });
    expect(
      screen.getByRole("button", { name: "开始 1v1 竞技" }),
    ).toBeEnabled();
  });

  it("includes Agents from useAgents hook", () => {
    const createdAgent = {
      ...MOCK_AGENTS[0]!,
      id: "created-arena-agent",
      name: "竞技新人",
      persona: {
        ...MOCK_AGENTS[0]!.persona,
        name: "竞技新人",
      },
    };
    // Arena 至少需要 2 个 Agent，加上第二个保证不走 empty state
    testAgents = [createdAgent, MOCK_AGENTS[1]!];

    renderArena();
    expect(
      screen.getAllByRole("option", { name: /竞技新人/ }),
    ).toHaveLength(2);
  });

  it("runs debate via API and transitions away from setup", async () => {
    renderArena();

    // verify we start on setup
    expect(screen.getByRole("heading", { name: "1v1 Agent 对抗" })).toBeInTheDocument();

    // debate → 真实 API 路径，mocked mutation 立即返回
    fireEvent.click(screen.getByRole("button", { name: "开始 1v1 竞技" }));

    // setup heading should disappear after phase transition
    await waitFor(() => {
      expect(
        screen.queryByRole("heading", { name: "1v1 Agent 对抗" }),
      ).not.toBeInTheDocument();
    });

    // the result panel should be visible
    expect(screen.getByText("裁判理由")).toBeInTheDocument();
  });

  it.each([
    ["面试竞争", "interview", MOCK_AGENTS[1]!.name, "32", "36"],
    ["创业路演", "pitch", MOCK_AGENTS[0]!.name, "37", "34"],
  ])(
    "completes the %s UI flow with its own result",
    (buttonName, mode, winnerName, agentAScore, agentBScore) => {
      vi.useFakeTimers();
      renderArena();

      fireEvent.click(screen.getByRole("button", { name: new RegExp(buttonName) }));
      const option = ARENA_MODE_OPTIONS.find((item) => item.value === mode)!;
      expect(screen.getByLabelText("竞技主题")).toHaveValue(option.default_topic);
      fireEvent.click(screen.getByRole("button", { name: "开始 1v1 竞技" }));
      advanceMatchToResult();

      expect(screen.getByText(`胜者 · ${winnerName}`)).toBeInTheDocument();
      expect(screen.getByText(agentAScore)).toBeInTheDocument();
      expect(screen.getByText(agentBScore)).toBeInTheDocument();
    },
  );
});

describe("Step 22 Arena hash behavior", () => {
  it.each([
    [23, "大乱斗", "P3"],
    [24, "战报生成", "P2"],
    [25, "盲测模式", "P3"],
    [26, "复盘对比", "P2"],
    [27, "排行榜", "P3"],
    [28, "A/B 测试", "P3"],
  ])("keeps item-%i as the %s %s placeholder", (id, label, priority) => {
    renderArena(`/arena#item-${id}`);
    expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${priority} —`))).toBeInTheDocument();
    expect(
      screen.getByText("当前保留菜单入口，不在 Step 22 实现真实逻辑。"),
    ).toBeInTheDocument();
  });

  it("cleans a running match when navigating away from item-22", () => {
    vi.useFakeTimers();
    renderArenaWithNavigation();

    // 切换到 interview 模式（保留 Mock 动画），启动后应进入 running 状态
    fireEvent.click(screen.getByRole("button", { name: /面试竞争/ }));
    fireEvent.click(screen.getByRole("button", { name: "开始 1v1 竞技" }));
    act(() => vi.advanceTimersByTime(TRANSCRIPT_INTERVAL_MS));
    expect(screen.getByText("1 条发言")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "前往大乱斗" }));
    expect(
      screen.getByRole("heading", { name: /大乱斗/ }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(TRANSCRIPT_INTERVAL_MS * 10));
    expect(screen.queryByText(/胜者 ·/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "返回 1v1" }));
    expect(
      screen.getByRole("heading", { name: "1v1 Agent 对抗" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("1 条发言")).not.toBeInTheDocument();
  });

  it("does not display a different module for a foreign hash", () => {
    renderArena("/arena#item-29");
    expect(screen.getByText("竞技场功能不存在")).toBeInTheDocument();
    expect(screen.queryByText("小说化叙事")).not.toBeInTheDocument();
  });
});

describe("Step 16 Arena route regression", () => {
  it.each([
    ["/", "人生实验室 · Life Lab"],
    ["/agents", "M1 铸造厂"],
    ["/theater", "M2 单人剧场"],
    ["/sandbox", "群体投放"],
    ["/narratives", "M5 叙事工厂"],
  ])("keeps the existing %s route mounted", (path, heading) => {
    window.history.pushState({}, "", path);
    renderApp();
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("mounts the Step 22 page through App at /arena", () => {
    window.history.pushState({}, "", "/arena#item-22");
    renderApp();
    expect(
      screen.getByRole("heading", { name: "1v1 Agent 对抗" }),
    ).toBeInTheDocument();
  });
});
