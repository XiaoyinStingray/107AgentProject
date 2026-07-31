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
  /** 用户点击认可后的回调 */
  onAccept?: () => void;
  /** 继续修改的回调 */
  onRevise?: (instruction: string) => void;
  /** 新任务回调 */
  onNewTask?: () => void;
}

export default function WorkerTerminal({
  events,
  connected,
  done,
  onAccept,
  onRevise,
  onNewTask,
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
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-secondary">
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
          <div className="flex items-center gap-3 py-2 px-4 border-t border-border bg-bg-secondary">
            <span className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-mono text-cyan-400">
              Agent 工作中… {events.filter(e => e.type === "worker.tool_start").length > 0
                ? `已执行 ${events.filter(e => e.type === "worker.tool_start").length} 次工具调用`
                : "正在制定计划"}
            </span>
          </div>
        )}
      </div>

      {/* 完成卡片 */}
      {done && <CompletionCard events={events} onAccept={onAccept} onRevise={onRevise} onNewTask={onNewTask} />}
    </div>
  );
}


/** 完成卡片——用户验收入口 */
function CompletionCard({
  events, onAccept, onRevise, onNewTask
}: {
  events: WorkerEvent[];
  onAccept?: () => void;
  onRevise?: (instruction: string) => void;
  onNewTask?: () => void;
}) {
  const [followUp, setFollowUp] = React.useState("");
  const doneEvt = events.find(e => e.type === "worker.done");
  const summaryEvt = events.find(e => e.type === "worker.summary");
  const steps = (doneEvt?.data as Record<string,unknown>|null)?.total_steps ?? "?";
  const files = ((doneEvt?.data as Record<string,unknown>|null)?.files ?? []) as string[];
  const toolCount = events.filter(e => e.type === "worker.tool_start").length;

  return (
    <div className="border-t-2 border-cyan-700/50 bg-bg-card">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">✅</span>
          <span className="text-sm font-mono text-emerald-400 font-semibold">
            交付物就绪 — {String(steps)} 步, {files.length} 个文件, {toolCount} 次工具调用
          </span>
        </div>
        {summaryEvt && (
          <p className="text-xs font-mono text-text-muted ml-7">
            {(summaryEvt.data as Record<string,unknown>|null)?.deliverable_summary as string}
          </p>
        )}
        <div className="flex items-center gap-2 ml-7">
          <button onClick={onAccept}
                  className="px-4 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white
                             text-xs font-mono rounded transition-colors">
            ✓ 认可交付
          </button>
          <button onClick={onNewTask}
                  className="px-4 py-1.5 bg-bg-secondary hover:bg-bg-primary text-text-secondary
                             text-xs font-mono rounded border border-border transition-colors">
            ↺ 新任务
          </button>
        </div>
        <div className="flex items-center gap-2 ml-7">
          <span className="text-xs font-mono text-text-muted shrink-0">或继续修改：</span>
          <input type="text" value={followUp}
                 onChange={e => setFollowUp(e.target.value)}
                 onKeyDown={e => { if (e.key === "Enter" && followUp.trim()) { onRevise?.(followUp.trim()); setFollowUp(""); } }}
                 placeholder="把第三章改短一点 / 加一个对比表格 / 翻译成英文…"
                 className="flex-1 bg-bg-primary border border-border rounded px-2 py-1
                            text-xs font-mono text-text-primary placeholder-text-muted/50
                            focus:outline-none focus:border-cyan-700/50" />
          <button onClick={() => { if (followUp.trim()) { onRevise?.(followUp.trim()); setFollowUp(""); } }}
                  disabled={!followUp.trim()}
                  className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:bg-bg-secondary
                             disabled:text-text-muted text-white text-xs font-mono rounded
                             transition-colors shrink-0">
            发送
          </button>
        </div>
        {files.length > 0 && (
          <div className="ml-7 pt-2 border-t border-border/50">
            <div className="text-xs font-mono text-text-muted mb-1">产出文件：</div>
            {files.map((f: string) => (
              <div key={f} className="text-xs font-mono text-cyan-400 ml-2">📄 {f}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
