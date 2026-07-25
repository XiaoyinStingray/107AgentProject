import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MOCK_AGENTS } from "../../mocks/agents";
import {
  ARENA_MODE_OPTIONS,
  ARENA_TOPICS,
  buildMockArenaResult,
  MOCK_ARENA_ROUNDS,
} from "../../mocks/arena";
import type {
  ArenaConfig,
  ArenaPresentationResult,
} from "../../types/arena";
import ArenaMatch from "./ArenaMatch";
import ArenaResultPanel from "./ArenaResultPanel";
import ArenaSetup from "./ArenaSetup";
import BattleRoyaleResult from "./BattleRoyaleResult";

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

    expect(screen.getByText("正在准备比赛记录…")).toBeInTheDocument();
    expect(
      screen.getByText("比赛已在后台完成，正在逐条呈现记录；此处不是实时生成。"),
    ).toBeInTheDocument();
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
    expect(screen.getByText("正在呈现裁判四项评分汇总…")).toBeInTheDocument();
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
    expect(screen.getAllByText("内容质量")).toHaveLength(2);
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

describe("Step 46 BattleRoyaleResult", () => {
  it("renders per-stage scores and the elimination path", () => {
    const battleResult: ArenaPresentationResult = {
      ...result,
      id: "battle-ranking",
      mode: "battle_royale",
      winner_id: agentB.id,
      scores: {
        [agentA.id]: 24,
        [agentB.id]: 28,
        [agentC.id]: 20,
      },
      participant_ids: [agentA.id, agentB.id, agentC.id],
      participant_names: {
        [agentA.id]: agentA.name,
        [agentB.id]: agentB.name,
        [agentC.id]: agentC.name,
      },
      transcript: [
        {
          id: "stage-1-a",
          round: 1,
          speaker_id: agentA.id,
          speaker_name: agentA.name,
          content: "A 第一阶段发言",
          stage_score: 30,
          stage_rank: 2,
          advanced: true,
        },
        {
          id: "stage-1-b",
          round: 1,
          speaker_id: agentB.id,
          speaker_name: agentB.name,
          content: "B 第一阶段发言",
          stage_score: 32,
          stage_rank: 1,
          advanced: true,
        },
        {
          id: "stage-1-b-follow-up",
          round: 1,
          speaker_id: agentB.id,
          speaker_name: agentB.name,
          content: "B 第一阶段补充发言",
          stage_score: 32,
          stage_rank: 1,
          advanced: true,
        },
        {
          id: "stage-1-c",
          round: 1,
          speaker_id: agentC.id,
          speaker_name: agentC.name,
          content: "C 第一阶段发言",
          stage_score: 20,
          stage_rank: 3,
          advanced: false,
        },
        {
          id: "stage-2-a",
          round: 2,
          speaker_id: agentA.id,
          speaker_name: agentA.name,
          content: "A 决赛发言",
          stage_score: 24,
          stage_rank: 2,
          advanced: false,
        },
        {
          id: "stage-2-b",
          round: 2,
          speaker_id: agentB.id,
          speaker_name: agentB.name,
          content: "B 决赛发言",
          stage_score: 28,
          stage_rank: 1,
          advanced: true,
        },
      ],
    };
    render(<BattleRoyaleResult result={battleResult} onReset={vi.fn()} />);

    const pathCard = screen.getByText("淘汰路径").parentElement!;
    expect(within(pathCard).getByText("第 1 阶段 · 3 → 2")).toBeInTheDocument();
    expect(within(pathCard).getByText("第 2 阶段 · 2 → 1")).toBeInTheDocument();
    expect(within(pathCard).getByText("本轮 32 / 40")).toBeInTheDocument();
    expect(within(pathCard).getByText("本轮 28 / 40")).toBeInTheDocument();
    const champion = within(pathCard).getByText("冠军").closest("li");
    expect(champion).toHaveTextContent(agentB.name);
  });
});
