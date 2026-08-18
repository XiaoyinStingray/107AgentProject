import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgents } from "../api/agents";
import {
  useCreateWorld,
  useFinishWorld,
  usePauseWorld,
  useResetWorld,
  useStartWorld,
  useWorldRelationships,
} from "../api/worlds";
import { useSSE } from "../hooks/useSSE";
import { MOCK_AGENTS } from "../mocks/agents";
import GroupSandbox from "./GroupSandbox";

vi.mock("../api/agents", () => ({ useAgents: vi.fn() }));
vi.mock("../api/worlds", () => ({
  useCreateWorld: vi.fn(),
  useDeleteWorld: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useFinishWorld: vi.fn(),
  usePauseWorld: vi.fn(),
  useResetWorld: vi.fn(),
  useStartWorld: vi.fn(),
  useWorldRelationships: vi.fn(),
  useWorlds: () => ({ data: [] }),
}));
vi.mock("../hooks/useSSE", () => ({ useSSE: vi.fn() }));
vi.mock("../stores/useSandboxStore", () => ({
  useSandboxStore: () => ({ activeWorldId: null, setActiveWorld: vi.fn() }),
}));

const create = vi.fn();
const start = vi.fn();
const pause = vi.fn();
const reset = vi.fn();
const finish = vi.fn();
const clear = vi.fn();
const disconnect = vi.fn();
const hydrateRelationships = vi.fn();
const relationshipSnapshot = { nodes: [], edges: [] };

function mutation(mutateAsync: ReturnType<typeof vi.fn>) {
  return { mutateAsync, isPending: false };
}

describe("Step 33 GroupSandbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    create.mockResolvedValue({ id: "world-33" });
    start.mockResolvedValue({ status: "started", world_id: "world-33" });
    pause.mockResolvedValue({ status: "paused", world_id: "world-33" });
    reset.mockResolvedValue({ status: "reset", world_id: "world-33" });
    finish.mockResolvedValue({ status: "finished", world_id: "world-33" });
    vi.mocked(useAgents).mockReturnValue({
      data: MOCK_AGENTS,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useAgents>);
    vi.mocked(useCreateWorld).mockReturnValue(mutation(create) as never);
    vi.mocked(useStartWorld).mockReturnValue(mutation(start) as never);
    vi.mocked(usePauseWorld).mockReturnValue(mutation(pause) as never);
    vi.mocked(useResetWorld).mockReturnValue(mutation(reset) as never);
    vi.mocked(useFinishWorld).mockReturnValue(mutation(finish) as never);
    vi.mocked(useWorldRelationships).mockReturnValue({
      data: relationshipSnapshot,
    } as unknown as ReturnType<typeof useWorldRelationships>);
    vi.mocked(useSSE).mockReturnValue({
      events: [],
      totalEventCount: 0,
      connected: true,
      relationships: {},
      lastRelationshipKey: null,
      hydrateRelationships,
      connect: vi.fn(),
      disconnect,
      clear,
    });
  });

  it("creates and starts a real multi-Agent World", async () => {
    renderPage();
    const startButton = await screen.findByRole("button", { name: /3 Agents/ });
    fireEvent.click(startButton);

    await waitFor(() => expect(create).toHaveBeenCalledWith({
      name: "群体沙盒 - 期末周",
      world_type: "group",
      scenario: { name: "期末周" },
      agent_ids: MOCK_AGENTS.map((agent) => agent.id),
    }));
    expect(start).toHaveBeenCalledWith("world-33");
    expect(await screen.findByText(/运行中/)).toBeInTheDocument();
    expect(clear).toHaveBeenCalled();
  });

  it("pauses, resumes, and resets the active World", async () => {
    vi.mocked(useSSE).mockReturnValue({
      events: [{ type: "paused", tick: 0, status: "paused" }],
      totalEventCount: 1,
      connected: true,
      relationships: {},
      lastRelationshipKey: null,
      hydrateRelationships,
      connect: vi.fn(),
      disconnect,
      clear,
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /3 Agents/ }));
    await screen.findByText(/运行中/);

    fireEvent.click(screen.getByRole("button", { name: /暂停/ }));
    await waitFor(() => expect(pause).toHaveBeenCalledWith("world-33"));
    fireEvent.click(await screen.findByRole("button", { name: /继续/ }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: /结束/ }));
    await waitFor(() => expect(finish).toHaveBeenCalledWith("world-33"));
    expect(disconnect).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /3 Agents/ })).toBeInTheDocument();
  });

  it("shows a useful startup error", async () => {
    create.mockRejectedValueOnce(new Error("DeepSeek unavailable"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /3 Agents/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "DeepSeek unavailable",
    );
  });

  it("keeps the final frame and clearly marks an automatically finished World", async () => {
    vi.mocked(useSSE).mockReturnValue({
      events: [
        { type: "agent_message", tick: 7, agent_id: "agent-1", message: "明天见。" },
        { type: "session_end", tick: 8, reason: "natural_completion" },
      ],
      totalEventCount: 2,
      connected: true,
      relationships: {},
      lastRelationshipKey: null,
      hydrateRelationships,
      connect: vi.fn(),
      disconnect,
      clear,
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /3 Agents/ }));

    expect(await screen.findByText("✅ 对话已自然结束")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("参与者已经完成交流");
    expect(screen.queryByRole("button", { name: /暂停/ })).not.toBeInTheDocument();
    await waitFor(() => expect(disconnect).toHaveBeenCalled());
  });
});

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderPage() {
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <GroupSandbox />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
