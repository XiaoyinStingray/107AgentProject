import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOCK_AGENT_TEMPLATES } from "../../mocks/agentTemplates";
import type { AgentTemplate } from "../../types/agentTemplate";
import TemplateBrowser from "./TemplateBrowser";

const hookState = vi.hoisted(() => ({
  templates: [] as AgentTemplate[],
  create: vi.fn(),
}));

vi.mock("../../api/templates", () => ({
  useAgentTemplates: () => ({
    data: hookState.templates,
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../../api/agents", () => ({
  useCreateAgent: () => ({
    mutateAsync: hookState.create,
    isPending: false,
    error: null,
  }),
}));

beforeEach(() => {
  hookState.templates = structuredClone(MOCK_AGENT_TEMPLATES);
  hookState.create.mockReset();
  hookState.create.mockResolvedValue({ name: "模板生成角色" });
});

function LocationProbe() {
  const location = useLocation();
  const state = location.state as { initialDescription?: string } | null;
  return (
    <output data-testid="location">
      {location.pathname}{location.hash}|{state?.initialDescription ?? ""}
    </output>
  );
}

function renderBrowser() {
  return render(
    <MemoryRouter initialEntries={["/agents#item-7"]}>
      <TemplateBrowser />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("Step 39 TemplateBrowser", () => {
  it("provides at least 30 templates and filters by category", () => {
    renderBrowser();

    expect(screen.getByText(`${MOCK_AGENT_TEMPLATES.length} 个模板`)).toBeInTheDocument();
    expect(MOCK_AGENT_TEMPLATES.length).toBeGreaterThanOrEqual(30);
    expect(screen.getByText("沉默的优等生")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "学术科研" }));
    expect(screen.queryByText("沉默的优等生")).not.toBeInTheDocument();
    expect(screen.getByText("理论执着者")).toBeInTheDocument();
  });

  it("creates through the existing Agent endpoint hook", async () => {
    renderBrowser();
    const template = MOCK_AGENT_TEMPLATES[0]!;

    fireEvent.click(
      screen.getByRole("button", { name: `直接创建：${template.name}` }),
    );

    await screen.findByText("已从模板创建 Agent：模板生成角色");
    expect(hookState.create).toHaveBeenCalledWith(template.seed_prompt);
  });

  it("navigates to the natural-language editor with a prefilled draft", () => {
    renderBrowser();
    const template = MOCK_AGENT_TEMPLATES[0]!;

    fireEvent.click(
      screen.getByRole("button", { name: `编辑模板：${template.name}` }),
    );

    expect(screen.getByTestId("location")).toHaveTextContent(
      `/agents#item-1|${template.seed_prompt}`,
    );
    expect(hookState.create).not.toHaveBeenCalled();
  });
});
