import type { AgentResponse } from "../../types/agent";
import type {
  ArenaPresentationResult,
  ArenaScoreBreakdown as ScoreBreakdown,
} from "../../types/arena";
import Badge from "../shared/Badge";
import Card from "../shared/Card";
import StatusDot from "../shared/StatusDot";
import ArenaScoreBreakdown from "./ArenaScoreBreakdown";

interface ArenaResultPanelProps {
  result: ArenaPresentationResult;
  agentA: AgentResponse;
  agentB: AgentResponse;
  onReset: () => void;
}

/** 竞技结束后的胜者、评分、理由与完整记录骨架。 */
export default function ArenaResultPanel({
  result,
  agentA,
  agentB,
  onReset,
}: ArenaResultPanelProps) {
  const winner = result.winner_id === agentA.id ? agentA : agentB;

  return (
    <div className="min-h-full max-w-5xl mx-auto p-6 space-y-5 animate-slide-in motion-reduce:animate-none">
      <header className="text-center">
        <div className="flex justify-center mb-3">
          <StatusDot status="active" label="裁判评分完成" />
        </div>
        <p className="text-xs font-mono text-accent-orange">ARENA RESULT</p>
        <h1 className="text-2xl font-mono text-text-primary mt-2">
          胜者 · {winner.name}
        </h1>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ScoreCard
          agent={agentA}
          score={result.scores[agentA.id] ?? 0}
          breakdown={result.score_breakdowns[agentA.id]}
          winner={winner.id === agentA.id}
          accentClass="text-accent-blue"
        />
        <ScoreCard
          agent={agentB}
          score={result.scores[agentB.id] ?? 0}
          breakdown={result.score_breakdowns[agentB.id]}
          winner={winner.id === agentB.id}
          accentClass="text-accent-purple"
        />
      </div>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-mono text-text-primary">裁判理由</h2>
          <Badge label="0–40" variant="P1" />
        </div>
        <p className="text-sm leading-relaxed text-text-secondary">
          {result.judge_reasoning}
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
          <h2 className="text-sm font-mono text-text-primary">完整比赛记录</h2>
          <span className="text-xs font-mono text-text-secondary">
            {result.transcript.length} 条发言
          </span>
        </div>
        <ol className="space-y-3">
          {result.transcript.map((entry) => (
            <li key={entry.id} className="flex gap-3 text-sm">
              <Badge label={`R${entry.round}`} />
              <div>
                <p className="font-mono text-text-primary">{entry.speaker_name}</p>
                <p className="text-text-secondary mt-1 leading-relaxed">{entry.content}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <button
        type="button"
        onClick={onReset}
        className="w-full rounded border border-border bg-bg-card py-3 text-sm font-mono text-text-secondary hover:border-accent-orange/40 hover:text-accent-orange transition-colors"
      >
        返回设置
      </button>
    </div>
  );
}

interface ScoreCardProps {
  agent: AgentResponse;
  score: number;
  winner: boolean;
  breakdown?: ScoreBreakdown;
  accentClass: string;
}

function ScoreCard({
  agent,
  score,
  winner,
  breakdown,
  accentClass,
}: ScoreCardProps) {
  return (
    <Card className={winner ? "border-accent-orange/50" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-mono ${accentClass}`}>{agent.persona.mbti}</p>
          <h2 className="text-lg font-mono text-text-primary mt-1">{agent.name}</h2>
        </div>
        {winner && <Badge label="WINNER" variant="P1" />}
      </div>
      <p className="text-3xl font-mono text-text-primary mt-4">
        {score}
        <span className="text-sm text-text-secondary"> / 40</span>
      </p>
      {breakdown && <ArenaScoreBreakdown score={breakdown} />}
    </Card>
  );
}
