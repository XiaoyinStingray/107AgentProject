/**
 * DecisionTrace — Step 100: 决策溯源面板。
 *
 * 渲染 Agent 每一步决策的时间线。
 * 显示: 时间戳 → 做了什么 → 为什么 → 结果。
 */

interface Props {
  steps: Array<{
    step_index: number;
    action: string;
    reason: string;
    result_summary?: string;
    tool_name?: string;
    duration_ms?: number;
  }>;
}

export default function DecisionTrace({ steps }: Props) {
  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-secondary font-mono">
        Agent 尚未做出决策...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2 max-h-full overflow-y-auto">
      {steps.map((step, i) => (
        <details key={i} className="group">
          <summary className="cursor-pointer hover:bg-bg-secondary/50 rounded px-2 py-1.5 transition-colors list-none">
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-text-secondary shrink-0 w-6 text-right">
                #{step.step_index}
              </span>
              <span className={`px-1 py-0.5 rounded text-[9px] ${
                step.action === "tool_call" || step.tool_name
                  ? "bg-accent-blue/15 text-accent-blue"
                  : step.action === "done"
                  ? "bg-accent-green/15 text-accent-green"
                  : "bg-bg-primary text-text-secondary"
              }`}>
                {step.tool_name || step.action}
              </span>
              <span className="text-text-secondary truncate flex-1">
                {step.reason.slice(0, 60)}
              </span>
              {step.duration_ms != null && (
                <span className="text-text-secondary shrink-0">
                  {(step.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </summary>
          <div className="ml-10 mt-0.5 mb-1 text-[10px] font-mono text-text-secondary space-y-0.5">
            <p>
              <span className="text-text-secondary/60">原因: </span>
              {step.reason}
            </p>
            {step.result_summary && (
              <p>
                <span className="text-text-secondary/60">结果: </span>
                <span className="text-accent-green">{step.result_summary.slice(0, 200)}</span>
              </p>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
