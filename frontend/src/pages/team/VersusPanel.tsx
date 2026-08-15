import { useState } from "react";
import { useTeams, useTeamVersus, type VersusResult } from "../../api/teams";
import Card from "../../components/shared/Card";

interface Props {
  onClose: () => void;
}

const DIM_LABELS: Record<string, string> = {
  completeness: "完整性", innovation: "创新性", feasibility: "可行性",
  clarity: "清晰度", collaboration: "协作", depth: "深度",
  practicality: "实用性", creativity: "创造力",
};

function ScoreBar({ label, a, b }: { label: string; a: number; b: number }) {
  const maxS = 10;
  return (
    <div className="flex items-center gap-1 text-[11px] font-mono">
      <span className="w-14 text-text-secondary text-right shrink-0">{label}</span>
      <div className="flex-1 flex items-center">
        {/* A 长条（从右向左延伸） */}
        <div className="flex-1 flex items-center justify-end">
          <div className="h-3 bg-accent-green/40 rounded-l transition-all" style={{ width: `${(a/maxS)*100}%`, minWidth: a > 0 ? 6 : 0 }} />
        </div>
        {/* 中间分数 */}
        <div className="flex items-center gap-0.5 px-1 shrink-0">
          <span className="text-[10px] text-accent-green w-5 text-right tabular-nums">{a}</span>
          <span className="text-[8px] text-text-secondary/40">|</span>
          <span className="text-[10px] text-accent-orange w-5 text-left tabular-nums">{b}</span>
        </div>
        {/* B 长条（从左向右延伸） */}
        <div className="flex-1 flex items-center justify-start">
          <div className="h-3 bg-accent-orange/40 rounded-r transition-all" style={{ width: `${(b/maxS)*100}%`, minWidth: b > 0 ? 6 : 0 }} />
        </div>
      </div>
    </div>
  );
}

export default function VersusPanel({ onClose }: Props) {
  const { data: teams = [] } = useTeams();
  const versus = useTeamVersus();
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [task, setTask] = useState("");
  const [result, setResult] = useState<VersusResult | null>(null);

  const finished = teams.filter((t) => t.status === "finished");
  const canStart = teamA && teamB && teamA !== teamB && task.trim() && !versus.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono text-accent-orange">⚔️ Team 对抗 · 多维评审</h2>
        <button onClick={onClose} className="text-xs text-text-secondary hover:text-text-primary">✕</button>
      </div>

      <p className="text-[11px] font-mono text-text-secondary/60 leading-relaxed">
        选择两个已完成的 Team，输入评审任务，LLM 将对比两队的报告并从 8 个维度打分。
        两队必须不同，且都已完成至少一次任务。
      </p>

      <div className="space-y-2">
        <label className="text-xs font-mono text-text-secondary">评审任务（两队共同面对的问题）</label>
        <input value={task} onChange={(e) => setTask(e.target.value)}
          placeholder="例：设计一个校园二手交易平台"
          className="w-full px-3 py-1.5 text-xs font-mono rounded border border-border bg-bg-secondary text-text-primary" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <select value={teamA} onChange={(e) => setTeamA(e.target.value)}
          className="px-2 py-1 text-xs font-mono rounded border border-border bg-bg-secondary text-text-primary">
          <option value="">Team A…</option>
          {finished.map((t) => <option key={t.id} value={t.id} disabled={t.id === teamB}>{t.name}</option>)}
        </select>
        <select value={teamB} onChange={(e) => setTeamB(e.target.value)}
          className="px-2 py-1 text-xs font-mono rounded border border-border bg-bg-secondary text-text-primary">
          <option value="">Team B…</option>
          {finished.map((t) => <option key={t.id} value={t.id} disabled={t.id === teamA}>{t.name}</option>)}
        </select>
      </div>

      <button type="button" disabled={!canStart} onClick={async () => {
        if (!canStart) return;
        try { setResult(await versus.mutateAsync({ team_a_id: teamA, team_b_id: teamB, task: task.trim() })); }
        catch {}
      }} className="w-full py-2 text-xs font-mono rounded border border-accent-orange/60 text-accent-orange hover:bg-accent-orange/10 disabled:opacity-30">
        {versus.isPending ? "LLM 评审中…" : "⚔️ 开始多维对抗"}
      </button>

      {result && (
        <Card className="p-4 space-y-3">
          <div className="text-center">
            <span className="text-lg">{result.winner === "A" ? "🏆" : result.winner === "B" ? "🏆" : "🤝"}</span>
            <p className="text-sm font-mono text-accent-orange mt-1">
              {result.winner === "A" ? result.team_a_name : result.winner === "B" ? result.team_b_name : "势均力敌"}
              <span className="text-text-secondary/50 ml-2">
                ({result.overall_a} vs {result.overall_b})
              </span>
            </p>
          </div>

          {/* 雷达对比 */}
          <div className="space-y-1.5">
            {Object.keys(DIM_LABELS).map((k) => {
              const a = result.scores_a[k]?.score ?? 0;
              const b = result.scores_b[k]?.score ?? 0;
              return <ScoreBar key={k} label={DIM_LABELS[k]} a={a} b={b} />;
            })}
          </div>

          {/* 差异亮点 */}
          {result.key_diffs.length > 0 && (
            <div className="text-xs font-mono space-y-1">
              <p className="text-text-secondary">关键差异：</p>
              {result.key_diffs.map((d) => (
                <p key={d.dim} className="text-text-secondary/60">
                  {d.dim}：{d.winner === "A" ? result.team_a_name : result.team_b_name} 领先 {d.gap} 分
                </p>
              ))}
            </div>
          )}

          {/* 双方总结 */}
          <div className="grid grid-cols-2 gap-3 text-[11px] font-mono">
            <div>
              <p className="text-accent-green mb-1">{result.team_a_name}</p>
              <p className="text-text-secondary/50">{result.summary_a}</p>
              {result.strengths_a.length > 0 && (
                <p className="text-accent-green/70 mt-1">✓ {result.strengths_a.join("、")}</p>
              )}
              {result.weaknesses_a.length > 0 && (
                <p className="text-accent-red/70 mt-0.5"> {result.weaknesses_a.join("、")}</p>
              )}
            </div>
            <div>
              <p className="text-accent-orange mb-1">{result.team_b_name}</p>
              <p className="text-text-secondary/50">{result.summary_b}</p>
              {result.strengths_b.length > 0 && (
                <p className="text-accent-green/70 mt-1">✓ {result.strengths_b.join("、")}</p>
              )}
              {result.weaknesses_b.length > 0 && (
                <p className="text-accent-red/70 mt-0.5"> {result.weaknesses_b.join("、")}</p>
              )}
            </div>
          </div>

          {/* 各维度详细评语 */}
          <details className="text-[11px] font-mono">
            <summary className="cursor-pointer text-text-secondary hover:text-text-primary py-1"> 查看各维度详细评语</summary>
            <div className="mt-2 space-y-2 pt-2 border-t border-border">
              {Object.keys(DIM_LABELS).map((k) => {
                const ca = result.scores_a[k]?.comment ?? "";
                const cb = result.scores_b[k]?.comment ?? "";
                if (!ca && !cb) return null;
                return (
                  <div key={k} className="space-y-0.5">
                    <p className="text-text-secondary font-semibold">{DIM_LABELS[k]}</p>
                    {ca && <p className="text-accent-green/70 pl-2">{result.team_a_name}：{ca}</p>}
                    {cb && <p className="text-accent-orange/70 pl-2">{result.team_b_name}：{cb}</p>}
                  </div>
                );
              })}
            </div>
          </details>
        </Card>
      )}
    </div>
  );
}
