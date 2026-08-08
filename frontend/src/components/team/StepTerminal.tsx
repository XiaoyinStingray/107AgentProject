/**
 * State 8: StepTerminal — 当前步骤的只读 Worker 终端。
 * 渲染步骤的 step.tool_start / step.tool_result / step.file_updated 事件。
 *
 * Worker 事件字段映射（匹配 WorkerEventData dataclass）:
 *   tool_start  → data.tool_name, data.args_summary
 *   tool_result → data.tool_name, data.result_summary
 *   file_updated → data.files: [{path, size}]
 *   thought     → data.thought
 *   summary     → data.deliverable_summary, data.key_findings
 */
import { useRef, useEffect, useMemo } from "react";
import { useTeamStore } from "../../stores/useTeamStore";
import type { TeamSSEEvent } from "../../types/team";

interface Props {
  stepId: string;
}

function formatToolEvent(event: TeamSSEEvent): string {
  const d = event.data as Record<string, unknown>;
  const toolName = (d.tool_name as string) ?? event.type.replace("step.", "") ?? "?";

  if (event.type === "step.tool_start") {
    const args = (d.args_summary as string) ?? "";
    return `▶ ${toolName}(${args})`;
  }
  if (event.type === "step.tool_result") {
    const summary = (d.result_summary as string) ?? "";
    return `  ✅ ${summary.slice(0, 200)}`;
  }
  if (event.type === "step.file_updated") {
    const files = d.files as Array<{ path: string; size: number }> | undefined;
    if (files?.length) {
      return files.map((f) => `  📄 ${f.path} (${f.size} bytes)`).join("\n");
    }
    return `  📄 文件已更新`;
  }
  if (event.type === "step.thought") {
    const thought = (d.thought as string) ?? "";
    return `  💭 ${thought.slice(0, 150)}`;
  }
  if (event.type === "step.summary") {
    const summary = (d.deliverable_summary as string) ?? "";
    return `📝 ${summary.slice(0, 200)}`;
  }
  return `[${event.type}]`;
}

export default function StepTerminal({ stepId }: Props) {
  const step = useTeamStore((s) => s.steps[stepId]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const lines = useMemo(() => {
    if (!step) return [];
    return step.events.map((e) => formatToolEvent(e)).filter(Boolean);
  }, [step?.events]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length]);

  if (!step) {
    return (
      <div className="text-xs font-mono text-text-secondary/60 p-3">
        选择步骤查看终端
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="text-xs font-mono text-text-secondary mb-2 flex items-center gap-2">
        <span>🖥</span>
        <span>{step.title}</span>
        <span className="text-text-secondary/40">{step.assigneeName}</span>
      </div>
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 bg-bg-secondary/80 border border-border rounded p-3 overflow-y-auto font-mono text-xs leading-relaxed"
        style={{ maxHeight: "320px" }}
      >
        {lines.length === 0 ? (
          <div className="text-text-secondary/40">等待 Agent 开始工作…</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className="text-text-secondary whitespace-pre-wrap break-all">
              {line}
            </div>
          ))
        )}
        {step.status === "running" && (
          <div className="text-accent-blue mt-1 animate-pulse">▊</div>
        )}
      </div>
    </div>
  );
}
