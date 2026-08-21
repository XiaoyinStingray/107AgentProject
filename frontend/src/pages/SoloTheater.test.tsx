import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAgents } from "../api/agents";
import { useScenarios } from "../api/scenarios";
import {
  useCreateWorld,
  useDeleteWorld,
  useFinishWorld,
  usePauseWorld,
  useResetWorld,
  useStartWorld,
  useWorlds,
} from "../api/worlds";
import { useSSE } from "../hooks/useSSE";
import { MOCK_AGENTS } from "../mocks/agents";
import SoloTheater from "./SoloTheater";

vi.mock("../api/agents", () => ({ useAgents: vi.fn() }));
vi.mock("../api/scenarios", () => ({ useScenarios: vi.fn() }));
vi.mock("../api/worlds", () => ({
  useCreateWorld: vi.fn(),
  useDeleteWorld: vi.fn(),
  useFinishWorld: vi.fn(),
  usePauseWorld: vi.fn(),
  useResetWorld: vi.fn(),
  useStartWorld: vi.fn(),
  useWorlds: vi.fn(),
}));
vi.mock("../hooks/useSSE", () => ({ useSSE: vi.fn() }));

const createWorld = vi.fn();
const startWorld = vi.fn();
const pauseWorld = vi.fn();
const resetWorld = vi.fn();
const finishWorld = vi.fn();
const deleteWorld = vi.fn();
const disconnect = vi.fn();
const clear = vi.fn();

const scenarios = [
  {
    name: "新生报到",
    description: "大学开学第一天",
    time_range: "1-20",
  },
  {
    name: "期末周",
    description: "期末考试周",
    time_range: "1-30",
  },
];

function mutation(mutateAsync: ReturnType<typeof vi.fn>) {
  return { mutateAsync, isPending: false };
}

function ArchiveLocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="archive-location">
      {location.pathname}{location.search}
    </div>
  );
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={["/theater"]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/theater" element={<SoloTheater />} />
        <Route path="/archive" element={<ArchiveLocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("M2 SoloTheater lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createWorld.mockResolvedValue({ id: "solo-world" });
    startWorld.mockResolvedValue({ status: "started", world_id: "solo-world" });
    pauseWorld.mockResolvedValue({ status: "paused", world_id: "solo-world" });
    resetWorld.mockResolvedValue({ status: "reset", world_id: "solo-world" });
    finishWorld.mockResolvedValue({ status: "finished", world_id: "solo-world" });
    deleteWorld.mockResolvedValue(undefined);

    vi.mocked(useAgents).mockReturnValue({
      data: MOCK_AGENTS,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useAgents>);
    vi.mocked(useScenarios).mockReturnValue({
      data: scenarios,
    } as ReturnType<typeof useScenarios>);
    vi.mocked(useWorlds).mockReturnValue(
      { data: [] } as unknown as ReturnType<typeof useWorlds>,
    );
    vi.mocked(useCreateWorld).mockReturnValue(mutation(createWorld) as never);
    vi.mocked(useStartWorld).mockReturnValue(mutation(startWorld) as never);
    vi.mocked(usePauseWorld).mockReturnValue(mutation(pauseWorld) as never);
    vi.mocked(useResetWorld).mockReturnValue(mutation(resetWorld) as never);
    vi.mocked(useFinishWorld).mockReturnValue(mutation(finishWorld) as never);
    vi.mocked(useDeleteWorld).mockReturnValue(mutation(deleteWorld) as never);
    vi.mocked(useSSE).mockReturnValue({
      events: [],
      totalEventCount: 0,
      connected: true,
      relationships: {},
      lastRelationshipKey: null,
      hydrateRelationships: vi.fn(),
      connect: vi.fn(),
      disconnect,
      clear,
    });
  });

  it("creates and starts a real solo World from the selected Agent and scenario", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /开始投放/ }));

    await waitFor(() =>
      expect(createWorld).toHaveBeenCalledWith({
        name: `单人剧场 - ${MOCK_AGENTS[0]!.name}`,
        world_type: "solo",
        scenario: { name: "期末周" },
        agent_ids: [MOCK_AGENTS[0]!.id],
      }),
    );
    expect(startWorld).toHaveBeenCalledWith("solo-world");
    expect(clear).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(`${MOCK_AGENTS[0]!.name} · 期末周`),
    ).toBeInTheDocument();
  });

  it("pauses, resumes, and resets without replacing the active World", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /开始投放/ }));
    await screen.findByText(`${MOCK_AGENTS[0]!.name} · 期末周`);

    fireEvent.click(screen.getByRole("button", { name: /暂停/ }));
    await waitFor(() => expect(pauseWorld).toHaveBeenCalledWith("solo-world"));

    fireEvent.click(await screen.findByRole("button", { name: /继续/ }));
    await waitFor(() => expect(startWorld).toHaveBeenCalledTimes(2));
    expect(startWorld).toHaveBeenLastCalledWith("solo-world");

    fireEvent.click(screen.getByRole("button", { name: /重置/ }));
    await waitFor(() => expect(resetWorld).toHaveBeenCalledWith("solo-world"));
    expect(disconnect).toHaveBeenCalled();
    expect(clear).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /开始投放/ })).toBeInTheDocument();
  });

  it("finishes the World separately from reset", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /开始投放/ }));
    await screen.findByText(`${MOCK_AGENTS[0]!.name} · 期末周`);

    fireEvent.click(screen.getByRole("button", { name: /结束/ }));

    await waitFor(() => expect(finishWorld).toHaveBeenCalledWith("solo-world"));
    expect(resetWorld).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /开始投放/ })).toBeInTheDocument();
  });

  it("links a finished World to its exact archive replay", async () => {
    vi.mocked(useWorlds).mockReturnValue({
      data: [
        {
          id: "solo-finished",
          name: "已完成单人实验",
          world_type: "solo",
          scenario: { name: "期末周" },
          agent_ids: [MOCK_AGENTS[0]!.id],
          current_tick: 6,
          status: "finished",
          created_at: "2026-08-10T00:00:00Z",
        },
      ],
    } as ReturnType<typeof useWorlds>);

    renderPage();

    expect(screen.getByText("T6")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看回放" }));

    expect(await screen.findByTestId("archive-location")).toHaveTextContent(
      "/archive?replay=solo-finished",
    );
  });

  it("auto-selects the first agent when agents load asynchronously", async () => {
    // 模拟 agents 异步加载：初始为空，稍后填充
    vi.mocked(useAgents).mockReturnValue({
      data: [],
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useAgents>);

    const { rerender } = renderPage();

    // agents 为空时不应 crash，按钮应禁用或不可点击
    const startBtn = screen.getByRole("button", { name: /开始投放/ });
    expect(startBtn).toBeInTheDocument();

    // agents 加载完成
    vi.mocked(useAgents).mockReturnValue({
      data: MOCK_AGENTS,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useAgents>);

    // 重新渲染触发 useEffect
    rerender(
      <MemoryRouter
        initialEntries={["/theater"]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/theater" element={<SoloTheater />} />
          <Route path="/archive" element={<ArchiveLocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    // 点击开始投放——应该使用自动选中的第一个 agent
    const buttons = screen.getAllByRole("button", { name: /开始投放/ });
    fireEvent.click(buttons[0]!);
    await waitFor(() =>
      expect(createWorld).toHaveBeenCalledWith(
        expect.objectContaining({
          agent_ids: [MOCK_AGENTS[0]!.id],
        }),
      ),
    );
  });

  it("shows only solo Worlds, restores paused runs, and confirms deletion", async () => {
    vi.mocked(useWorlds).mockReturnValue({
      data: [
        {
          id: "solo-paused",
          name: "单人旧实验",
          world_type: "solo",
          scenario: { name: "新生报到" },
          agent_ids: [MOCK_AGENTS[0]!.id],
          current_tick: 3,
          status: "paused",
          created_at: "2026-08-09T00:00:00Z",
        },
        {
          id: "group-running",
          name: "不应出现的群体实验",
          world_type: "group",
          scenario: { name: "期末周" },
          agent_ids: MOCK_AGENTS.map((agent) => agent.id),
          current_tick: 2,
          status: "running",
          created_at: "2026-08-09T00:00:00Z",
        },
      ],
    } as ReturnType<typeof useWorlds>);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);

    renderPage();

    expect(screen.getByText("单人旧实验")).toBeInTheDocument();
    expect(screen.queryByText("不应出现的群体实验")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    expect(await screen.findByText(`${MOCK_AGENTS[0]!.name} · 新生报到`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /列表/ }));
    await waitFor(() => expect(pauseWorld).toHaveBeenCalledWith("solo-paused"));
    await waitFor(() => expect(screen.getByText("单人旧实验")).toBeInTheDocument(), {
      timeout: 3_000,
    });

    fireEvent.click(screen.getByTitle("删除"));
    expect(deleteWorld).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("删除"));
    await waitFor(() => expect(deleteWorld).toHaveBeenCalledWith("solo-paused"));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  }, 5_000);
});
