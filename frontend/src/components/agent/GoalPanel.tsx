/**
 * 目标面板——展示 Agent 的目标列表，含进度条和状态动画。
 * 用于 SoloTheater / GroupSandbox 的 Agent 详情区。
 */

import type { AgentResponse } from "../../types/agent";

interface GoalPanelProps {
  agent: AgentResponse;
}

export default function GoalPanel({ agent }: GoalPanelProps) {
  const goals = agent.goals ?? [];

  if (goals.length === 0) {
    return (
      <div className="text-xs font-mono text-text-secondary/50 text-center py-3">
        暂无目标
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {goals.map((goal) => {
        const pct = Math.round((goal.progress ?? 0) * 100);
        const achieved = goal.status === "achieved";
        const inProgress = goal.status === "in_progress";
        const abandoned = goal.status === "abandoned";

        return (
          <div
            key={goal.id}
            className={`rounded border p-2 text-xs font-mono transition-colors ${
              achieved
                ? "border-accent-green/30 bg-accent-green/5"
                : abandoned
                  ? "border-text-secondary/20 bg-bg-secondary/40 opacity-50"
                  : "border-border bg-bg-card"
            }`}
          >
            {/* 标题行 */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="text-text-primary flex-1 truncate">
                {goal.description}
              </span>
              <StatusBadge
                status={goal.status}
                achieved={achieved}
                inProgress={inProgress}
                abandoned={abandoned}
              />
            </div>

            {/* 进度条 */}
            {!abandoned && (
              <div className="w-full h-1.5 rounded-full bg-bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    achieved ? "bg-accent-green" : "bg-accent-blue/60"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}

            {/* 完成动画 */ }
            {achieved && (
              <p className="text-accent-green mt-1 animate-fade-in">
                ✅ 目标达成
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusBadge({
  status,
  achieved,
  inProgress,
  abandoned,
}: {
  status: string;
  achieved: boolean;
  inProgress: boolean;
  abandoned: boolean;
}) {
  const label =
    achieved ? "✓ 达成" :
    abandoned ? "✗ 放弃" :
    inProgress ? "▶ 进行中" :
    "○ 待开始";

  const colorClass =
    achieved ? "text-accent-green bg-accent-green/10 border-accent-green/20" :
    abandoned ? "text-text-secondary/50 bg-bg-secondary/40 border-border" :
    inProgress ? "text-accent-blue bg-accent-blue/10 border-accent-blue/20" :
    "text-text-secondary bg-bg-secondary/40 border-border";

  return (
    <span className={`shrink-0 px-1.5 py-0.5 rounded border ${colorClass}`}>
      {label}
    </span>
  );
}
