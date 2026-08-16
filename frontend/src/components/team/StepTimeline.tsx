/**
 * State 8: StepTimeline — 垂直步骤时间线组件。
 */
import { useTeamStore } from "../../stores/useTeamStore";
import StepCard from "./StepCard";
import StepTerminal from "./StepTerminal";

interface Props {
  agentNames?: Record<string, string>;
}

export default function StepTimeline({ agentNames }: Props) {
  const stepOrder = useTeamStore((s) => s.stepOrder);
  const steps = useTeamStore((s) => s.steps);
  const isRunning = useTeamStore((s) => s.isRunning);

  if (stepOrder.length === 0) {
    return (
      <div className="text-xs font-mono text-text-secondary/60 py-4 text-center">
        等待任务分解…
      </div>
    );
  }

  // 找到当前正在运行的步骤
  const activeStepId = stepOrder.find((id) => steps[id]?.status === "running") ?? null;

  return (
    <div className="flex flex-col h-full">
      <div className="text-xs font-mono text-text-secondary mb-3 flex items-center gap-2">
        <span>📋</span>
        <span>步骤时间线</span>
        {isRunning && (
          <span className="ml-auto w-2 h-2 rounded-full bg-accent-green animate-pulse" />
        )}
      </div>
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3">
        {/* 左侧: 步骤列表 */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {stepOrder.map((id, i) => {
            const step = steps[id];
            if (!step) return null;
            const isLast = i === stepOrder.length - 1;
            return (
              <div key={id} className="relative">
                {/* 连接线 */}
                {!isLast && (
                  <div
                    className={`absolute left-3 top-8 bottom-0 w-0.5 ${
                      step.status === "done" ? "bg-accent-green/30" : "bg-border"
                    }`}
                  />
                )}
                <StepCard step={step} isActive={id === activeStepId} agentNames={agentNames} />
              </div>
            );
          })}
        </div>
        {/* 右侧: 当前步骤终端 */}
        {activeStepId && (
          <div className="lg:w-96 shrink-0">
            <StepTerminal stepId={activeStepId} />
          </div>
        )}
      </div>
    </div>
  );
}
