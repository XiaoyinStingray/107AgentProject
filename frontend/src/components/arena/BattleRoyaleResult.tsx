import type {
  ArenaPresentationResult,
  ArenaTranscriptEntry,
} from "../../types/arena";
import Badge from "../shared/Badge";
import Card from "../shared/Card";
import StatusDot from "../shared/StatusDot";


interface BattleRoyaleResultProps {
  result: ArenaPresentationResult;
  onReset: () => void;
}

/** 展示大乱斗胜者、淘汰路径和逐阶段发言。 */
export default function BattleRoyaleResult({
  result,
  onReset,
}: BattleRoyaleResultProps) {
  const stages = buildBattleStages(result);
  const winnerName =
    result.participant_names[result.winner_id] ?? result.winner_id;

  return (
    <div className="min-h-full max-w-6xl mx-auto p-6 space-y-5 animate-slide-in motion-reduce:animate-none">
      <header className="text-center">
        <div className="flex justify-center mb-3">
          <StatusDot status="active" label="大乱斗结束" />
        </div>
        <p className="text-xs font-mono text-accent-orange">
          BATTLE ROYALE RESULT
        </p>
        <h1 className="text-2xl font-mono text-text-primary mt-2">
          最终胜者 · {winnerName}
        </h1>
        <p className="text-sm text-text-secondary mt-2">{result.topic}</p>
      </header>

      <Card>
        <h2 className="text-sm font-mono text-text-primary">淘汰路径</h2>
        <p className="text-xs text-text-secondary mt-2">
          每阶段独立评分；同轮按总分排序，同分时由裁判综合决胜。
        </p>
        <div className="space-y-5 mt-4">
          {stages.map((stage) => (
            <section key={stage.round}>
              <h3 className="text-xs font-mono text-accent-orange mb-2">
                第 {stage.round} 阶段 · {stage.entries.length} → {stage.survivors}
              </h3>
              <ol className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {stage.entries.map(({ entry, status, score }, index) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-3 rounded border border-border bg-bg-secondary p-3"
                  >
                    <Badge label={`#${entry.stage_rank ?? index + 1}`} />
                    <span className="font-mono text-sm text-text-primary">
                      {entry.speaker_name}
                    </span>
                    <span className="ml-auto text-xs font-mono text-text-secondary">
                      {score == null ? "分数未保存" : `本轮 ${score} / 40`}
                    </span>
                    <Badge
                      label={status}
                      variant={status === "冠军" ? "P1" : undefined}
                    />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-mono text-text-primary mb-3">
          阶段裁判结论
        </h2>
        <p className="whitespace-pre-line text-sm leading-relaxed text-text-secondary">
          {result.judge_reasoning}
        </p>
      </Card>

      <Card>
        <div className="flex items-center justify-between border-b border-border pb-3 mb-3">
          <h2 className="text-sm font-mono text-text-primary">完整阶段记录</h2>
          <span className="text-xs font-mono text-text-secondary">
            {result.transcript.length} 条发言
          </span>
        </div>
        <ol className="space-y-3">
          {result.transcript.map((entry) => (
            <li key={entry.id} className="rounded border border-border p-3">
              <div className="flex items-center gap-2">
                <Badge label={`阶段 ${entry.round}`} />
                <span className="text-xs font-mono text-accent-blue">
                  {entry.speaker_name}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-text-secondary mt-2">
                {entry.content}
              </p>
            </li>
          ))}
        </ol>
      </Card>

      <button
        type="button"
        onClick={onReset}
        className="w-full rounded border border-border bg-bg-card py-3 text-sm font-mono text-text-secondary hover:border-accent-orange/40 hover:text-accent-orange transition-colors"
      >
        返回大乱斗设置
      </button>
    </div>
  );
}

interface BattleStageEntry {
  entry: ArenaTranscriptEntry;
  status: "冠军" | "晋级" | "淘汰";
  score: number | null;
}

interface BattleStage {
  round: number;
  survivors: number;
  entries: BattleStageEntry[];
}

function buildBattleStages(result: ArenaPresentationResult): BattleStage[] {
  const rounds = [...new Set(result.transcript.map((entry) => entry.round))]
    .sort((left, right) => left - right);
  const finalRound = rounds[rounds.length - 1] ?? result.rounds;
  const lastRound = Object.fromEntries(
    result.participant_ids.map((agentId) => [
      agentId,
      Math.max(...result.transcript
        .filter((entry) => entry.speaker_id === agentId)
        .map((entry) => entry.round)),
    ]),
  );
  return rounds.map((round) => {
    const nextIds = new Set(result.transcript
      .filter((entry) => entry.round === round + 1)
      .map((entry) => entry.speaker_id));
    const rankedEntries = result.transcript
      .filter((entry) => entry.round === round)
      .sort((left, right) =>
        (left.stage_rank ?? 999) - (right.stage_rank ?? 999)
      );
    const uniqueEntries = [...new Map(
      rankedEntries.map((entry) => [entry.speaker_id, entry]),
    ).values()];
    const entries = uniqueEntries
      .map((entry) => {
        const advanced = entry.advanced ?? (
          round === finalRound
            ? entry.speaker_id === result.winner_id
            : nextIds.has(entry.speaker_id)
        );
        const status = advanced
          ? (round === finalRound ? "冠军" : "晋级")
          : "淘汰";
        const score = entry.stage_score ?? (
          lastRound[entry.speaker_id] === round
            ? result.scores[entry.speaker_id] ?? null
            : null
        );
        return { entry, status, score } as BattleStageEntry;
      });
    return {
      round,
      survivors: entries.filter((item) => item.status !== "淘汰").length,
      entries,
    };
  });
}
