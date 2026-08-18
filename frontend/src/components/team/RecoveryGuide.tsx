import type { PlanStep, TeamRecoveryAction } from "../../types/team";
import Card from "../shared/Card";

interface RecoveryGuideProps {
  steps: PlanStep[];
  pendingAction: TeamRecoveryAction | null;
  message: string | null;
  onAction: (action: TeamRecoveryAction, stepId: string) => void;
}

const actionLabels: Record<TeamRecoveryAction, string> = {
  reaudit: "重新验收已有产物",
  retry: "仅重试当前步骤",
  accept: "接受当前结果并继续",
};

export default function RecoveryGuide({
  steps,
  pendingAction,
  message,
  onAction,
}: RecoveryGuideProps) {
  if (steps.length === 0) return null;

  return (
    <Card className="border-accent-orange/40 bg-accent-orange/5">
      <div className="flex items-start gap-3">
        <span className="text-xl" aria-hidden="true">🧭</span>
        <div className="min-w-0 flex-1">
          <h4 className="font-mono text-sm text-accent-orange">恢复与调整指南</h4>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            已完成的步骤和文件都会保留。请只处理下面的待调整步骤，不需要重新运行整支团队。
          </p>

          <div className="mt-3 space-y-3">
            {steps.map((step) => {
              const files = step.result?.files ?? [];
              return (
                <div key={step.id} className="rounded border border-border bg-bg-primary/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-text-primary">🟡 {step.title}</span>
                    <span className="rounded bg-accent-orange/10 px-2 py-0.5 text-[11px] text-accent-orange">
                      产物已保留
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-text-secondary">
                    {step.result?.error || "本步骤需要确认或调整。"}
                  </p>
                  {files.length > 0 && (
                    <p className="mt-1 truncate font-mono text-[11px] text-text-secondary/60">
                      已保留：{files.map((file) => file.split("/").pop()).join("、")}
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["reaudit", "retry", "accept"] as TeamRecoveryAction[]).map((action) => {
                      const isPending = pendingAction === action;
                      const recommended = action === "reaudit";
                      return (
                        <button
                          key={action}
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => onAction(action, step.id)}
                          className={`rounded border px-3 py-1.5 text-xs font-mono transition-colors disabled:cursor-wait disabled:opacity-50 ${
                            recommended
                              ? "border-accent-green/60 text-accent-green hover:bg-accent-green/10"
                              : "border-border text-text-secondary hover:border-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {isPending ? "处理中…" : actionLabels[action]}
                          {recommended && !isPending ? "（推荐）" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {message && (
            <p className="mt-3 rounded border border-accent-green/30 bg-accent-green/5 px-3 py-2 text-xs text-accent-green">
              {message}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
