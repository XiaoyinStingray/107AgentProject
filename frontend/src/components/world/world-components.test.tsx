import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EventFeed from "./EventFeed";
import Timeline from "./Timeline";
import type { SSEEvent } from "../../types/events";
import SandboxHeader from "./SandboxHeader";
import SandboxSetup from "./SandboxSetup";
import { MOCK_AGENTS } from "../../mocks/agents";

vi.mock("../../api/scenarios", () => ({
  useScenarios: () => ({
    data: [
      { name: "新生报到", description: "大学开学", time_range: "1-20" },
      { name: "期末周", description: "考试周", time_range: "1-30" },
    ],
  }),
  useDeleteScenario: () => ({ mutate: vi.fn() }),
}));

const events: SSEEvent[] = [
  {
    type: "thought_stream",
    agent_id: "agent-1",
    agent_name: "A",
    tick: 1,
    content: "internal thought",
  },
  {
    type: "agent_message",
    agent_id: "agent-1",
    agent_name: "A",
    tick: 1,
    message: "hello",
  },
  {
    type: "relationship_change",
    agent_id: "agent-2",
    agent_name: "B",
    tick: 2,
    description: "relationship shifted",
    data: {
      from: "agent-2",
      to: "agent-1",
      old_score: 0.15,
      new_score: 0.1,
      interaction: "competitive",
      intensity: 1,
    },
  },
];

describe("Step 20 world components", () => {
  it("groups timeline events and selects a tick", () => {
    const onSelectTick = vi.fn();
    render(
      <Timeline
        events={events}
        selectedTick={null}
        onSelectTick={onSelectTick}
      />,
    );

    expect(screen.getByRole("button", { name: /#1.*2 ev/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /#2.*1 ev/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /#2.*1 ev/ }));
    expect(onSelectTick).toHaveBeenCalledWith(2);
  });

  it("filters thought events and renders relationship metadata", () => {
    const { rerender } = render(<EventFeed events={events} feedFilterIds={["agent-1", "agent-2"]} />);

    expect(screen.getByText("MESSAGE")).toBeInTheDocument();
    expect(screen.getByText("RELATION")).toBeInTheDocument();
    expect(screen.queryByText("THOUGHT")).not.toBeInTheDocument();
    expect(screen.getByText(/-0\.05/)).toBeInTheDocument();

    rerender(<EventFeed events={events} selectedTick={2} feedFilterIds={["agent-1", "agent-2"]} />);
    expect(screen.queryByText("MESSAGE")).not.toBeInTheDocument();
    expect(screen.getByText("RELATION")).toBeInTheDocument();
  });

  it("supports setup selection and disables start without agents", () => {
    const onToggleAgent = vi.fn();
    const onSelectScenario = vi.fn();
    const onStart = vi.fn();
    const onResumeWorld = vi.fn();
    const onDeleteWorld = vi.fn();

    render(
      <SandboxSetup
        agents={MOCK_AGENTS.slice(0, 2)}
        worlds={[]}
        selectedAgentIds={[]}
        selectedScenario="新生报到"
        onToggleAgent={onToggleAgent}
        onSelectScenario={onSelectScenario}
        onStart={onStart}
        onResumeWorld={onResumeWorld}
        onDeleteWorld={onDeleteWorld}
      />,
    );

    const startButton = screen.getByRole("button", { name: /Agents/ });
    expect(startButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole("button", {
        name: new RegExp(MOCK_AGENTS[0]!.name),
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: /期末周/,
      }),
    );

    expect(onToggleAgent).toHaveBeenCalledWith(MOCK_AGENTS[0].id);
    expect(onSelectScenario).toHaveBeenCalledWith("期末周");
  });

  it("wires runtime header controls to their callbacks", () => {
    const onToggleSpeed = vi.fn();
    const onToggleRunning = vi.fn();
    const onBack = vi.fn();
    const onReset = vi.fn();

    render(
      <SandboxHeader
        scenario="Test world"
        currentTick={3}
        connected
        isPaused={false}
        isPending={false}
        speed={1}
        onToggleSpeed={onToggleSpeed}
        onToggleRunning={onToggleRunning}
        onBack={onBack}
        onReset={onReset}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(4);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);
    fireEvent.click(buttons[3]);

    expect(onToggleRunning).toHaveBeenCalledOnce();
    expect(onToggleSpeed).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
  });
});
