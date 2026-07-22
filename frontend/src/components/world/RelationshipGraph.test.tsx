import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MOCK_AGENTS } from "../../mocks/agents";
import type { RelationshipState } from "../../types/relationships";
import RelationshipGraph from "./RelationshipGraph";

const relationships: RelationshipState[] = [
  {
    source: "mock-1",
    target: "mock-2",
    score: 0.2,
    lastChange: 0.2,
    interaction: "friendly",
  },
  {
    source: "mock-2",
    target: "mock-1",
    score: 0.4,
    lastChange: 0.4,
    interaction: "friendly",
  },
  {
    source: "mock-3",
    target: "mock-1",
    score: -0.1,
    lastChange: -0.1,
    interaction: "competitive",
  },
];

describe("Step 33 RelationshipGraph", () => {
  it("renders averaged directional scores", () => {
    render(
      <RelationshipGraph agents={MOCK_AGENTS} relationships={relationships} />,
    );
    expect(screen.getByText("+0.30")).toBeInTheDocument();
    expect(screen.getByText("-0.10")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /关系网络图/ })).toBeInTheDocument();
  });

  it("shows the single-Agent placeholder", () => {
    render(
      <RelationshipGraph
        agents={MOCK_AGENTS.slice(0, 1)}
        relationships={relationships}
      />,
    );
    expect(screen.getByText(/至少 2 个 Agent/)).toBeInTheDocument();
  });

  it("renders the relationship legend", () => {
    render(<RelationshipGraph agents={MOCK_AGENTS} relationships={[]} />);
    expect(screen.getByText("友好")).toBeInTheDocument();
    expect(screen.getByText("中立")).toBeInTheDocument();
    expect(screen.getByText("敌对")).toBeInTheDocument();
  });
});
