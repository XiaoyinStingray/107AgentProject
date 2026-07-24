import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
  it("starts empty for the existing default route", () => {
    render(<AgentFoundry />);
    expect(screen.getByPlaceholderText(/描述你的 Agent/)).toHaveValue("");
  });

  it("prefills the natural-language input without creating automatically", () => {
    render(<AgentFoundry initialDescription="来自模板的可编辑角色描述" />);

    expect(screen.getByPlaceholderText(/描述你的 Agent/)).toHaveValue(
      "来自模板的可编辑角色描述",
    );
    expect(screen.getByRole("button", { name: "✨ 创建 Agent" })).toBeEnabled();
  });
});
