import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import AgentFoundry from "./AgentFoundry";

vi.mock("../api/agents", () => ({
  useAgents: () => ({ data: [] }),
  useCreateAgent: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    data: null,
  }),
  useDeleteAgent: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("../api/worlds", () => ({
  useWorlds: () => ({ data: [] }),
}));

describe("Step 39 AgentFoundry template prefill", () => {
  const renderInRouter = (ui: React.ReactElement) =>
    render(<MemoryRouter>{ui}</MemoryRouter>);

  it("starts empty for the existing default route", () => {
    renderInRouter(<AgentFoundry />);
    expect(screen.getByPlaceholderText(/描述你的 Agent/)).toHaveValue("");
  });

  it("prefills the natural-language input without creating automatically", () => {
    renderInRouter(<AgentFoundry initialDescription="来自模板的可编辑角色描述" />);

    expect(screen.getByPlaceholderText(/描述你的 Agent/)).toHaveValue(
      "来自模板的可编辑角色描述",
    );
    expect(screen.getByRole("button", { name: "✨ 创建 Agent" })).toBeEnabled();
  });
});
