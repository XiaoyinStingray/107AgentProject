import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AgentModule from "./AgentModule";

const foundryState = vi.hoisted(() => ({ description: "" }));

vi.mock("./AgentFoundry", () => ({
  default: ({ initialDescription = "" }: { initialDescription?: string }) => {
    if (initialDescription) foundryState.description = initialDescription;
    return (
      <div>
        原铸造厂页面
        <span data-testid="foundry-description">{foundryState.description}</span>
      </div>
    );
  },
}));
vi.mock("./agent-foundry/RemixPanel", () => ({
  default: () => <div>Remix 页面</div>,
}));
vi.mock("./agent-foundry/TemplateBrowser", () => ({
  default: () => <div>模板库页面</div>,
}));

function renderModule(
  path: string,
  state?: { initialDescription: string },
) {
  const [pathname, hashValue] = path.split("#");
  const entry = state
    ? { pathname, hash: hashValue ? `#${hashValue}` : "", state }
    : path;
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AgentModule />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  foundryState.description = "";
});

describe("Step 39 AgentModule hash routing", () => {
  it.each(["/agents", "/agents#item-1", "/agents#item-5"])(
    "keeps the existing foundry for %s",
    (path) => {
      renderModule(path);
      expect(screen.getByText("原铸造厂页面")).toBeInTheDocument();
    },
  );

  it("opens Remix for item-6", () => {
    renderModule("/agents#item-6");
    expect(screen.getByText("Remix 页面")).toBeInTheDocument();
  });

  it("opens templates for item-7", () => {
    renderModule("/agents#item-7");
    expect(screen.getByText("模板库页面")).toBeInTheDocument();
  });

  it("hands a template description to the existing foundry once", () => {
    renderModule("/agents#item-1", {
      initialDescription: "来自模板的角色描述",
    });

    expect(screen.getByTestId("foundry-description")).toHaveTextContent(
      "来自模板的角色描述",
    );
  });
});
