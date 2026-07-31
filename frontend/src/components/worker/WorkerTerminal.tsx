/**
 * WorkerTerminal — 终端式事件流展示组件。
 *
 * SSE 事件到达 → 逐行渲染。打字机效果 + 工具调用卡片。
 * 给用户"Agent 真的在干活"的感觉。
 */

import React, { useEffect, useRef, useState } from "react";
import type { WorkerEvent } from "../../api/workers";

// =============================================================================
// 子组件: 单行事件渲染
// =============================================================================

interface EventLineProps {
  event: WorkerEvent;
}

/** 工具调用结果折叠卡片 */
function ToolResultCard({
  toolName,
  resultDetail,
  success,
}: {
  toolName: string;
  resultDetail: string;
  success: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`ml-4 my-1 border rounded ${
        success
          ? "border-emerald-700/30 bg-emerald-900/10"
          : "border-rose-700/30 bg-rose-900/10"
      }`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-1.5 text-xs font-mono flex items-center gap-2
                   text-text-secondary hover:text-text-primary transition-colors"
      >
        <span>{expanded ? "▼" : "▶"}</span>
        <span>
          {success ? "✅" : "❌"} {toolName} 结果
        </span>
        <span className="text-xs text-text-muted">
          ({resultDetail.length} 字符)
        </span>
      </button>
      {expanded && (
        <pre className="px-3 pb-2 text-xs font-mono text-text-secondary whitespace-pre-wrap max-h-48 overflow-y-auto border-t border-border">
          {resultDetail}
        </pre>
      )}
    </div>
  );
}

/** 计划步骤展示 */
function PlanCard({ steps }: { steps: { title: string; estimated_tools: string[] }[] }) {
  return (
    <div className="ml-4 my-1 p-3 border border-cyan-700/30 rounded bg-cyan-900/10">
      <div className="text-xs font-mono text-cyan-400 mb-2">📋 Agent 执行计划</div>
      {steps.map((step, i) => (
        <div
          key={i}
          className="flex items-center gap-2 text-xs font-mono text-text-secondary py-0.5"
        >
          <span className="text-text-muted w-6">#{i + 1}</span>
          <span>{step.title}</span>
          {step.estimated_tools.length > 0 && (
            <span className="text-text-muted">
              [{step.estimated_tools.join(", ")}]
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** 单行事件组件 */
function EventLine({ event }: EventLineProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(timer);
  }, []);

  const baseClass = `font-mono text-xs transition-opacity duration-200 ${
    visible ? "opacity-100" : "opacity-0"
  }`;

  switch (event.type) {
    case "worker.started": {
      const d = event.data as Record<string, unknown>;
      return (
        <div className="py-1.5">
          <div className={`${baseClass} text-cyan-400`}>
            ⚡ Agent {d.agent_name} 开始工作
          </div>
          <div className={`${baseClass} text-text-muted`}>
            任务: {String(d.task).slice(0, 120)}
          </div>
          <div className={`${baseClass} text-text-muted`}>
            工作区: {String(d.workspace)}
          </div>
        </div>
      );
    }

    case "worker.plan": {
      const d = event.data as Record<string, unknown>;
      const steps = (d.steps as Array<{ title: string; estimated_tools: string[] }>) || [];
      return (
        <div className={baseClass}>
          <PlanCard steps={steps} />
        </div>
      );
    }

    case "worker.step_decision": {
      const d = event.data as Record<string, unknown>;
      const action = String(d.action);
      const actionIcon =
        action === "tool_call" ? "🔧" : action === "done" ? "✅" : "📦";
      const actionColor =
        action === "tool_call"
          ? "text-yellow-400"
          : action === "done"
            ? "text-emerald-400"
            : "text-text-secondary";
      return (
        <div className={`${baseClass} py-0.5`}>
          <span className="text-text-muted">Step {String(d.step_index)}</span>{" "}
          <span className={actionColor}>
            {actionIcon} {action}
          </span>{" "}
          <span className="text-text-secondary">{String(d.reason).slice(0, 150)}</span>
        </div>
      );
    }

    case "worker.tool_start": {
      const d = event.data as Record<string, unknown>;
      return (
        <div className={`${baseClass} py-0.5 ml-2`}>
          <span className="text-text-muted">⏳</span>{" "}
          <span className="text-blue-400">正在执行: {d.tool_name}</span>{" "}
          <span className="text-text-muted">{String(d.args_summary)}</span>
        </div>
      );
    }

    case "worker.tool_result": {
      const d = event.data as Record<string, unknown>;
      return (
        <div className={baseClass}>
          <ToolResultCard
            toolName={String(d.tool_name)}
            resultDetail={String(d.result_detail)}
            success={Boolean(d.success)}
          />
        </div>
      );
    }

    case "worker.reflection": {
      const d = event.data as Record<string, unknown>;
      const satisfied = Boolean(d.satisfied);
      const planChanged = Boolean(d.plan_changed);
      return (
        <div className={`${baseClass} py-0.5 ml-2`}>
          <span className="text-text-muted">
            {satisfied ? "👍" : "🤔"} Agent 评估:{" "}
          </span>
          <span className={satisfied ? "text-emerald-400" : "text-yellow-400"}>
            {String(d.thought).slice(0, 200)}
          </span>
          {planChanged && (
            <span className="text-yellow-500 ml-1">(计划已调整)</span>
          )}
        </div>
      );
    }

    case "worker.file_updated": {
      const d = event.data as Record<string, unknown>;
      const files = (d.files as Array<{ path: string; size: number }>) || [];
      return (
        <div className={`${baseClass} py-0.5 ml-2`}>
          <span className="text-emerald-400">📄 文件已更新: </span>
          {files.map((f) => (
            <span key={f.path} className="text-text-muted ml-1">
              {f.path} ({(f.size / 1024).toFixed(1)}KB)
            </span>
          ))}
        </div>
      );
    }

    case "worker.done": {
      const d = event.data as Record<string, unknown>;
      return (
        <div className={`${baseClass} py-1.5`}>
          <div className="text-emerald-400">
            ✅ 任务完成！ 共 {String(d.total_steps)} 步
          </div>
          <div className="text-text-muted">{String(d.reason)}</div>
        </div>
      );
    }

    case "worker.error": {
      const d = event.data as Record<string, unknown>;
      return (
        <div className={`${baseClass} py-1`}>
          <span className="text-rose-400">❌ 错误: </span>
          <span className="text-rose-300">{String(d.message).slice(0, 300)}</span>
        </div>
      );
    }

    case "worker.summary": {
      const d = event.data as Record<string, unknown>;
      const findings = (d.key_findings as string[]) || [];
      return (
        <div className={`${baseClass} py-1.5`}>
          <div className="text-cyan-400">📊 工作汇总</div>
          <div className="text-text-secondary text-xs mt-1">
            自评: {String(d.self_rating)}/5 — {String(d.deliverable_summary)}
          </div>
          {findings.length > 0 && (
            <div className="mt-1">
              {findings.map((f, i) => (
                <div key={i} className="text-text-muted text-xs ml-2">
                  • {f}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    case "worker.thought": {
      const d = event.data as Record<string, unknown>;
      return (
        <div className={`${baseClass} text-text-muted italic py-0.5`}>
          💭 {String(d.thought).slice(0, 300)}
        </div>
      );
    }

    default:
      return (
        <div className={`${baseClass} text-text-muted`}>
          {event.type}: {JSON.stringify(event.data).slice(0, 100)}
        </div>
      );
  }
}

// =============================================================================
// 主组件
// =============================================================================

interface WorkerTerminalProps {
  events: WorkerEvent[];
  connected: boolean;
  done: boolean;
}

export default function WorkerTerminal({
  events,
  connected,
  done,
}: WorkerTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div className="flex flex-col h-full">
      {/* 状态栏 */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-dark">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? "bg-emerald-400 animate-pulse" : done ? "bg-text-muted" : "bg-yellow-400"
            }`}
          />
          <span className="text-xs font-mono text-text-muted">
            {connected ? "运行中" : done ? "已完成" : "就绪"}
          </span>
        </div>
        <span className="text-xs font-mono text-text-muted">
          {events.length} 条事件
        </span>
      </div>

      {/* 事件流 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-0.5"
      >
        {events.length === 0 && !connected && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <span className="text-4xl block mb-3">⚡</span>
              <p className="text-text-muted font-mono text-sm">
                输入任务，Agent 将在此工作
              </p>
              <p className="text-text-muted font-mono text-xs mt-1">
                终端式展示 — 你会看到每一步的决策和工具调用
              </p>
            </div>
          </div>
        )}

        {events.map((event, index) => (
          <EventLine key={`${event.timestamp}-${index}`} event={event} />
        ))}

        {/* 加载指示器 */}
        {connected && !done && (
          <div className="flex items-center gap-2 py-1">
            <span className="text-text-muted text-xs animate-pulse">▊</span>
            <span className="text-text-muted text-xs">Agent 思考中...</span>
          </div>
        )}
      </div>

      {/* 底部状态栏 */}
      {done && (
        <div className="px-3 py-2 border-t border-border bg-surface-dark">
          <div className="text-xs font-mono text-text-muted">
            {events.filter((e) => e.type === "worker.tool_start").length} 次工具调用
            {" · "}
            {events.filter((e) => e.type === "worker.file_updated").length} 次文件变更
          </div>
        </div>
      )}
    </div>
  );
}
