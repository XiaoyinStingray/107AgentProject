import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import ArenaMatch from "../components/arena/ArenaMatch";
import ArenaResultPanel from "../components/arena/ArenaResultPanel";
import ArenaSetup from "../components/arena/ArenaSetup";
import EmptyState from "../components/shared/EmptyState";
import { findItemById } from "../data/menuData";
import { MOCK_AGENTS } from "../mocks/agents";
import {
  ARENA_MODE_OPTIONS,
  ARENA_TOPICS,
  buildMockArenaResult,
  MOCK_ARENA_ROUNDS,
} from "../mocks/arena";
import { useAgentStore } from "../stores/useAgentStore";
import type { AgentResponse } from "../types/agent";
import type {
  ArenaConfig,
  ArenaMode,
  ArenaPhase,
  ArenaPresentationResult,
} from "../types/arena";

const TRANSCRIPT_INTERVAL_MS = 800;
const JUDGE_DELAY_MS = 1200;

/** Step 22 竞技场页面：本地状态编排与 M4 hash 分流。 */
export default function Arena() {
  const { hash } = useLocation();
  const agents = useAvailableAgents();
  const itemId = parseArenaItemId(hash);
  const selectedMenuItem = itemId === null ? undefined : findItemById(itemId);

  const [phase, setPhase] = useState<ArenaPhase>("setup");
  const [selectedAgentAId, setSelectedAgentAId] = useState(
    agents[0]?.id ?? "",
  );
  const [selectedAgentBId, setSelectedAgentBId] = useState(
    agents[1]?.id ?? "",
  );
  const [selectedMode, setSelectedMode] = useState<ArenaMode>("debate");
  const [topic, setTopic] = useState(
    ARENA_MODE_OPTIONS[0]?.default_topic ?? "",
  );
  const [result, setResult] = useState<ArenaPresentationResult | null>(null);
  const [visibleTranscriptCount, setVisibleTranscriptCount] = useState(0);

  const selectedAgentA = agents.find(
    (agent) => agent.id === selectedAgentAId,
  );
  const selectedAgentB = agents.find(
    (agent) => agent.id === selectedAgentBId,
  );
  const config: ArenaConfig = {
    agent_a_id: selectedAgentAId,
    agent_b_id: selectedAgentBId,
    mode: selectedMode,
    topic,
    rounds: MOCK_ARENA_ROUNDS,
  };
  const canStart = Boolean(
    selectedAgentA &&
      selectedAgentB &&
      selectedAgentA.id !== selectedAgentB.id &&
      topic.trim(),
  );
  const visibleTranscript =
    result?.transcript.slice(0, visibleTranscriptCount) ?? [];
  const latestEntry = visibleTranscript[visibleTranscript.length - 1];
  const currentRound = latestEntry?.round ?? 1;

  useEffect(() => {
    if (itemId === null || itemId === 22) return;
    setPhase("setup");
    setResult(null);
    setVisibleTranscriptCount(0);
  }, [itemId]);

  useEffect(() => {
    if (phase !== "running" || !result) return;

    const timer = window.setTimeout(() => {
      if (visibleTranscriptCount < result.transcript.length) {
        setVisibleTranscriptCount((count) => count + 1);
        return;
      }
      setPhase("judging");
    }, TRANSCRIPT_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [phase, result, visibleTranscriptCount]);

  useEffect(() => {
    if (phase !== "judging") return;
    const timer = window.setTimeout(() => setPhase("result"), JUDGE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const handleSelectMode = (mode: ArenaMode) => {
    setSelectedMode(mode);
    const option = ARENA_MODE_OPTIONS.find((item) => item.value === mode);
    if (option) setTopic(option.default_topic);
  };

  const handleStart = () => {
    if (!canStart || !selectedAgentA || !selectedAgentB) return;
    const nextResult = buildMockArenaResult(config, selectedAgentA, selectedAgentB);
    setResult(nextResult);
    setVisibleTranscriptCount(0);
    setPhase("running");
  };

  const handleReset = () => {
    setPhase("setup");
    setResult(null);
    setVisibleTranscriptCount(0);
  };

  if (itemId !== null && itemId !== 22) {
    const isArenaItem = selectedMenuItem?.sectionTitle === "M4 竞技场";
    return (
      <div className="h-full p-6 animate-fade-in motion-reduce:animate-none">
        <EmptyState
          title={
            isArenaItem
              ? `${selectedMenuItem.emoji} ${selectedMenuItem.label}`
              : "竞技场功能不存在"
          }
          description={
            isArenaItem
              ? "当前保留菜单入口，不在 Step 22 实现真实逻辑。"
              : "请从 M4 竞技场菜单中选择功能。"
          }
          tier={isArenaItem ? selectedMenuItem.priority : undefined}
        />
      </div>
    );
  }

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

  if (
    (phase === "running" || phase === "judging") &&
    result &&
    selectedAgentA &&
    selectedAgentB
  ) {
    return (
      <ArenaMatch
        config={config}
        agentA={selectedAgentA}
        agentB={selectedAgentB}
        currentRound={currentRound}
        visibleTranscript={visibleTranscript}
        isJudging={phase === "judging"}
      />
    );
  }

  if (
    phase === "result" &&
    result &&
    selectedAgentA &&
    selectedAgentB
  ) {
    return (
      <ArenaResultPanel
        result={result}
        agentA={selectedAgentA}
        agentB={selectedAgentB}
        onReset={handleReset}
      />
    );
  }

  return (
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
      onSelectMode={handleSelectMode}
      onChangeTopic={setTopic}
      onStart={handleStart}
    />
  );
}

function useAvailableAgents(): AgentResponse[] {
  const createdAgents = useAgentStore((state) => state.agents);

  return useMemo(() => {
    const byId = new Map<string, AgentResponse>();
    [...MOCK_AGENTS, ...createdAgents].forEach((agent) => {
      byId.set(agent.id, agent);
    });
    return [...byId.values()];
  }, [createdAgents]);
}

function parseArenaItemId(hash: string): number | null {
  if (!hash.startsWith("#item-")) return null;
  const itemId = Number.parseInt(hash.slice(6), 10);
  return Number.isNaN(itemId) ? null : itemId;
}
