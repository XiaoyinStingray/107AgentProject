import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_AGENTS } from "../../mocks/agents";
import BattleRoyaleArena from "./BattleRoyaleArena";
import ArenaComparisonView from "./ArenaComparisonView";
import ArenaReportView from "./ArenaReportView";
import type { AgentResponse } from "../../types/agent";
import type { ArenaApiResult, ArenaReportResponse } from "../../types/arena";


let agentRows: AgentResponse[] = [];
let arenaRows: ArenaApiResult[] = [];
let reportData: ArenaReportResponse | undefined;
const runBattleMutate = vi.fn();
const runBattleReset = vi.fn();
const arenasFilterSpy = vi.fn();

vi.mock("../../api/agents", () => ({
  useAgents: () => ({ data: agentRows }),
}));

vi.mock("../../api/arenas", async () => {
  const actual = await vi.importActual<typeof import("../../api/arenas")>(
    "../../api/arenas",
  );
  return {
    ...actual,
    useRunBattleRoyale: () => ({
      mutateAsync: runBattleMutate,
      isPending: false,
      reset: runBattleReset,
    }),
    useArenas: (agentId?: string) => {
      arenasFilterSpy(agentId);
      return { data: arenaRows, isLoading: false, error: null };
    },
    useArenaReport: (arenaId: string | null) => ({
      data: arenaId ? reportData : undefined,
      isLoading: false,
      error: null,
    }),
  };
});

function makeAgents(count: number): AgentResponse[] {
  return Array.from({ length: count }, (_, index) => {
    const base = structuredClone(MOCK_AGENTS[index % MOCK_AGENTS.length]!);
    const name = `测试 Agent ${index + 1}`;
    return {
      ...base,
      id: `test-agent-${index + 1}`,
      name,
      persona: { ...base.persona, name },
    };
  });
}

function makeResult(id: string, topic: string, winnerIndex = 0): ArenaApiResult {
  const participants = agentRows.slice(0, 2);
  const [agentA, agentB] = participants;
  return {
    id,
    mode: "debate",
    winner_id: participants[winnerIndex]!.id,
    scores: { [agentA!.id]: 35, [agentB!.id]: 29 },
    score_breakdown: {
      [agentA!.id]: {
        argument_quality: 9,
        expression: 9,
        adaptability: 8,
        character_consistency: 9,
      },
      [agentB!.id]: {
        argument_quality: 8,
        expression: 7,
        adaptability: 7,
        character_consistency: 7,
      },
    },
    judge_reasoning: `${topic} 的裁判结论`,
    transcript: [{
      turn: 0,
      round: 1,
      speaker_id: agentA!.id,
      speaker: agentA!.name,
      content: `${topic} 的关键发言`,
    }],
    topic,
    rounds: 3,
    participant_ids: participants.map((agent) => agent.id),
    participant_names: Object.fromEntries(
      participants.map((agent) => [agent.id, agent.name]),
    ),
    created_at: "2026-07-25T00:00:00Z",
  };
}

beforeEach(() => {
  agentRows = makeAgents(8);
  arenaRows = [];
  reportData = undefined;
  runBattleMutate.mockReset();
  runBattleReset.mockReset();
  arenasFilterSpy.mockClear();
});

describe("Step 46 battle royale view", () => {
  it("requires at least six available Agents", () => {
    agentRows = makeAgents(5);
    render(<BattleRoyaleArena />);
    expect(screen.getByText("还需要 1 个 Agent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "开始大乱斗" })).toBeDisabled();
  });

  it("selects six distinct Agents and submits the battle", async () => {
    const apiResult = {
      ...makeResult("battle-1", "月球基地资源分配"),
      mode: "battle_royale" as const,
      participant_ids: agentRows.slice(0, 6).map((agent) => agent.id),
      participant_names: Object.fromEntries(
        agentRows.slice(0, 6).map((agent) => [agent.id, agent.name]),
      ),
    };
    apiResult.winner_id = apiResult.participant_ids[0]!;
    runBattleMutate.mockResolvedValue(apiResult);
    render(<BattleRoyaleArena />);

    await waitFor(() => {
      expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(6);
    });
    fireEvent.click(screen.getByRole("button", { name: "开始大乱斗" }));

    await waitFor(() => expect(runBattleMutate).toHaveBeenCalledOnce());
    expect(runBattleMutate.mock.calls[0]?.[0].agent_ids).toEqual(
      agentRows.slice(0, 6).map((agent) => agent.id),
    );
    expect(
      await screen.findByRole("heading", { name: /最终胜者/ }),
    ).toBeInTheDocument();
  });

  it("enforces the eight-Agent cap and non-blank topic", async () => {
    agentRows = makeAgents(9);
    render(<BattleRoyaleArena />);
    const agentButtons = agentRows.map((agent) =>
      screen.getByRole("button", { name: new RegExp(agent.name) })
    );

    fireEvent.click(agentButtons[6]!);
    fireEvent.click(agentButtons[7]!);
    fireEvent.click(agentButtons[8]!);
    expect(agentButtons[8]).toHaveAttribute("aria-pressed", "false");

    fireEvent.change(screen.getByLabelText("大乱斗主题"), {
      target: { value: "   " },
    });
    expect(screen.getByRole("button", { name: "开始大乱斗" })).toBeDisabled();
  });
});

describe("Step 46 report view", () => {
  it("shows an empty state before any Arena result exists", () => {
    render(<ArenaReportView />);
    expect(screen.getByText("还没有可生成的战报")).toBeInTheDocument();
  });

  it("selects the first history item and copies its Markdown", async () => {
    arenaRows = [makeResult("arena-1", "校园创新")];
    reportData = {
      arena_id: "arena-1",
      title: "校园创新 · 竞技战报",
      markdown: "# 校园创新\n\n## 最终比分",
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<ArenaReportView />);

    expect(await screen.findByText(reportData.title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "复制 Markdown" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(reportData!.markdown));
    expect(screen.getByRole("button", { name: "已复制" })).toBeInTheDocument();
  });
});

describe("Step 46 comparison view", () => {
  it("requires two saved records for the selected Agent", async () => {
    arenaRows = [makeResult("arena-1", "第一场")];
    render(<ArenaComparisonView />);
    expect(
      await screen.findByText("至少需要两场历史记录"),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(arenasFilterSpy).toHaveBeenCalledWith(agentRows[0]!.id)
    );
  });

  it("renders two distinct history records side by side", async () => {
    arenaRows = [
      makeResult("arena-1", "第一场"),
      makeResult("arena-2", "第二场", 1),
    ];
    render(<ArenaComparisonView />);

    expect(await screen.findByLabelText("对比 A")).toHaveValue("arena-1");
    expect(screen.getByLabelText("对比 B")).toHaveValue("arena-2");
    expect(screen.getAllByText("第一场")).not.toHaveLength(0);
    expect(screen.getAllByText("第二场")).not.toHaveLength(0);
    expect(screen.getByText("第一场 的关键发言")).toBeInTheDocument();
    expect(screen.getByText("第二场 的关键发言")).toBeInTheDocument();
  });
});
