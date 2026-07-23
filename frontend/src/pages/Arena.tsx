import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import ArenaMatch from "../components/arena/ArenaMatch";
import ArenaResultPanel from "../components/arena/ArenaResultPanel";
import ArenaSetup from "../components/arena/ArenaSetup";
import EmptyState from "../components/shared/EmptyState";
import { findItemById } from "../data/menuData";
import { useRunDebate, adaptArenaResult } from "../api/arenas";
import { useAgents } from "../api/agents";
import {
  ARENA_MODE_OPTIONS,
  ARENA_TOPICS,
  buildMockArenaResult,
  MOCK_ARENA_ROUNDS,
} from "../mocks/arena";
import type {
  ArenaConfig,
  ArenaMode,
  ArenaPhase,
  ArenaPresentationResult,
} from "../types/arena";

const TRANSCRIPT_INTERVAL_MS = 800;
const JUDGE_DELAY_MS = 1200;

/** Step 34b 竞技场页面：debate 走真实 API，interview/pitch 保留 Mock。 */
export default function Arena() {
  const { hash } = useLocation();
  const { data: agents = [] } = useAgents();
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const runDebate = useRunDebate();

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
      topic.trim() &&
      !runDebate.isPending,
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

  const handleStart = async () => {
    if (!canStart || !selectedAgentA || !selectedAgentB) return;
    setErrorMsg(null);

    // debate → 真实 API；interview/pitch → 保留 Mock
    if (selectedMode === "debate") {
      setPhase("running"); // 直接用 running 表示 loading（不展示逐条动画）
      try {
        const apiResult = await runDebate.mutateAsync({
          mode: "debate",
          agent_a_id: selectedAgentAId,
          agent_b_id: selectedAgentBId,
          topic,
          rounds: MOCK_ARENA_ROUNDS,
        });
        const presentation = adaptArenaResult(
          apiResult,
          { id: selectedAgentA.id, name: selectedAgentA.name },
          { id: selectedAgentB.id, name: selectedAgentB.name },
        );
        setResult(presentation);
        setVisibleTranscriptCount(presentation.transcript.length);
        setPhase("result");
      } catch (cause) {
        setErrorMsg(cause instanceof Error ? cause.message : "竞技运行失败");
        setPhase("setup");
      }
      return;
    }

    // interview / pitch → 保留 Mock
    const nextResult = buildMockArenaResult(config, selectedAgentA, selectedAgentB);
    setResult(nextResult);
    setVisibleTranscriptCount(0);
    setPhase("running");
  };

  const handleReset = () => {
    setPhase("setup");
    setResult(null);
    setVisibleTranscriptCount(0);
    setErrorMsg(null);
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

  // 辩论真实 API 加载中（phase=running 但 result 尚未返回）
  if (phase === "running" && !result && selectedMode === "debate") {
    return (
      <div className="min-h-full flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-pulse">⚔️</div>
          <h2 className="text-lg font-mono text-text-primary mb-2">
            辩论进行中…
          </h2>
          <p className="text-sm text-text-secondary font-mono">
            {selectedAgentA?.name} vs {selectedAgentB?.name}
          </p>
          <p className="text-xs text-text-secondary/60 font-mono mt-1">
            辩题：{topic}
          </p>
          <div className="mt-6 flex justify-center gap-1">
            <span className="w-2 h-2 rounded-full bg-accent-orange/60 animate-pulse" />
            <span className="w-2 h-2 rounded-full bg-accent-orange/40 animate-pulse [animation-delay:200ms]" />
            <span className="w-2 h-2 rounded-full bg-accent-orange/20 animate-pulse [animation-delay:400ms]" />
          </div>
        </div>
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
    <>
      {errorMsg && (
        <p role="alert" className="text-sm text-accent-red font-mono px-6 pt-4">
          {errorMsg}
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
        onSelectMode={handleSelectMode}
        onChangeTopic={setTopic}
        onStart={handleStart}
      />
    </>
  );
}

function parseArenaItemId(hash: string): number | null {
  if (!hash.startsWith("#item-")) return null;
  const itemId = Number.parseInt(hash.slice(6), 10);
  return Number.isNaN(itemId) ? null : itemId;
}
