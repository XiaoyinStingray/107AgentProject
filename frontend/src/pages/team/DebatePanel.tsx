/**
 * DebatePanel — 实时辩论可视化（Step 67）。
 *
 * 显示：
 *   - 辩论主题
 *   - 正反方 Agent 分布
 *   - 分歧度进度条
 *   - 共识阶段指示
 *   - 角色演化历史
 */

import type { PlanStep } from "../../types/team";
import Card from "../../components/shared/Card";

/* ── 辩论状态（来自 SSE debate_update）── */
export interface DebateState {
  topic: string;
  phase: "discussing" | "debating" | "polarized" | "converging";
  divergence: number;    // 0-1
  stance_gap: number;    // 0-1
  pro_agents: { id: string; name: string }[];
  con_agents: { id: string; name: string }[];
  neutral_agents: { id: string; name: string }[];
  total_agents: number;
  tick: number;
}

/* ── 角色演化（来自 SSE role_evolved）── */
export interface RoleEvolution {
  agent_id: string;
  name: string;
  old_role: string;
  new_role: string;
  reason: string;
  step_title: string;
}

interface Props {
  debate: DebateState | null;
  evolutions: RoleEvolution[];
  steps: PlanStep[];
  agentNames: Record<string, string>;
}

const PHASE_LABELS: Record<string, { icon: string; color: string; text: string }> = {
  discussing: { icon: "💬", color: "#888", text: "一般讨论" },
  debating:  { icon: "🔥", color: "#f44", text: "激烈辩论" },
  polarized: { icon: "⚡", color: "#fa0", text: "两极分化" },
  converging:{ icon: "🤝", color: "#4a4", text: "趋于共识" },
};

export default function DebatePanel({ debate, evolutions, steps, agentNames }: Props) {
  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className="space-y-3">
      {/* ── 角色演化历史 ── */}
      {evolutions.length > 0 && (
        <Card>
          <div className="text-xs font-mono text-text-secondary mb-2">
            🔄 角色演化（{evolutions.length} 次调整）
          </div>
          <div className="space-y-2">
            {evolutions.map((ev, i) => (
              <div key={i} className="text-[11px] font-mono">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-accent-orange">{ev.name}</span>
                  <span className="text-text-secondary/50">
                    {ev.old_role} → {ev.new_role}
                  </span>
                </div>
                <div className="text-text-secondary/40 truncate ml-1">
                  「{ev.step_title}」— {ev.reason.slice(0, 40)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── 辩论状态 ── */}
      <Card>
        <div className="text-xs font-mono text-text-secondary mb-2">
          ⚔️ 实时辩论
          {debate && (
            <span className="ml-2" style={{ color: PHASE_LABELS[debate.phase]?.color }}>
              {PHASE_LABELS[debate.phase]?.icon} {PHASE_LABELS[debate.phase]?.text}
            </span>
          )}
        </div>

        {debate ? (
          <div className="space-y-3">
            {/* 主题 */}
            <div className="text-sm font-mono text-accent-orange">
              辩题：{debate.topic}
            </div>

            {/* 分歧度条 */}
            <div>
              <div className="flex justify-between text-[10px] font-mono text-text-secondary/50 mb-1">
                <span>分歧度</span>
                <span>{Math.round(debate.divergence * 100)}%</span>
              </div>
              <div className="h-1.5 bg-bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round(debate.divergence * 100)}%`,
                    backgroundColor: debate.divergence > 0.6 ? "#f44" :
                                     debate.divergence > 0.3 ? "#fa0" : "#4a4",
                  }}
                />
              </div>
            </div>

            {/* 正反方 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 正方 */}
              <div className="p-2 rounded bg-accent-green/5 border border-accent-green/20">
                <div className="text-[10px] font-mono text-accent-green mb-1">
                  ✅ 支持 {debate.pro_agents.length}人
                </div>
                {debate.pro_agents.map((a) => (
                  <div key={a.id} className="text-[11px] font-mono text-text-primary">
                    {a.name}
                  </div>
                ))}
              </div>
              {/* 反方 */}
              <div className="p-2 rounded bg-accent-orange/5 border border-accent-orange/20">
                <div className="text-[10px] font-mono text-accent-orange mb-1">
                  ❌ 反对 {debate.con_agents.length}人
                </div>
                {debate.con_agents.map((a) => (
                  <div key={a.id} className="text-[11px] font-mono text-text-primary">
                    {a.name}
                  </div>
                ))}
              </div>
            </div>

            {/* 中立 */}
            {debate.neutral_agents.length > 0 && (
              <div className="text-[10px] font-mono text-text-secondary/40">
                😐 观望：{debate.neutral_agents.map((a) => a.name).join("、")}
              </div>
            )}
          </div>
        ) : (
          <div className="text-xs font-mono text-text-secondary/40">
            💬 {doneCount > 0 ? "观点趋于一致，无明显分歧" : "等待讨论开始…"}
          </div>
        )}
      </Card>
    </div>
  );
}
