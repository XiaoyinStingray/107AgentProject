import { useEffect, useState } from "react";
import { useAgents } from "../../api/agents";
import { useArenas } from "../../api/arenas";
import { ARENA_SCORE_LABELS } from "../../constants/arena";
import Badge from "../../components/shared/Badge";
import Card from "../../components/shared/Card";
import EmptyState from "../../components/shared/EmptyState";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import type { ArenaApiResult } from "../../types/arena";


/** #26 复盘对比：选择一个 Agent 的两场历史比赛并列查看。 */
export default function ArenaComparisonView() {
  const { data: agents = [] } = useAgents();
  const [agentId, setAgentId] = useState("");
  const { data: arenas = [], isLoading, error } = useArenas(
    agentId || undefined,
  );
  const [leftId, setLeftId] = useState("");
  const [rightId, setRightId] = useState("");

  useEffect(() => {
    if (agents.length && !agents.some((agent) => agent.id === agentId)) {
      setAgentId(agents[0]!.id);
    }
  }, [agents, agentId]);

  useEffect(() => {
    if (arenas.length < 2) {
      setLeftId("");
      setRightId("");
      return;
    }
    const ids = new Set(arenas.map((arena) => arena.id));
    const nextLeft = ids.has(leftId) ? leftId : arenas[0]!.id;
    const nextRight = (
      ids.has(rightId) && rightId !== nextLeft
    ) ? rightId : arenas.find((arena) => arena.id !== nextLeft)!.id;
    if (nextLeft !== leftId) setLeftId(nextLeft);
    if (nextRight !== rightId) setRightId(nextRight);
  }, [arenas, leftId, rightId]);

  const left = arenas.find((arena) => arena.id === leftId);
  const right = arenas.find((arena) => arena.id === rightId);

  if (agents.length === 0) {
    return (
      <div className="h-full p-6">
        <EmptyState
          title="暂无可复盘 Agent"
          description="请先创建 Agent 并完成至少两场竞技。"
          tier="P2"
        />
      </div>
    );
  }

  return (
    <div className="min-h-full max-w-6xl mx-auto p-6 space-y-5 animate-fade-in motion-reduce:animate-none">
      <header>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs font-mono text-accent-orange">
            M4 / REVIEW COMPARISON
          </p>
          <Badge label="P2" variant="P2" />
        </div>
        <h1 className="text-2xl font-mono text-text-primary">竞技复盘对比</h1>
      </header>

      <Card>
        <label
          htmlFor="comparison-agent"
          className="block text-xs font-mono text-text-secondary mb-2"
        >
          选择要复盘的 Agent
        </label>
        <select
          id="comparison-agent"
          value={agentId}
          onChange={(event) => setAgentId(event.target.value)}
          className="w-full rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono focus:border-accent-orange focus:outline-none"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </Card>

      {isLoading && (
        <LoadingSpinner icon="🔄" title="正在读取竞技历史…" />
      )}
      {error && (
        <p role="alert" className="text-sm font-mono text-accent-red">
          {error instanceof Error ? error.message : "竞技历史读取失败"}
        </p>
      )}
      {!isLoading && !error && arenas.length < 2 && (
        <EmptyState
          title="至少需要两场历史记录"
          description="让该 Agent 再参加竞技后即可进行两列对比。"
          tier="P2"
        />
      )}
      {arenas.length >= 2 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HistoryPicker
              label="对比 A"
              value={leftId}
              disabledId={rightId}
              arenas={arenas}
              onChange={setLeftId}
            />
            <HistoryPicker
              label="对比 B"
              value={rightId}
              disabledId={leftId}
              arenas={arenas}
              onChange={setRightId}
            />
          </div>
          {left && right && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ComparisonCard arena={left} agentId={agentId} />
              <ComparisonCard arena={right} agentId={agentId} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface HistoryPickerProps {
  label: string;
  value: string;
  disabledId: string;
  arenas: ArenaApiResult[];
  onChange: (id: string) => void;
}

function HistoryPicker({
  label,
  value,
  disabledId,
  arenas,
  onChange,
}: HistoryPickerProps) {
  return (
    <Card>
      <label className="block text-xs font-mono text-text-secondary">
        {label}
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="block w-full mt-2 rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono"
        >
          {arenas.map((arena) => (
            <option
              key={arena.id}
              value={arena.id}
              disabled={arena.id === disabledId}
            >
              {arena.topic} · {arena.created_at.slice(0, 10)}
            </option>
          ))}
        </select>
      </label>
    </Card>
  );
}

function ComparisonCard({
  arena,
  agentId,
}: {
  arena: ArenaApiResult;
  agentId: string;
}) {
  const won = arena.winner_id === agentId;
  const opponents = arena.participant_ids
    .filter((id) => id !== agentId)
    .map((id) => arena.participant_names[id] ?? id)
    .join("、");
  const breakdown = arena.score_breakdown[agentId] ?? {};
  const keySpeech = arena.transcript.find(
    (entry) => entry.speaker_id === agentId,
  );
  return (
    <Card className={won ? "border-accent-green/40" : ""}>
      <div className="flex items-center gap-2">
        <Badge label={won ? "胜利" : "未胜"} variant={won ? "P1" : undefined} />
        <span className="text-xs font-mono text-text-secondary">{arena.mode}</span>
      </div>
      <h2 className="text-base font-mono text-text-primary mt-3">{arena.topic}</h2>
      <p className="text-xs text-text-secondary mt-2">对手：{opponents}</p>
      <p className="text-3xl font-mono text-accent-orange mt-4">
        {arena.scores[agentId] ?? 0}
        <span className="text-sm text-text-secondary"> / 40</span>
      </p>
      <dl className="space-y-2 mt-4">
        {Object.entries(breakdown).map(([key, value]) => (
          <div key={key} className="flex justify-between text-xs font-mono">
            <dt className="text-text-secondary">{ARENA_SCORE_LABELS[key] ?? key}</dt>
            <dd className="text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm leading-relaxed text-text-secondary mt-4">
        {arena.judge_reasoning}
      </p>
      {keySpeech && (
        <blockquote className="border-l-2 border-accent-blue/40 pl-3 mt-4 text-xs text-text-secondary">
          {keySpeech.content}
        </blockquote>
      )}
    </Card>
  );
}
