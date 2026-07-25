import { useEffect, useState } from "react";
import { useAgents } from "../../api/agents";
import { adaptArenaResult, useRunDuel } from "../../api/arenas";
import ArenaMatch from "../../components/arena/ArenaMatch";
import ArenaResultPanel from "../../components/arena/ArenaResultPanel";
import ArenaSetup from "../../components/arena/ArenaSetup";
import EmptyState from "../../components/shared/EmptyState";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import {
  ARENA_JUDGE_REPLAY_MS,
  ARENA_MODE_OPTIONS,
  ARENA_REPLAY_INTERVAL_MS,
  ARENA_TOPICS,
  DUEL_ARENA_ROUNDS,
} from "../../constants/arena";
import type {
  ArenaConfig,
  ArenaPhase,
  ArenaPresentationResult,
  DuelArenaMode,
} from "../../types/arena";


/** #22 真实 1v1：辩论、面试和路演共用同一配置与结果流程。 */
export default function DuelArena() {
  const { data: agents = [] } = useAgents();
  const [selectedAgentAId, setSelectedAgentAId] = useState("");
  const [selectedAgentBId, setSelectedAgentBId] = useState("");
  const [selectedMode, setSelectedMode] = useState<DuelArenaMode>("debate");
  const [topic, setTopic] = useState(
    ARENA_MODE_OPTIONS[0]?.default_topic ?? "",
  );
  const [result, setResult] = useState<ArenaPresentationResult | null>(null);
  const [phase, setPhase] = useState<ArenaPhase>("setup");
  const [visibleCount, setVisibleCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const runDuel = useRunDuel(selectedMode);

  useEffect(() => {
    if (agents.length < 2) return;
    const availableIds = new Set(agents.map((agent) => agent.id));
    const nextA = availableIds.has(selectedAgentAId)
      ? selectedAgentAId
      : agents[0]!.id;
    const nextB = (
      availableIds.has(selectedAgentBId) && selectedAgentBId !== nextA
    )
      ? selectedAgentBId
      : agents.find((agent) => agent.id !== nextA)?.id ?? "";
    if (nextA !== selectedAgentAId) setSelectedAgentAId(nextA);
    if (nextB !== selectedAgentBId) setSelectedAgentBId(nextB);
  }, [agents, selectedAgentAId, selectedAgentBId]);

  useEffect(() => {
    if (!result) return;
    if (phase === "running") {
      const nextPhase = visibleCount < result.transcript.length
        ? () => setVisibleCount((count) => count + 1)
        : () => setPhase("judging");
      const timer = window.setTimeout(nextPhase, ARENA_REPLAY_INTERVAL_MS);
      return () => window.clearTimeout(timer);
    }
    if (phase === "judging") {
      const timer = window.setTimeout(
        () => setPhase("result"),
        ARENA_JUDGE_REPLAY_MS,
      );
      return () => window.clearTimeout(timer);
    }
  }, [phase, result, visibleCount]);

  const agentA = agents.find((agent) => agent.id === selectedAgentAId);
  const agentB = agents.find((agent) => agent.id === selectedAgentBId);
  const config: ArenaConfig = {
    agent_a_id: selectedAgentAId,
    agent_b_id: selectedAgentBId,
    mode: selectedMode,
    topic,
    rounds: DUEL_ARENA_ROUNDS,
  };
  const canStart = Boolean(
    agentA &&
      agentB &&
      agentA.id !== agentB.id &&
      topic.trim() &&
      !runDuel.isPending,
  );

  const handleModeChange = (mode: DuelArenaMode) => {
    setSelectedMode(mode);
    const option = ARENA_MODE_OPTIONS.find((item) => item.value === mode);
    if (option) setTopic(option.default_topic);
  };

  const handleStart = async () => {
    if (!canStart) return;
    setErrorMessage(null);
    try {
      const response = await runDuel.mutateAsync(config);
      setResult(adaptArenaResult(response));
      setVisibleCount(0);
      setPhase("running");
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error ? cause.message : "竞技运行失败",
      );
    }
  };

  const handleReset = () => {
    setResult(null);
    setPhase("setup");
    setVisibleCount(0);
    setErrorMessage(null);
    runDuel.reset();
  };

  if (agents.length < 2) {
    return (
      <div className="h-full p-6 animate-fade-in motion-reduce:animate-none">
        <EmptyState
          title="至少需要两个 Agent"
          description="请先在 Agent 铸造厂创建参赛者，再返回竞技场。"
          tier="P1"
        />
      </div>
    );
  }

  if (runDuel.isPending) {
    return (
      <LoadingSpinner
        icon="⚔️"
        title={`${ARENA_MODE_OPTIONS.find((item) => item.value === selectedMode)?.label ?? "竞技"}进行中…`}
        detail={`${agentA?.name} vs ${agentB?.name} · ${topic}`}
        fullscreen
      />
    );
  }

  if (result && agentA && agentB) {
    const visibleTranscript = result.transcript.slice(0, visibleCount);
    if (phase === "running" || phase === "judging") {
      return (
        <ArenaMatch
          config={config}
          agentA={agentA}
          agentB={agentB}
          currentRound={
            visibleTranscript[visibleTranscript.length - 1]?.round ?? 1
          }
          visibleTranscript={visibleTranscript}
          isJudging={phase === "judging"}
        />
      );
    }
    return (
      <ArenaResultPanel
        result={result}
        agentA={agentA}
        agentB={agentB}
        onReset={handleReset}
      />
    );
  }

  return (
    <>
      {errorMessage && (
        <p role="alert" className="text-sm text-accent-red font-mono px-6 pt-4">
          {errorMessage}
        </p>
      )}
      <ArenaSetup
        agents={agents}
        selectedAgentAId={selectedAgentAId}
        selectedAgentBId={selectedAgentBId}
        selectedMode={selectedMode}
        topic={topic}
        modeOptions={ARENA_MODE_OPTIONS}
        topicPresets={ARENA_TOPICS[selectedMode]}
        canStart={canStart}
        onSelectAgentA={setSelectedAgentAId}
        onSelectAgentB={setSelectedAgentBId}
        onSelectMode={handleModeChange}
        onChangeTopic={setTopic}
        onStart={handleStart}
      />
    </>
  );
}
