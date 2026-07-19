import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MOCK_AGENTS } from "../../mocks/agents";
import {
  ARENA_MODE_OPTIONS,
  ARENA_TOPICS,
  buildMockArenaResult,
  MOCK_ARENA_ROUNDS,
} from "../../mocks/arena";
import type { ArenaConfig } from "../../types/arena";
import ArenaMatch from "./ArenaMatch";
import ArenaResultPanel from "./ArenaResultPanel";
import ArenaSetup from "./ArenaSetup";

const agentA = MOCK_AGENTS[0]!;
const agentB = MOCK_AGENTS[1]!;
const agentC = MOCK_AGENTS[2]!;
const config: ArenaConfig = {
  agent_a_id: agentA.id,
  agent_b_id: agentB.id,
  mode: "debate",
  topic: "测试竞技主题",
  rounds: MOCK_ARENA_ROUNDS,
};
const result = buildMockArenaResult(config, agentA, agentB);

function renderSetup(canStart = true) {
  const callbacks = {
    onSelectAgentA: vi.fn(),
    onSelectAgentB: vi.fn(),
    onSelectMode: vi.fn(),
    onChangeTopic: vi.fn(),
    onStart: vi.fn(),
  };

  render(
    <ArenaSetup
      agents={MOCK_AGENTS}
      selectedAgentAId={agentA.id}
      selectedAgentBId={agentB.id}
      selectedMode="debate"
      topic={config.topic}
      modeOptions={ARENA_MODE_OPTIONS}
      topicPresets={ARENA_TOPICS.debate}
      canStart={canStart}
      {...callbacks}
    />,
  );

  return callbacks;
}

describe("Step 22 ArenaSetup", () => {
  it("renders distinct Agent selectors and prevents duplicate selection", () => {
    const callbacks = renderSetup();
    const agentASelect = screen.getByLabelText("AGENT A");
    const agentBSelect = screen.getByLabelText("AGENT B");

    expect(agentASelect).toHaveValue(agentA.id);
    expect(agentBSelect).toHaveValue(agentB.id);
    expect(
      within(agentASelect).getByRole("option", {
        name: new RegExp(agentB.name),
      }),
    ).toBeDisabled();
    expect(
      within(agentBSelect).getByRole("option", {
        name: new RegExp(agentA.name),
      }),
    ).toBeDisabled();

    fireEvent.change(agentBSelect, { target: { value: agentC.id } });
    expect(callbacks.onSelectAgentB).toHaveBeenCalledWith(agentC.id);
  });

  it("wires mode, topic, and start controls", () => {
    const callbacks = renderSetup();

    expect(screen.getByRole("button", { name: /辩论赛/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: /面试竞争/ }));
    fireEvent.click(
      screen.getByRole("button", { name: ARENA_TOPICS.debate[0] }),
    );
    fireEvent.change(screen.getByLabelText("竞技主题"), {
      target: { value: "新的面试主题" },
    });
    fireEvent.click(screen.getByRole("button", { name: "开始 1v1 竞技" }));

    expect(callbacks.onSelectMode).toHaveBeenCalledWith("interview");
    expect(callbacks.onChangeTopic).toHaveBeenCalledWith(ARENA_TOPICS.debate[0]);
    expect(callbacks.onChangeTopic).toHaveBeenCalledWith("新的面试主题");
    expect(callbacks.onStart).toHaveBeenCalledOnce();
  });

  it("disables start when the configuration is invalid", () => {
    renderSetup(false);
    expect(
      screen.getByRole("button", { name: "开始 1v1 竞技" }),
    ).toBeDisabled();
  });
});

describe("Step 22 ArenaMatch", () => {
  it("renders waiting state and then visible transcript entries", () => {
    const { rerender } = render(
      <ArenaMatch
        config={config}
        agentA={agentA}
        agentB={agentB}
        currentRound={1}
        visibleTranscript={[]}
        isJudging={false}
      />,
    );

    expect(screen.getByText("裁判正在确认比赛规则…")).toBeInTheDocument();
    expect(screen.getByText(agentA.name)).toBeInTheDocument();
    expect(screen.getByText(agentB.name)).toBeInTheDocument();

    rerender(
      <ArenaMatch
        config={config}
        agentA={agentA}
        agentB={agentB}
        currentRound={1}
        visibleTranscript={result.transcript.slice(0, 2)}
        isJudging={true}
      />,
    );

    expect(screen.getByText("2 条发言")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "竞技发言记录" })).toBeInTheDocument();
    expect(screen.getAllByText(result.transcript[0]!.content)).toHaveLength(1);
    expect(screen.getAllByText(result.transcript[1]!.content)).toHaveLength(1);
    expect(screen.getByText("裁判正在汇总四项评分…")).toBeInTheDocument();
  });
});

describe("Step 22 ArenaResultPanel", () => {
  it("renders winner, scores, reasoning, transcript, and reset", () => {
    const onReset = vi.fn();
    render(
      <ArenaResultPanel
        result={result}
        agentA={agentA}
        agentB={agentB}
        onReset={onReset}
      />,
    );

    const winner = result.winner_id === agentA.id ? agentA : agentB;
    expect(screen.getByText(`胜者 · ${winner.name}`)).toBeInTheDocument();
    expect(screen.getByText(result.judge_reasoning)).toBeInTheDocument();
    expect(screen.getByText("6 条发言")).toBeInTheDocument();
    expect(screen.getAllByText("/ 40")).toHaveLength(2);
    expect(screen.getAllByText("论点质量")).toHaveLength(2);
    expect(screen.getAllByText("表达能力")).toHaveLength(2);
    expect(screen.getAllByText("应变能力")).toHaveLength(2);
    expect(screen.getAllByText("人设一致")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "返回设置" }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("falls back to zero when a score is missing", () => {
    render(
      <ArenaResultPanel
        result={{ ...result, scores: {} }}
        agentA={agentA}
        agentB={agentB}
        onReset={vi.fn()}
      />,
    );
    expect(screen.getAllByText("0")).toHaveLength(2);
  });
});
