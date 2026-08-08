/**
 * State 8: StepCard — 单步骤卡片。
 */
import { useState } from "react";
import type { StepState } from "../../types/team";

interface Props {
  step: StepState;
  isActive: boolean;
}

const statusConfig: Record<string, { icon: string; border: string; bg: string; label: string }> = {
  pending: { icon: "○", border: "border-border", bg: "bg-bg-secondary/40", label: "等待中" },
  running: { icon: "●", border: "border-accent-blue/60", bg: "bg-accent-blue/5", label: "执行中" },
  done: { icon: "✓", border: "border-accent-green/40", bg: "bg-accent-green/5", label: "已完成" },
  error: { icon: "✗", border: "border-accent-red/40", bg: "bg-accent-red/5", label: "失败" },
  skipped: { icon: "—", border: "border-border", bg: "bg-bg-secondary/20", label: "已跳过" },
};

export default function StepCard({ step, isActive }: Props) {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[step.status] ?? statusConfig.pending;

  return (
    <div
      className={`rounded border ${cfg.border} ${cfg.bg} p-3 cursor-pointer transition-colors hover:border-text-secondary/40`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <span
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs shrink-0 ${
            isActive ? "border-accent-blue text-accent-blue animate-pulse" : cfg.border + " text-text-secondary"
          }`}
        >
          {cfg.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-text-primary truncate">{step.title}</span>
            <span className="text-xs text-text-secondary/50 shrink-0">{cfg.label}</span>
          </div>
          <div className="text-xs text-text-secondary/60 mt-0.5">{step.assigneeName}</div>
          {step.durationSecs != null && (
            <div className="text-xs text-text-secondary/40 mt-0.5">
              ⏱ {step.durationSecs.toFixed(1)}s · 🪜 {step.stepsUsed}步
            </div>
          )}
        </div>
        {step.files.length > 0 && (
          <span className="text-xs text-text-secondary/50 shrink-0">📄{step.files.length}</span>
        )}
      </div>

      {/* 展开: 文件列表 + 错误信息 */}
      {expanded && (
        <div className="mt-2 pl-9 space-y-1">
          {step.files.map((f) => (
            <div key={f} className="text-xs font-mono text-accent-green truncate">
              📄 {f}
            </div>
          ))}
          {step.outputSummary && (
            <div className="text-xs text-text-secondary/70 mt-1 leading-relaxed line-clamp-3">
              {step.outputSummary}
            </div>
          )}
          {step.error && (
            <div className="text-xs text-accent-red mt-1">{step.error}</div>
          )}
        </div>
      )}
    </div>
  );
}
