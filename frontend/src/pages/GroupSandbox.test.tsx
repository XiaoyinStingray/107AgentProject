import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAgents } from "../api/agents";
import {
  useCreateWorld,
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
  usePauseWorld: vi.fn(),
  useResetWorld: vi.fn(),
  useStartWorld: vi.fn(),
  useWorldRelationships: vi.fn(),
}));
vi.mock("../hooks/useSSE", () => ({ useSSE: vi.fn() }));

const create = vi.fn();
const start = vi.fn();
const pause = vi.fn();
const reset = vi.fn();
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
    vi.mocked(useAgents).mockReturnValue({
      data: MOCK_AGENTS,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useAgents>);
    vi.mocked(useCreateWorld).mockReturnValue(mutation(create) as never);
    vi.mocked(useStartWorld).mockReturnValue(mutation(start) as never);
    vi.mocked(usePauseWorld).mockReturnValue(mutation(pause) as never);
    vi.mocked(useResetWorld).mockReturnValue(mutation(reset) as never);
    vi.mocked(useWorldRelationships).mockReturnValue({
      data: relationshipSnapshot,
    } as unknown as ReturnType<typeof useWorldRelationships>);
    vi.mocked(useSSE).mockReturnValue({
      events: [],
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
      scenario: { name: "期末周" },
      agent_ids: MOCK_AGENTS.map((agent) => agent.id),
    }));
    expect(start).toHaveBeenCalledWith("world-33");
    expect(await screen.findByText("RUNNING")).toBeInTheDocument();
    expect(clear).toHaveBeenCalled();
  });

  it("pauses, resumes, and resets the active World", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /3 Agents/ }));
    await screen.findByText("RUNNING");

    fireEvent.click(screen.getByRole("button", { name: /暂停/ }));
    await waitFor(() => expect(pause).toHaveBeenCalledWith("world-33"));
    fireEvent.click(screen.getByRole("button", { name: /继续/ }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "重置" }));
    await waitFor(() => expect(reset).toHaveBeenCalledWith("world-33"));
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
});

function renderPage() {
  return render(
    <MemoryRouter>
      <GroupSandbox />
    </MemoryRouter>,
  );
}
