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
  const avgScore = points.length > 0
    ? Math.round(points.reduce((sum, p) => sum + p.completion_pct, 0) / points.length)
    : 0;
  const bestPoint = points.reduce((best, p) => p.completion_pct > best.completion_pct ? p : best, points[0]);
  const trendIcon = trend === "上升" ? "📈" : trend === "下降" ? "📉" : "➡️";

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

      {/* 历史趋势柱状图 */}
      {points.length > 1 && (
        <div className="flex items-end justify-center gap-4 h-48 mb-2 border-b border-border/30 pb-1">
          {points.map((p) => {
            const height = Math.max(128, p.completion_pct);
            return (
            <div key={p.index} className="flex flex-col items-center" style={{ width: 32 }} title={`${p.task}: ${p.completion_pct}%`}>
              <div className="w-full rounded-t bg-accent-green/70 transition-all" style={{ height: `${height}%`, minHeight: 128 }} />
              <span className="text-[10px] font-mono text-text-secondary/60 mt-1.5">{p.index}</span>
            </div>
            );
          })}
        </div>
      )}
      <div className="text-[10px] font-mono text-text-secondary/40 mb-2">
        {total_plans} 次任务 · {trendIcon} {trend} · 平均 {avgScore}%
      </div>
      {points.length > 1 && (
        <div className="text-[10px] font-mono text-accent-green/60 mb-2">
          最佳表现：第 {bestPoint.index} 次 ({bestPoint.completion_pct}%)
        </div>
      )}

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
