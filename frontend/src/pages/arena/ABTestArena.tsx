import { useState } from "react";
import { useAgents } from "../../api/agents";
import { adaptArenaResult, useRunDuel } from "../../api/arenas";
import ArenaResultPanel from "../../components/arena/ArenaResultPanel";
import Badge from "../../components/shared/Badge";
import Card from "../../components/shared/Card";
import EmptyState from "../../components/shared/EmptyState";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import { ARENA_MODE_OPTIONS, ARENA_TOPICS } from "../../constants/arena";
import type {
  ArenaPresentationResult,
  DuelArenaMode,
} from "../../types/arena";


/** 根据两组模式生成示例主题建议。 */
function getExampleTopics(modeA: DuelArenaMode, modeB: DuelArenaMode): string[] {
  const topicsA = ARENA_TOPICS[modeA] ?? [];
  const topicsB = ARENA_TOPICS[modeB] ?? [];
  const combined = [...topicsA, ...topicsB];
  return [...new Set(combined)].slice(0, 4);
}


type ABPhase = "setup" | "running" | "result";

interface ABConfig {
  modeA: DuelArenaMode;
  modeB: DuelArenaMode;
  agentA1Id: string;
  agentA2Id: string;
  agentB1Id: string;
  agentB2Id: string;
  topic: string;
  rounds: number;
}


/** #28 A/B 测试：同主题两组不同配置，运行后对比结果。 */
export default function ABTestArena() {
  const { data: agents = [] } = useAgents();
  const [phase, setPhase] = useState<ABPhase>("setup");
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState(3);
  const [modeA, setModeA] = useState<DuelArenaMode>("debate");
  const [modeB, setModeB] = useState<DuelArenaMode>("debate");
  const [agentA1Id, setAgentA1Id] = useState("");
  const [agentA2Id, setAgentA2Id] = useState("");
  const [agentB1Id, setAgentB1Id] = useState("");
  const [agentB2Id, setAgentB2Id] = useState("");
  const [resultA, setResultA] = useState<ArenaPresentationResult | null>(null);
  const [resultB, setResultB] = useState<ArenaPresentationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const runA = useRunDuel(modeA);
  const runB = useRunDuel(modeB);

  const handleStart = async () => {
    if (!topic.trim() || !agentA1Id || !agentA2Id || !agentB1Id || !agentB2Id) return;
    setPhase("running");
    setErrorMessage(null);

    try {
      const [resA, resB] = await Promise.all([
        runA.mutateAsync({
          agent_a_id: agentA1Id,
          agent_b_id: agentA2Id,
          mode: modeA,
          topic: topic.trim(),
          rounds,
        }),
        runB.mutateAsync({
          agent_a_id: agentB1Id,
          agent_b_id: agentB2Id,
          mode: modeB,
          topic: topic.trim(),
          rounds,
        }),
      ]);
      setResultA(adaptArenaResult(resA));
      setResultB(adaptArenaResult(resB));
      setPhase("result");
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "A/B 测试运行失败");
      setPhase("setup");
    }
  };

  const handleReset = () => {
    setPhase("setup");
    setResultA(null);
    setResultB(null);
    setErrorMessage(null);
    runA.reset();
    runB.reset();
  };

  if (agents.length < 4) {
    return (
      <div className="h-full p-6">
        <EmptyState
          title="至少需要四个 Agent"
          description="A/B 测试需要两组不同的 Agent 对，请先创建更多 Agent。"
          tier="P2"
        />
      </div>
    );
  }

  const agentA1 = agents.find((a) => a.id === agentA1Id);
  const agentA2 = agents.find((a) => a.id === agentA2Id);
  const agentB1 = agents.find((a) => a.id === agentB1Id);
  const agentB2 = agents.find((a) => a.id === agentB2Id);

  if (phase === "running") {
    return (
      <LoadingSpinner
        icon=""
        title="A/B 测试运行中…"
        detail={`主题：${topic} · 两组同时运行`}
        fullscreen
      />
    );
  }

  return (
    <div className="min-h-full max-w-6xl mx-auto p-6 space-y-5 animate-fade-in motion-reduce:animate-none">
      <header>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs font-mono text-accent-orange">M4 / A-B TEST</p>
          <Badge label="P2" variant="P2" />
        </div>
        <h1 className="text-2xl font-mono text-text-primary">A/B 测试</h1>
        <p className="text-sm text-text-secondary mt-2">
          相同主题下，对比两组不同 Agent 组合或模式的竞技表现。
        </p>
      </header>

      {errorMessage && (
        <p role="alert" className="text-sm text-accent-red font-mono">
          {errorMessage}
        </p>
      )}

      {phase === "setup" && (
        <>
          <Card>
            <label className="block text-xs font-mono text-text-secondary mb-2">
              共同主题
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="输入测试主题…"
              className="w-full rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono focus:border-accent-orange focus:outline-none"
            />
            <div className="flex flex-wrap gap-2 mt-3">
              {getExampleTopics(modeA, modeB).map((example, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTopic(example)}
                  className="px-3 py-1 text-xs font-mono rounded border border-border bg-bg-secondary text-text-secondary hover:border-accent-orange hover:text-accent-orange transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GroupConfig
              label="A 组"
              accent="text-accent-blue"
              mode={modeA}
              agent1Id={agentA1Id}
              agent2Id={agentA2Id}
              agents={agents}
              onModeChange={setModeA}
              onAgent1Change={setAgentA1Id}
              onAgent2Change={setAgentA2Id}
            />
            <GroupConfig
              label="B 组"
              accent="text-accent-purple"
              mode={modeB}
              agent1Id={agentB1Id}
              agent2Id={agentB2Id}
              agents={agents}
              onModeChange={setModeB}
              onAgent1Change={setAgentB1Id}
              onAgent2Change={setAgentB2Id}
            />
          </div>

          <Card>
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
          </Card>

          <button
            type="button"
            onClick={handleStart}
            disabled={
              !topic.trim() ||
              !agentA1Id ||
              !agentA2Id ||
              !agentB1Id ||
              !agentB2Id ||
              runA.isPending ||
              runB.isPending
            }
            className="w-full rounded bg-accent-orange px-4 py-3 text-sm font-mono font-bold text-bg-primary disabled:opacity-40 hover:bg-accent-orange/80 transition-colors"
          >
            同时运行 A/B 两组
          </button>
        </>
      )}

      {phase === "result" && resultA && resultB && agentA1 && agentA2 && agentB1 && agentB2 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h2 className="text-lg font-mono text-accent-blue mb-3">A 组结果</h2>
              <ArenaResultPanel
                result={resultA}
                agentA={agentA1}
                agentB={agentA2}
                onReset={() => {}}
              />
            </div>
            <div>
              <h2 className="text-lg font-mono text-accent-purple mb-3">B 组结果</h2>
              <ArenaResultPanel
                result={resultB}
                agentA={agentB1}
                agentB={agentB2}
                onReset={() => {}}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="w-full rounded border border-border bg-bg-card py-3 text-sm font-mono text-text-secondary hover:border-accent-orange/40 hover:text-accent-orange transition-colors"
          >
            重新测试
          </button>
        </>
      )}
    </div>
  );
}

function GroupConfig({
  label,
  accent,
  mode,
  agent1Id,
  agent2Id,
  agents,
  onModeChange,
  onAgent1Change,
  onAgent2Change,
}: {
  label: string;
  accent: string;
  mode: DuelArenaMode;
  agent1Id: string;
  agent2Id: string;
  agents: { id: string; name: string }[];
  onModeChange: (mode: DuelArenaMode) => void;
  onAgent1Change: (id: string) => void;
  onAgent2Change: (id: string) => void;
}) {
  return (
    <Card>
      <h3 className={`text-sm font-mono font-bold ${accent} mb-3`}>{label}</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-mono text-text-secondary mb-1">模式</label>
          <select
            value={mode}
            onChange={(e) => onModeChange(e.target.value as DuelArenaMode)}
            className="w-full rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono"
          >
            {ARENA_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <AgentPicker label="选手 1" value={agent1Id} excludeId={agent2Id} agents={agents} onChange={onAgent1Change} />
        <AgentPicker label="选手 2" value={agent2Id} excludeId={agent1Id} agents={agents} onChange={onAgent2Change} />
      </div>
    </Card>
  );
}

function AgentPicker({
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
      <label className="block text-xs font-mono text-text-secondary mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono"
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
