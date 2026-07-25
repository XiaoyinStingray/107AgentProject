import type { ArenaScoreBreakdown as ScoreBreakdown } from "../../types/arena";
import { ARENA_SCORE_LABELS } from "../../constants/arena";

interface ArenaScoreBreakdownProps {
  score: ScoreBreakdown;
}

const SCORE_ROWS: Array<{
  key: keyof Omit<ScoreBreakdown, "total">;
  label: string;
  color: string;
}> = [
  { key: "argument_quality", label: ARENA_SCORE_LABELS.argument_quality, color: "bg-accent-blue" },
  { key: "expression", label: ARENA_SCORE_LABELS.expression, color: "bg-accent-purple" },
  { key: "adaptability", label: ARENA_SCORE_LABELS.adaptability, color: "bg-accent-orange" },
  { key: "character_consistency", label: ARENA_SCORE_LABELS.character_consistency, color: "bg-accent-green" },
];

/** 四项 0-10 分的竞技评分条。 */
export default function ArenaScoreBreakdown({ score }: ArenaScoreBreakdownProps) {
  return (
    <div className="space-y-2 mt-4" aria-label="多维评分">
      {SCORE_ROWS.map(({ key, label, color }) => {
        const value = score[key];
        return (
          <div key={key}>
            <div className="flex justify-between text-xs font-mono mb-1">
              <span className="text-text-secondary">{label}</span>
              <span className="text-text-primary">{value.toFixed(1)}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden bg-bg-secondary">
              <div
                className={`h-full rounded-full transition-all duration-700 motion-reduce:transition-none ${color}`}
                style={{ width: `${Math.min(100, value * 10)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
