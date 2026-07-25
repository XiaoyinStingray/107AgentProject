import type { AgentResponse } from "../../types/agent";
import type { ArenaConfig, ArenaTranscriptEntry } from "../../types/arena";
import Badge from "../shared/Badge";
import Card from "../shared/Card";
import StatusDot from "../shared/StatusDot";

interface ArenaMatchProps {
  config: ArenaConfig;
  agentA: AgentResponse;
  agentB: AgentResponse;
  currentRound: number;
  visibleTranscript: ArenaTranscriptEntry[];
  isJudging: boolean;
}

/** 收到完整结果后，逐条呈现比赛记录和裁判汇总。 */
export default function ArenaMatch({
  config,
  agentA,
  agentB,
  currentRound,
  visibleTranscript,
  isJudging,
}: ArenaMatchProps) {
  return (
    <div className="min-h-full max-w-5xl mx-auto p-6 space-y-4 animate-fade-in motion-reduce:animate-none">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-xs font-mono text-accent-orange">M4 / MATCH REPLAY</p>
          <h1 className="text-xl font-mono text-text-primary mt-1">{config.topic}</h1>
          <p className="text-xs text-text-secondary mt-2">
            比赛已在后台完成，正在逐条呈现记录；此处不是实时生成。
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Badge label={`ROUND ${currentRound}/${config.rounds}`} variant="P1" />
          <StatusDot
            status="thinking"
            label={isJudging ? "正在呈现裁判汇总" : "正在呈现比赛记录"}
          />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
        <CompetitorCard agent={agentA} label="AGENT A" accentClass="text-accent-blue" />
        <Card className="flex items-center justify-center">
          <span className="text-2xl font-mono text-accent-orange">VS</span>
        </Card>
        <CompetitorCard agent={agentB} label="AGENT B" accentClass="text-accent-purple" />
      </div>

      <Card className="space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-sm font-mono text-text-primary">MATCH TRANSCRIPT</h2>
          <span className="text-xs font-mono text-text-secondary">
            {visibleTranscript.length} 条发言
          </span>
        </div>

        {visibleTranscript.length === 0 ? (
          <p className="py-8 text-center text-sm font-mono text-text-secondary">
            正在准备比赛记录…
          </p>
        ) : (
          <ol className="space-y-3" aria-label="竞技发言记录">
            {visibleTranscript.map((entry) => {
              const isAgentA = entry.speaker_id === agentA.id;
              return (
                <li
                  key={entry.id}
                  className={`rounded border p-3 animate-slide-in motion-reduce:animate-none ${
                    isAgentA
                      ? "border-accent-blue/30 bg-accent-blue/5"
                      : "border-accent-purple/30 bg-accent-purple/5"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Badge label={`ROUND ${entry.round}`} />
                    <span
                      className={`text-xs font-mono ${
                        isAgentA ? "text-accent-blue" : "text-accent-purple"
                      }`}
                    >
                      {entry.speaker_name}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-text-primary">{entry.content}</p>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {isJudging && (
        <Card className="text-center animate-fade-in motion-reduce:animate-none">
          <p className="text-2xl animate-pulse motion-reduce:animate-none" aria-hidden="true">
            🧐
          </p>
          <p className="text-sm font-mono text-text-secondary mt-2">
            正在呈现裁判四项评分汇总…
          </p>
        </Card>
      )}
    </div>
  );
}

interface CompetitorCardProps {
  agent: AgentResponse;
  label: string;
  accentClass: string;
}

function CompetitorCard({ agent, label, accentClass }: CompetitorCardProps) {
  return (
    <Card>
      <p className={`text-xs font-mono ${accentClass}`}>{label}</p>
      <p className="text-lg font-mono text-text-primary mt-2">{agent.name}</p>
      <p className="text-xs text-text-secondary mt-1">{agent.persona.mbti}</p>
    </Card>
  );
}
