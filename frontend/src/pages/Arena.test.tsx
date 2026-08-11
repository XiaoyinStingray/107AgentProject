import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MOCK_AGENTS } from "../mocks/agents";
import Arena from "./Arena";
import type { AgentResponse } from "../types/agent";
import type { ArenaApiResult } from "../types/arena";


let testAgents: AgentResponse[] = [];
const runDuelMutate = vi.fn();

const arenaResult: ArenaApiResult = {
  id: "arena-test",
  mode: "debate",
  winner_id: MOCK_AGENTS[0]!.id,
  scores: {
    [MOCK_AGENTS[0]!.id]: 34,
    [MOCK_AGENTS[1]!.id]: 30,
  },
  score_breakdown: {
    [MOCK_AGENTS[0]!.id]: {
      argument_quality: 9,
      expression: 9,
      adaptability: 8,
      character_consistency: 8,
    },
    [MOCK_AGENTS[1]!.id]: {
      argument_quality: 8,
      expression: 8,
      adaptability: 7,
      character_consistency: 7,
    },
  },
  judge_reasoning: "A 的内容和回应更完整。",
  transcript: [
    {
      turn: 0,
      round: 1,
      speaker_id: MOCK_AGENTS[0]!.id,
      speaker: MOCK_AGENTS[0]!.name,
      content: "A 的发言",
    },
    {
      turn: 1,
      round: 1,
      speaker_id: MOCK_AGENTS[1]!.id,
      speaker: MOCK_AGENTS[1]!.name,
      content: "B 的发言",
    },
  ],
  topic: "测试主题",
  rounds: 3,
  participant_ids: [MOCK_AGENTS[0]!.id, MOCK_AGENTS[1]!.id],
  participant_names: {
    [MOCK_AGENTS[0]!.id]: MOCK_AGENTS[0]!.name,
    [MOCK_AGENTS[1]!.id]: MOCK_AGENTS[1]!.name,
  },
  created_at: "2026-07-25T00:00:00Z",
};

vi.mock("../api/agents", () => ({
  useAgents: () => ({ data: testAgents }),
}));

vi.mock("../api/arenas", async () => {
  const actual = await vi.importActual<typeof import("../api/arenas")>(
    "../api/arenas",
  );
  return {
    ...actual,
    useRunDuel: () => ({
      mutateAsync: runDuelMutate,
      isPending: false,
      reset: vi.fn(),
    }),
    useRunBattleRoyale: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
      reset: vi.fn(),
    }),
    useArenas: () => ({
      data: [arenaResult, { ...arenaResult, id: "arena-test-2" }],
      isLoading: false,
      error: null,
    }),
    useArenaReport: () => ({
      data: {
        arena_id: arenaResult.id,
        title: "测试战报",
        markdown: "# 测试战报",
      },
      isLoading: false,
      error: null,
    }),
  };
});

vi.mock("../constants/arena", async () => {
  const actual = await vi.importActual<typeof import("../constants/arena")>(
    "../constants/arena",
  );
  return {
    ...actual,
    ARENA_REPLAY_INTERVAL_MS: 10,
    ARENA_JUDGE_REPLAY_MS: 100,
  };
});

function renderArena(initialEntry = "/arena") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const createTree = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Arena />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(createTree());
  return {
    ...view,
    rerenderArena: () => view.rerender(createTree()),
  };
}

beforeEach(() => {
  testAgents = [...MOCK_AGENTS];
  runDuelMutate.mockReset();
  runDuelMutate.mockResolvedValue(arenaResult);
});

describe("Step 46 DuelArena", () => {
  it("initializes distinct Agent selections after asynchronous loading", async () => {
    testAgents = [];
    const view = renderArena();
    expect(screen.getByText("至少需要两个 Agent")).toBeInTheDocument();

    testAgents = [...MOCK_AGENTS];
    view.rerenderArena();

    expect(await screen.findByLabelText("AGENT A")).toHaveValue(
      MOCK_AGENTS[0]!.id,
    );
    expect(screen.getByLabelText("AGENT B")).toHaveValue(MOCK_AGENTS[1]!.id);
  });

  it.each([
    ["辩论赛", "debate"],
    ["面试竞争", "interview"],
    ["创业路演", "pitch"],
  ])("runs %s through the unified API", async (buttonName, mode) => {
    renderArena();
    if (mode !== "debate") {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(buttonName) }));
    }
    fireEvent.click(screen.getByRole("button", { name: "开始 1v1 竞技" }));

    await waitFor(() => expect(runDuelMutate).toHaveBeenCalledOnce());
    expect(runDuelMutate.mock.calls[0]?.[0].mode).toBe(mode);
    expect(
      await screen.findByText(
        "比赛已在后台完成，正在逐条呈现记录；此处不是实时生成。",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText("A 的发言")).toBeInTheDocument();
    expect(
      await screen.findByText("正在呈现裁判四项评分汇总…"),
    ).toBeInTheDocument();
    expect(await screen.findByText(/胜者 ·/)).toBeInTheDocument();
    expect(screen.getByText("A 的内容和回应更完整。")).toBeInTheDocument();
  });

  it("keeps the start button disabled for a blank topic", () => {
    renderArena();
    fireEvent.change(screen.getByLabelText("竞技主题"), {
      target: { value: "   " },
    });
    expect(
      screen.getByRole("button", { name: "开始 1v1 竞技" }),
    ).toBeDisabled();
  });
});

describe("Step 46 Arena hash routing", () => {
  it.each([
    [23, "Agent 大乱斗"],
    [24, "竞技战报"],
    [26, "竞技复盘对比"],
  ])("renders item-%i as %s", async (itemId, heading) => {
    renderArena(`/arena#item-${itemId}`);
    expect(
      await screen.findByRole("heading", { name: heading }),
    ).toBeInTheDocument();
  });

  it.each([
    [25, "盲测模式"],
    [27, "竞技场排行榜"],
  ])("renders item-%i as %s page", async (itemId, heading) => {
    renderArena(`/arena#item-${itemId}`);
    expect(
      await screen.findByRole("heading", { name: heading }),
    ).toBeInTheDocument();
  });

  it("renders item-28 (A/B 测试) with agent requirement notice", () => {
    renderArena("/arena#item-28");
    expect(screen.getByText("至少需要四个 Agent")).toBeInTheDocument();
  });

  it("rejects a foreign feature hash", () => {
    renderArena("/arena#item-29");
    expect(screen.getByText("竞技场功能不存在")).toBeInTheDocument();
  });
});
