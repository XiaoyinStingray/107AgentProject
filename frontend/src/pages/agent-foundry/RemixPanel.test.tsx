import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_AGENTS } from "../../mocks/agents";
import type { AgentResponse } from "../../types/agent";
import type { RemixRequest, RemixResponse } from "../../types/remix";
import RemixPanel from "./RemixPanel";

const hookState = vi.hoisted(() => ({
  agents: [] as AgentResponse[],
  mutateAsync: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("../../api/agents", () => ({
  useAgents: () => ({
    data: hookState.agents,
    isLoading: false,
    error: null,
  }),
  useRemixAgent: () => ({
    mutateAsync: hookState.mutateAsync,
    reset: hookState.reset,
    isPending: false,
    error: null,
  }),
}));

function makePreview(): RemixResponse {
  const source = structuredClone(MOCK_AGENTS[0]!);
  const draft = {
    persona: {
      ...source.persona,
      narrative: "更愿意主动交流，也更敢尝试可控风险。",
      big_five: { ...source.persona.big_five, extraversion: 0.8 },
    },
    background: source.background,
    goals: source.goals,
  };
  return {
    status: "preview",
    source_agent_id: source.id,
    spec: {
      instruction: "更外向",
      trait_targets: {},
      preserve_fields: ["name", "background", "goals"],
    },
    draft,
    changes: [{
      field: "persona.big_five.extraversion",
      before: String(source.persona.big_five.extraversion),
      after: "0.8",
    }],
    summary: "提高外向性。",
    agent: null,
  };
}

beforeEach(() => {
  hookState.agents = structuredClone(MOCK_AGENTS);
  hookState.mutateAsync.mockReset();
  hookState.reset.mockReset();
  if (typeof ResizeObserver === "undefined") {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  }
});

describe("Step 39 RemixPanel", () => {
  it("requires an instruction or changed trait before preview", () => {
    render(<RemixPanel />);

    expect(screen.getByRole("button", { name: "生成 Remix 预览" })).toBeDisabled();
    expect(screen.getByLabelText("选择原 Agent")).toHaveValue(MOCK_AGENTS[0]!.id);
    expect(screen.getByLabelText("姓名")).toBeChecked();
    expect(screen.getByLabelText("成长背景")).toBeChecked();
    expect(screen.getByLabelText("目标")).toBeChecked();
  });

  it("previews and creates the exact returned draft", async () => {
    const preview = makePreview();
    hookState.mutateAsync.mockImplementation(async (
      { request }: { request: RemixRequest },
    ) => {
      if (request.action === "preview") return preview;
      return {
        ...preview,
        status: "created",
        agent: {
          ...MOCK_AGENTS[0]!,
          id: "remix-created",
          persona: preview.draft.persona,
        },
      };
    });
    render(<RemixPanel />);

    fireEvent.change(screen.getByLabelText("修改要求"), {
      target: { value: "更外向" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成 Remix 预览" }));

    await screen.findByText("提高外向性。");
    expect(hookState.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        agentId: MOCK_AGENTS[0]!.id,
        request: expect.objectContaining({ action: "preview" }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "确认创建 Remix 副本" }));
    await screen.findByText(/已创建副本/);
    const createCall = hookState.mutateAsync.mock.calls[1]![0];
    expect(createCall.request.action).toBe("create");
    expect(createCall.request.draft).toEqual(preview.draft);
  });

  it("sends only an actually changed slider target", async () => {
    hookState.mutateAsync.mockResolvedValue(makePreview());
    render(<RemixPanel />);

    fireEvent.change(screen.getByLabelText("外向性目标值"), {
      target: { value: "0.8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "生成 Remix 预览" }));

    await waitFor(() => expect(hookState.mutateAsync).toHaveBeenCalled());
    expect(
      hookState.mutateAsync.mock.calls[0]![0].request.spec.trait_targets,
    ).toEqual({ extraversion: 0.8 });
  });

  it("shows an empty state when no Agent exists", () => {
    hookState.agents = [];
    render(<RemixPanel />);

    expect(screen.getByText("还没有可 Remix 的 Agent")).toBeInTheDocument();
  });
});
