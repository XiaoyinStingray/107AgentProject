/**
 * ScoreBar — Step 100b: 实时比分条（动画拉扯效果）。
 */

interface Props {
  labelA: string;
  labelB: string;
  scoreA: number;
  scoreB: number;
  maxScore?: number;
}

export default function ScoreBar({ labelA, labelB, scoreA, scoreB, maxScore = 300 }: Props) {
  const pctA = Math.min(100, (scoreA / maxScore) * 100);
  const pctB = Math.min(100, (scoreB / maxScore) * 100);

  return (
    <div className="space-y-2">
      {/* A bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-accent-blue w-16 shrink-0 truncate">{labelA}</span>
        <div className="flex-1 h-3 bg-bg-primary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-blue rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pctA}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-text-primary w-10 text-right">{scoreA}</span>
      </div>
      {/* B bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-accent-orange w-16 shrink-0 truncate">{labelB}</span>
        <div className="flex-1 h-3 bg-bg-primary rounded-full overflow-hidden">
          <div
            className="h-full bg-accent-orange rounded-full transition-all duration-500 ease-out"
            style={{ width: `${pctB}%` }}
          />
        </div>
        <span className="text-[10px] font-mono text-text-primary w-10 text-right">{scoreB}</span>
      </div>
    </div>
  );
}
