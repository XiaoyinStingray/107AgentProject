import type { PlanStep } from "../../types/team";
import Card from "../../components/shared/Card";

interface Props {
  steps: PlanStep[];
  progressPct: number;
  coordinatorMsg: string | null;
  reportReady: boolean;
  agentNames: Record<string, string>;
  agentRoles?: Array<{ id: string; name: string; role: string }>;
}

export default function HealthPanel({ steps, progressPct, coordinatorMsg, reportReady, agentNames, agentRoles }: Props) {
  const doneCount = steps.filter((s) => s.status === "done").length;
  const activeStep = steps.find((s) => s.status === "active");

  return (
    <div className="space-y-3">
      {/* 协调器 */}
      {coordinatorMsg && (
        <div className="px-3 py-2 rounded border border-accent-orange/40 bg-accent-orange/5 text-xs font-mono text-accent-orange animate-fade-in">
          {coordinatorMsg}
        </div>
      )}

      {/* 完成提示 */}
      {reportReady && (
        <div className="px-3 py-2 rounded border border-accent-green/40 bg-accent-green/5 text-xs font-mono text-accent-green animate-fade-in">
          ✅ 全部阶段完成！报告已生成。
        </div>
      )}

      {/* 进度 */}
      <Card>
        <div className="text-xs font-mono text-text-secondary mb-2">📊 任务进度</div>
        {steps.length === 0 ? (
          <div className="text-xs font-mono text-text-secondary/40 py-2">等待任务分解…</div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-2 bg-bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-green rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(progressPct * 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono text-accent-green">
                {doneCount}/{steps.length}
              </span>
            </div>

        {/* 步骤列表 */}
        <div className="space-y-1.5 mt-3">
          {steps.map((s) => {
            const name = s.assignee ? (agentNames[s.assignee] ?? s.assignee.slice(0, 8)) : "全员";
            const icon = s.status === "done" ? "✅" : s.status === "active" ? "🔄" : "⏳";
            return (
              <div key={s.id} className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-mono ${
                s.status === "active" ? "bg-accent-orange/5" : ""
              }`}>
                <span>{icon}</span>
                <span className="flex-1 truncate">{s.title}</span>
                <span className="text-text-secondary/50">{name}</span>
              </div>
            );
          })}
        </div>
          </>
        )}
      </Card>

      {/* 当前阶段 */}
      {activeStep && (
        <Card>
          <div className="text-xs font-mono text-text-secondary mb-1">
            🔄 当前阶段
          </div>
          <p className="text-xs font-mono text-accent-orange">{activeStep.title}</p>
          <p className="text-[11px] text-text-secondary/60 mt-0.5">
            负责人：{activeStep.assignee ? (agentNames[activeStep.assignee] ?? activeStep.assignee) : "全员"}
          </p>
        </Card>
      )}

      {/* 67: 当前角色分配 */}
      {agentRoles && agentRoles.length > 0 && (
        <Card>
          <div className="text-xs font-mono text-text-secondary mb-2">👥 当前角色</div>
          <div className="space-y-1">
            {agentRoles.map((a) => (
              <div key={a.id} className="flex items-center gap-2 text-[11px] font-mono">
                <span className="text-text-primary">{a.name}</span>
                <span className="text-accent-orange/70">{a.role}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
