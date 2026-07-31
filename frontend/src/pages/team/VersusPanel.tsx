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
    <div className="flex items-center gap-2 text-[11px] font-mono">
      <span className="w-14 text-text-secondary text-right">{label}</span>
      <div className="flex-1 flex items-center gap-0.5">
        <div className="h-3 bg-accent-green/30 rounded-l" style={{ width: `${(a/maxS)*100}%`, minWidth: a > 0 ? 8 : 0 }} />
        <div className="text-[10px] text-accent-green w-4">{a}</div>
        <div className="text-[10px] text-accent-orange w-4 text-right">{b}</div>
        <div className="h-3 bg-accent-orange/30 rounded-r" style={{ width: `${(b/maxS)*100}%`, minWidth: b > 0 ? 8 : 0 }} />
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
          {finished.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={teamB} onChange={(e) => setTeamB(e.target.value)}
          className="px-2 py-1 text-xs font-mono rounded border border-border bg-bg-secondary text-text-primary">
          <option value="">Team B…</option>
          {finished.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
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
            </div>
            <div>
              <p className="text-accent-orange mb-1">{result.team_b_name}</p>
              <p className="text-text-secondary/50">{result.summary_b}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
