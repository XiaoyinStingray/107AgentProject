import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import EventFeed from "./EventFeed";
import Timeline from "./Timeline";
import type { SSEEvent } from "../../types/events";
import SandboxHeader from "./SandboxHeader";
import SandboxSetup from "./SandboxSetup";
import RelationshipGraph from "./RelationshipGraph";
import GroupSandbox from "../../pages/GroupSandbox";
import { MOCK_AGENTS } from "../../mocks/agents";
import { MOCK_SANDBOX_SCENARIOS } from "../../mocks/sandbox";

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
    data: { change: -0.05, score: 0.1 },
  },
];

describe("Step 21 RelationshipGraph", () => {
  const relEvents: SSEEvent[] = [
    {
      type: "relationship_change",
      tick: 2,
      agent_id: "mock-2",
      agent_name: "小红",
      description: "关系变化",
      data: {
        agent_a: "mock-1",
        agent_b: "mock-2",
        change: 0.15,
        score: 0.25,
        interaction: "friendly",
      },
    },
    {
      type: "relationship_change",
      tick: 3,
      agent_id: "mock-3",
      agent_name: "小刚",
      description: "关系变化",
      data: {
        agent_a: "mock-3",
        agent_b: "mock-1",
        change: -0.1,
        score: -0.1,
        interaction: "competitive",
      },
    },
  ];

  it("renders edges with correct score labels", () => {
    render(
      <RelationshipGraph agents={MOCK_AGENTS} events={relEvents} />,
    );
    expect(screen.getByText("+0.25")).toBeInTheDocument();
    expect(screen.getByText("-0.10")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /关系网络图/ })).toBeInTheDocument();
  });

  it("shows placeholder when fewer than 2 agents", () => {
    render(
      <RelationshipGraph agents={MOCK_AGENTS.slice(0, 1)} events={relEvents} />,
    );
    expect(screen.getByText(/至少 2 个 Agent/)).toBeInTheDocument();
  });

  it("renders legend labels", () => {
    render(<RelationshipGraph agents={MOCK_AGENTS} events={[]} />);
    expect(screen.getByText("友好")).toBeInTheDocument();
    expect(screen.getByText("中立")).toBeInTheDocument();
    expect(screen.getByText("敌对")).toBeInTheDocument();
  });
});

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
    const { rerender } = render(<EventFeed events={events} />);

    expect(screen.getByText("MESSAGE")).toBeInTheDocument();
    expect(screen.getByText("RELATION")).toBeInTheDocument();
    expect(screen.queryByText("THOUGHT")).not.toBeInTheDocument();
    expect(screen.getByText(/-0\.05/)).toBeInTheDocument();

    rerender(<EventFeed events={events} selectedTick={2} />);
    expect(screen.queryByText("MESSAGE")).not.toBeInTheDocument();
    expect(screen.getByText("RELATION")).toBeInTheDocument();
  });

  it("supports setup selection and disables start without agents", () => {
    const onToggleAgent = vi.fn();
    const onSelectScenario = vi.fn();
    const onStart = vi.fn();
    const firstScenarioName = MOCK_SANDBOX_SCENARIOS[0]!.name ?? "scenario-1";
    const secondScenarioName =
      MOCK_SANDBOX_SCENARIOS[1]!.name ?? "scenario-2";

    render(
      <SandboxSetup
        agents={MOCK_AGENTS.slice(0, 2)}
        scenarios={MOCK_SANDBOX_SCENARIOS}
        selectedAgentIds={[]}
        selectedScenario={firstScenarioName}
        onToggleAgent={onToggleAgent}
        onSelectScenario={onSelectScenario}
        onStart={onStart}
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
        name: new RegExp(secondScenarioName),
      }),
    );

    expect(onToggleAgent).toHaveBeenCalledWith(MOCK_AGENTS[0].id);
    expect(onSelectScenario).toHaveBeenCalledWith(
      secondScenarioName,
    );
  });

  it("wires runtime header controls to their callbacks", () => {
    const onToggleSpeed = vi.fn();
    const onToggleRunning = vi.fn();
    const onReset = vi.fn();

    render(
      <SandboxHeader
        scenario="Test world"
        currentTick={3}
        connected
        speed={1}
        onToggleSpeed={onToggleSpeed}
        onToggleRunning={onToggleRunning}
        onReset={onReset}
      />,
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);

    expect(onToggleRunning).toHaveBeenCalledOnce();
    expect(onToggleSpeed).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("starts the mock runtime and changes speed without losing the stream", () => {
    vi.useFakeTimers();
    render(<GroupSandbox />);

    fireEvent.click(screen.getByRole("button", { name: /Agents/ }));
    expect(screen.getByText("RUNNING")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText(/1 events/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Speed 1x/ }));
    expect(screen.getByRole("button", { name: /Speed 2x/ })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/2 events/)).toBeInTheDocument();

    vi.useRealTimers();
  });
});
