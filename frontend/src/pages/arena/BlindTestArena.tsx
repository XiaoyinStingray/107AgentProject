import { useEffect, useState } from "react";
import { useAgents } from "../../api/agents";
import { adaptArenaResult, useRunDuel } from "../../api/arenas";
import ArenaMatch from "../../components/arena/ArenaMatch";
import ArenaResultPanel from "../../components/arena/ArenaResultPanel";
import Badge from "../../components/shared/Badge";
import Card from "../../components/shared/Card";
import EmptyState from "../../components/shared/EmptyState";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import {
  ARENA_JUDGE_REPLAY_MS,
  ARENA_REPLAY_INTERVAL_MS,
} from "../../constants/arena";
import type {
  ArenaConfig,
  ArenaPhase,
  ArenaPresentationResult,
} from "../../types/arena";


/** #25 盲测模式：裁判评分时隐藏发言者身份，结果展示时再揭示。 */
export default function BlindTestArena() {
  const { data: agents = [] } = useAgents();
  const [selectedAgentAId, setSelectedAgentAId] = useState("");
  const [selectedAgentBId, setSelectedAgentBId] = useState("");
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState(3);
  const [result, setResult] = useState<ArenaPresentationResult | null>(null);
  const [phase, setPhase] = useState<ArenaPhase>("setup");
  const [visibleCount, setVisibleCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const runDuel = useRunDuel("blind_test");

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
    mode: "blind_test",
    topic,
    rounds,
  };
  const canStart = Boolean(
    agentA && agentB && agentA.id !== agentB.id && topic.trim() && !runDuel.isPending,
  );

  const handleStart = async () => {
    if (!canStart) return;
    setErrorMessage(null);
    try {
      const response = await runDuel.mutateAsync(config);
      setResult(adaptArenaResult(response));
      setVisibleCount(0);
      setPhase("running");
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "盲测运行失败");
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
      <div className="h-full p-6">
        <EmptyState
          title="至少需要两个 Agent"
          description="请先创建 Agent 再开始盲测。"
          tier="P2"
        />
      </div>
    );
  }

  if (runDuel.isPending) {
    return (
      <LoadingSpinner
        icon=""
        title="盲测进行中…裁判不知道选手身份"
        detail={`${agentA?.name} vs ${agentB?.name} · ${topic}`}
        fullscreen
      />
    );
  }

  return (
    <div className="min-h-full max-w-4xl mx-auto p-6 space-y-5 animate-fade-in motion-reduce:animate-none">
      <header>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs font-mono text-accent-orange">M4 / BLIND TEST</p>
          <Badge label="P2" variant="P2" />
        </div>
        <h1 className="text-2xl font-mono text-text-primary">盲测模式</h1>
        <p className="text-sm text-text-secondary mt-2">
          两位选手匿名辩论，裁判仅根据内容质量评分，结束后揭示身份。
        </p>
      </header>

      {errorMessage && (
        <p role="alert" className="text-sm text-accent-red font-mono">
          {errorMessage}
        </p>
      )}

      {phase === "setup" && (
        <Card>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <AgentSelect
                label="选手 A"
                value={selectedAgentAId}
                excludeId={selectedAgentBId}
                agents={agents}
                onChange={setSelectedAgentAId}
              />
              <AgentSelect
                label="选手 B"
                value={selectedAgentBId}
                excludeId={selectedAgentAId}
                agents={agents}
                onChange={setSelectedAgentBId}
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-secondary mb-2">
                辩论主题
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="输入辩论主题…"
                className="w-full rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono focus:border-accent-orange focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-text-secondary mb-2">
                轮数：{rounds}
              </label>
              <input
                type="range"
                min={1}
                max={5}
                value={rounds}
                onChange={(e) => setRounds(Number(e.target.value))}
                className="w-full accent-accent-orange"
              />
            </div>
            <button
              type="button"
              onClick={handleStart}
              disabled={!canStart}
              className="w-full rounded bg-accent-orange px-4 py-3 text-sm font-mono font-bold text-bg-primary disabled:opacity-40 hover:bg-accent-orange/80 transition-colors"
            >
              开始盲测
            </button>
          </div>
        </Card>
      )}

      {result && agentA && agentB && (phase === "running" || phase === "judging") && (
        <ArenaMatch
          config={config}
          agentA={agentA}
          agentB={agentB}
          currentRound={result.transcript.slice(0, visibleCount)[visibleCount - 1]?.round ?? 1}
          visibleTranscript={result.transcript.slice(0, visibleCount)}
          isJudging={phase === "judging"}
        />
      )}

      {result && agentA && agentB && phase === "result" && (
        <ArenaResultPanel
          result={result}
          agentA={agentA}
          agentB={agentB}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

function AgentSelect({
  label,
  value,
  excludeId,
  agents,
  onChange,
}: {
  label: string;
  value: string;
  excludeId: string;
  agents: { id: string; name: string }[];
  onChange: (id: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-mono text-text-secondary mb-2">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono focus:border-accent-orange focus:outline-none"
      >
        <option value="">选择 Agent…</option>
        {agents
          .filter((a) => a.id !== excludeId)
          .map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
      </select>
    </div>
  );
}
