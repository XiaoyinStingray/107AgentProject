import { useState } from "react";
import { useLearningCurve, useScoreTeam, type ScoreResult } from "../../api/teams";
import Card from "../../components/shared/Card";

interface Props {
  teamId: string | null;
}

const DIM_LABELS: Record<string, string> = {
  completeness: "完整性", innovation: "创新性", feasibility: "可行性",
  clarity: "清晰度", collaboration: "协作", depth: "深度",
  practicality: "实用性", creativity: "创造力",
};

export default function LearningCurve({ teamId }: Props) {
  const { data } = useLearningCurve(teamId);
  const scoreTeam = useScoreTeam();
  const [score, setScore] = useState<ScoreResult | null>(null);

  if (!teamId || !data || data.points.length < 1) return null;

  const { points, trend, total_plans } = data;

  return (
    <Card>
      <div className="text-xs font-mono text-text-secondary mb-2 flex items-center justify-between">
        <span>📈 学习画像 <span className="ml-1">{trend}</span></span>
        <button
          type="button" disabled={scoreTeam.isPending}
          onClick={async () => {
            try { setScore(await scoreTeam.mutateAsync({ teamId, task: data.latest_task || "" })); }
            catch {}
          }}
          className="px-2 py-0.5 text-[10px] font-mono rounded border border-accent-orange/40 text-accent-orange hover:bg-accent-orange/10 disabled:opacity-30"
        >
          {scoreTeam.isPending ? "评分中…" : "📊 LLM 多维评分"}
        </button>
      </div>

      {/* 历史趋势（如有多次） */}
      {points.length > 1 && (
        <div className="flex items-end gap-1 h-12 mb-2">
          {points.map((p) => (
            <div key={p.index} className="flex-1 flex flex-col items-center" title={`${p.task}: ${p.completion_pct}%`}>
              <div className="w-full rounded-t bg-accent-green/40" style={{ height: `${Math.max(4, p.completion_pct)}%` }} />
              <span className="text-[8px] font-mono text-text-secondary/30 mt-0.5">{p.index}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] font-mono text-text-secondary/40 mb-2">
        {total_plans} 次任务 · {trend}
      </div>

      {/* LLM 评分结果 */}
      {score && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-accent-orange">{score.overall}/10</span>
            <span className="text-xs font-mono text-text-secondary">{score.summary}</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {Object.entries(score.scores).map(([k, v]) => (
              <div key={k} className="flex justify-between text-[10px] font-mono">
                <span className="text-text-secondary">{DIM_LABELS[k] || k}</span>
                <span className={v.score >= 7 ? "text-accent-green" : v.score >= 5 ? "text-accent-orange" : "text-text-secondary/50"}>
                  {v.score}
                </span>
              </div>
            ))}
          </div>
          {score.strengths.length > 0 && (
            <div className="text-[10px] font-mono">
              <span className="text-accent-green">✓ {score.strengths.join(" · ")}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
