import { useEffect, useState } from "react";
import { useAgents } from "../../api/agents";
import { adaptArenaResult, useRunBattleRoyale } from "../../api/arenas";
import BattleRoyaleResult from "../../components/arena/BattleRoyaleResult";
import Badge from "../../components/shared/Badge";
import Card from "../../components/shared/Card";
import EmptyState from "../../components/shared/EmptyState";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import {
  BATTLE_ROYALE_TOPICS,
  MAX_BATTLE_ROYALE_AGENTS,
  MIN_BATTLE_ROYALE_AGENTS,
} from "../../constants/arena";
import type { ArenaPresentationResult } from "../../types/arena";


/** #23 大乱斗：6–8 人自由竞争并逐阶段淘汰。 */
export default function BattleRoyaleArena() {
  const { data: agents = [] } = useAgents();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [topic, setTopic] = useState(BATTLE_ROYALE_TOPICS[0] ?? "");
  const [result, setResult] = useState<ArenaPresentationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const runBattle = useRunBattleRoyale();

  useEffect(() => {
    setSelectedIds((current) => {
      const available = new Set(agents.map((agent) => agent.id));
      const valid = current.filter((id) => available.has(id));
      if (valid.length > 0 || agents.length < MIN_BATTLE_ROYALE_AGENTS) {
        return valid;
      }
      return agents
        .slice(0, MIN_BATTLE_ROYALE_AGENTS)
        .map((agent) => agent.id);
    });
  }, [agents]);

  const canStart = (
    selectedIds.length >= MIN_BATTLE_ROYALE_AGENTS &&
    selectedIds.length <= MAX_BATTLE_ROYALE_AGENTS &&
    Boolean(topic.trim()) &&
    !runBattle.isPending
  );

  const toggleAgent = (agentId: string) => {
    setSelectedIds((current) => {
      if (current.includes(agentId)) {
        return current.filter((id) => id !== agentId);
      }
      if (current.length >= MAX_BATTLE_ROYALE_AGENTS) return current;
      return [...current, agentId];
    });
  };

  const handleStart = async () => {
    if (!canStart) return;
    setErrorMessage(null);
    try {
      const response = await runBattle.mutateAsync({
        agent_ids: selectedIds,
        topic: topic.trim(),
      });
      setResult(adaptArenaResult(response));
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error ? cause.message : "大乱斗运行失败",
      );
    }
  };

  const handleReset = () => {
    setResult(null);
    setErrorMessage(null);
    runBattle.reset();
  };

  if (runBattle.isPending) {
    return (
      <LoadingSpinner
        icon="🏟️"
        title="大乱斗进行中…"
        detail={`${selectedIds.length} 位 Agent 正在分阶段竞争 · ${topic}`}
        fullscreen
      />
    );
  }

  if (result) {
    return <BattleRoyaleResult result={result} onReset={handleReset} />;
  }

  return (
    <div className="min-h-full max-w-6xl mx-auto p-6 space-y-6 animate-fade-in motion-reduce:animate-none">
      <header>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs font-mono text-accent-orange">
            M4 / BATTLE ROYALE
          </p>
          <Badge label="P2" variant="P2" />
        </div>
        <h1 className="text-2xl font-mono text-text-primary">Agent 大乱斗</h1>
        <p className="text-sm text-text-secondary mt-2">
          选择 6–8 位 Agent。每阶段全员自由陈述，裁判保留排名前一半。
        </p>
      </header>

      {agents.length < MIN_BATTLE_ROYALE_AGENTS ? (
        <EmptyState
          title={`还需要 ${MIN_BATTLE_ROYALE_AGENTS - agents.length} 个 Agent`}
          description="请先在铸造厂创建足够参赛者；Mock 模式也支持创建新 Agent。"
          tier="P2"
        />
      ) : (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-mono text-text-primary">选择参赛者</h2>
            <Badge label={`${selectedIds.length} / 6–8`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {agents.map((agent) => {
              const selected = selectedIds.includes(agent.id);
              return (
                <button
                  key={agent.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleAgent(agent.id)}
                  className={`rounded border p-3 text-left transition-colors ${
                    selected
                      ? "border-accent-orange/60 bg-accent-orange/10"
                      : "border-border bg-bg-secondary hover:border-accent-orange/30"
                  }`}
                >
                  <span className="font-mono text-sm text-text-primary">
                    {agent.name}
                  </span>
                  <span className="block text-xs text-text-secondary mt-1">
                    {agent.persona.mbti}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="text-sm font-mono text-text-primary">竞争主题</h2>
        <div className="flex flex-wrap gap-2 mt-3">
          {BATTLE_ROYALE_TOPICS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setTopic(preset)}
              className="rounded border border-border bg-bg-secondary px-3 py-2 text-xs font-mono text-text-secondary hover:border-accent-blue/40"
            >
              {preset}
            </button>
          ))}
        </div>
        <input
          aria-label="大乱斗主题"
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          className="w-full mt-3 rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono focus:border-accent-orange focus:outline-none"
        />
      </Card>

      {errorMessage && (
        <p role="alert" className="text-sm text-accent-red font-mono">
          {errorMessage}
        </p>
      )}
      <button
        type="button"
        disabled={!canStart}
        onClick={handleStart}
        className="w-full rounded border border-accent-orange/50 bg-accent-orange/10 py-3 text-sm font-mono text-accent-orange hover:bg-accent-orange/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        开始大乱斗
      </button>
    </div>
  );
}
