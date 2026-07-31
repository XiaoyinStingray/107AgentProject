/**
 * WorkerBench — 工作台主页面。
 *
 * 布局: [左侧: 文件面板 (280px)] [中央: 终端 (flex-1)]
 * 顶部: 任务输入栏 + 执行/停止按钮 + 状态指示器
 */

import React from "react";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useWorkerExecute } from "../api/workers";
import WorkerTerminal from "../components/worker/WorkerTerminal";
import WorkspacePanel from "../components/worker/WorkspacePanel";
import WorkspaceSelector, {
  type WorkspaceConfig,
} from "../components/worker/WorkspaceSelector";
import { useAgents } from "../api/agents";

// =============================================================================
// 常量
// =============================================================================

const EXAMPLE_TASKS = [
  "搜索 AI Agent 框架的最新发展，写一份对比报告保存为 report.md",
  "分析 Python 和 JavaScript 在前端开发中的优劣势，输出 analysis.txt",
  "搜索今天的科技新闻头条，摘录 5 条最重要的写入 news.md",
];

// =============================================================================
// 主组件
// =============================================================================

/** 防崩溃边界——组件出错时显示错误信息而非黑屏 */
class ErrorCatcher extends React.Component<{children: React.ReactNode}, {err: string|null}> {
  state = {err: null as string|null};
  static getDerivedStateFromError(e: Error) { return {err: e.message}; }
  render() {
    if (this.state.err) return <div className="p-8 text-center"><p className="text-rose-400 font-mono text-sm">渲染错误: {this.state.err}</p><button onClick={() => this.setState({err:null})} className="mt-2 text-xs text-cyan-400">重试</button></div>;
    return this.props.children;
  }
}

export default function WorkerBench() {
  const { data: agents = [] } = useAgents();
  const [task, setTask] = useState("");
  const [agentId, setAgentId] = useState("__builtin__");
  const [customAgentId, setCustomAgentId] = useState("");
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [showPanel, setShowPanel] = useState(true);
  const [showWorkspaceConfig, setShowWorkspaceConfig] = useState(false);
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig>({
    type: "local",
    path: "",
  });

  // 内置默认 Agent
  const BUILTIN_AGENT = useMemo(() => ({
    id: "__builtin__",
    name: "⚡ 默认 Worker",
    persona: { mbti: "ISTJ", narrative: "内置高效任务执行者——不需创建 Agent 即可使用" },
  }), []);

  // Agent 列表：内置 + 已有
  const agentOptions = useMemo(() => [
    BUILTIN_AGENT,
    ...agents,
  ], [agents, BUILTIN_AGENT]);

  const selectedAgent = agentOptions.find((a) => a.id === agentId);
  const effectiveAgentId = agentId === "__builtin__" ? "worker-default" : agentId;

  const { events, connected, done, error, execute, cancel, reset, hydrate } =
    useWorkerExecute();

  // 双重保险：done 状态可能未及时更新，从 events 推断
  const effectiveDone = done || (
    events.length > 0 &&
    ["worker.done", "worker.summary", "worker.error"].includes(
      events[events.length - 1]?.type ?? ""
    )
  );

  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [reconnectNotice, setReconnectNotice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Array<{
    run_id: string; agent_name: string; task: string; running: boolean;
    state: string; steps: number; files: Array<{path: string; size: number}>;
    created_at: string;
  }>>([]);

  // 追踪 runId——从第一个 worker.started 事件中提取
  useEffect(() => {
    if (currentRunId) return; // 已设置
    const started = events.find((e) => e.type === "worker.started");
    if (started?.data?.run_id) {
      setCurrentRunId(started.data.run_id as string);
    }
  }, [events, currentRunId]);

  // unmount 时不 cancel——worker 后台继续跑
  // 用户点"停止"才 cancel

  // 重连：组件 mount 时检查是否有活跃 worker
  useEffect(() => {
    const controller = new AbortController();
    const checkRunning = async () => {
      try {
        const resp = await fetch("/api/workers/running/list", { signal: controller.signal });
        const running: Array<{run_id: string; task: string; agent_name: string}> = await resp.json();
        if (running.length > 0) {
          const latest = running[running.length - 1];
          setCurrentRunId(latest.run_id);
          // 加载历史事件并还原终端
          try {
            const evResp = await fetch(`/api/workers/${latest.run_id}/events`, { signal: controller.signal });
            if (evResp.ok) {
              const evData = await evResp.json();
              if (evData.events?.length > 0) {
                hydrate(evData.events);
                setReconnectNotice(`已恢复: ${latest.task?.slice(0, 60)}…`);
              } else {
                setReconnectNotice(`检测到后台 Worker: ${latest.task?.slice(0, 60)}…（事件为空）`);
              }
            }
          } catch {
            setReconnectNotice(`检测到后台 Worker: ${latest.task?.slice(0, 60)}…`);
          }
        }
      } catch {
        if (controller.signal.aborted) return;
      }
    };
    checkRunning();
    return () => controller.abort();
  }, []);

  // 构建通用请求体
  const buildRequest = useCallback((taskText: string, reuse: boolean) => ({
    agent_id: effectiveAgentId,
    task: taskText,
    workspace_type: workspaceConfig.type,
    workspace_config: workspaceConfig.type === "cloud"
      ? { host: workspaceConfig.host, port: workspaceConfig.port, user: workspaceConfig.user, key: workspaceConfig.key, path: workspaceConfig.path }
      : { path: workspaceConfig.path },
    reuse_run_id: reuse && currentRunId ? currentRunId : undefined,
  }), [effectiveAgentId, workspaceConfig, currentRunId]);

  // 执行新任务（新工作区）
  const handleExecute = useCallback(() => {
    if (!task.trim()) return;
    execute(buildRequest(task.trim(), false));
  }, [task, execute, buildRequest]);

  // 停止
  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  const loadHistory = useCallback(async () => {
    try {
      const resp = await fetch("/api/workers/history");
      if (resp.ok) setHistory(await resp.json());
    } catch {}
  }, []);

  const [accepted, setAccepted] = useState(false);

  // 重置 = 新任务
  const handleReset = useCallback(() => {
    reset();
    setTask("");
    setCurrentRunId(null);
    setAccepted(false);
  }, [reset]);

  // 认可交付
  const handleAccept = useCallback(() => {
    setAccepted(true);
  }, []);

  // 追加对话——复用当前工作区
  const handleFollowUp = useCallback((instruction: string) => {
    if (!instruction.trim() || !currentRunId) return;
    setAccepted(false);
    execute(buildRequest(instruction.trim(), true));
  }, [currentRunId, execute, buildRequest]);

  // 使用示例任务
  const handleExample = useCallback(
    (exampleTask: string) => {
      if (connected) return;
      setTask(exampleTask);
    },
    [connected]
  );

  // 键盘快捷键: Enter 执行
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && !connected && task.trim()) {
        e.preventDefault();
        handleExecute();
      }
    },
    [connected, task, handleExecute]
  );

  return (
    <ErrorCatcher>
    <div className="flex flex-col h-full">
      {/* 重连提示 */}
      {reconnectNotice && done && (
        <div className="flex items-center justify-between px-4 py-1.5 bg-cyan-900/20 border-b border-cyan-700/30">
          <span className="text-xs font-mono text-cyan-400">{reconnectNotice}</span>
          <button onClick={() => setReconnectNotice(null)}
                  className="text-xs text-text-muted hover:text-text-primary">✕</button>
        </div>
      )}

      {/* ── 顶部输入栏 ── */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-border bg-surface-dark">
        <div className="flex items-start gap-3">
          {/* 任务输入 */}
          <div className="flex-1">
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述你想让 Agent 完成的任务...&#10;例如：搜索 AI Agent 框架的最新发展，写一份报告"
              rows={2}
              disabled={connected}
              className="w-full bg-surface border border-border rounded px-3 py-2
                         text-sm font-mono text-text-primary placeholder-text-muted
                         resize-none focus:outline-none focus:border-cyan-700/50
                         disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {/* 示例任务 */}
            {!connected && !done && (
              <div className="flex gap-2 mt-2 flex-wrap">
                {EXAMPLE_TASKS.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => handleExample(t)}
                    className="text-xs font-mono px-2 py-1 rounded border border-border
                               text-text-muted hover:text-text-secondary hover:border-cyan-700/30
                               transition-colors truncate max-w-xs"
                    title={t}
                  >
                    {t.slice(0, 60)}...
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center gap-2 shrink-0">
            {!connected && !done && (
              <button
                onClick={handleExecute}
                disabled={!task.trim()}
                className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-surface-dark
                           disabled:text-text-muted text-white text-sm font-mono rounded
                           transition-colors disabled:cursor-not-allowed"
              >
                ▶ 执行
              </button>
            )}
            {connected && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-rose-800 hover:bg-rose-700 text-white text-sm
                           font-mono rounded transition-colors"
              >
                ⏹ 停止
              </button>
            )}
            {done && (
              <>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 bg-surface hover:bg-surface-dark text-text-secondary
                             text-sm font-mono rounded border border-border transition-colors"
                >
                  ↺ 新任务
                </button>
              </>
            )}

            {/* 历史记录 */}
            <button
              onClick={() => { setShowHistory(!showHistory); if (!showHistory) loadHistory(); }}
              className={`p-2 rounded border transition-colors ${
                showHistory ? "border-cyan-700/30 text-cyan-400" : "border-border text-text-muted"
              }`}
              title="历史记录"
            >
              🕐
            </button>

            {/* 面板切换 */}
            <button
              onClick={() => setShowPanel(!showPanel)}
              className={`p-2 rounded border transition-colors ${
                showPanel
                  ? "border-cyan-700/30 text-cyan-400"
                  : "border-border text-text-muted"
              }`}
              title="切换文件面板"
            >
              📁
            </button>
          </div>
        </div>

        {/* Agent 选择器 */}
        {!connected && (
          <>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs font-mono text-text-muted">Agent:</span>

              {/* 下拉选择 */}
              <div className="relative">
                <button
                  onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                  disabled={connected}
                  className="flex items-center gap-2 px-2 py-1 bg-bg-card border border-border
                             rounded text-xs font-mono text-text-primary
                             hover:border-cyan-700/30 transition-colors min-w-[180px]
                             disabled:opacity-50"
                >
                  <span className="truncate flex-1 text-left">
                    {selectedAgent
                      ? `${selectedAgent.persona?.mbti ? `[${selectedAgent.persona.mbti}] ` : ""}${selectedAgent.name}`
                      : "选择 Agent…"}
                  </span>
                  <span className="text-text-muted shrink-0">▼</span>
                </button>

                {showAgentDropdown && (
                  <div className="absolute top-full left-0 mt-1 w-80 max-h-60 overflow-y-auto
                                  bg-bg-card border border-border rounded shadow-2xl z-50"
                       style={{boxShadow: "0 0 20px rgba(0,0,0,0.6)"}}>
                    {agentOptions.map((agent) => (
                      <button
                        key={agent.id}
                        onClick={() => { setAgentId(agent.id); setShowAgentDropdown(false); }}
                        className={`w-full text-left px-3 py-2 text-xs font-mono
                                    hover:bg-bg-primary transition-colors
                                    ${agent.id === agentId ? "bg-bg-primary border-l-2 border-accent-green" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={agent.id === "__builtin__"
                            ? "text-cyan-400" : "text-accent-green"}>
                            {agent.id === "__builtin__" ? "⚡" : "🎭"}
                          </span>
                          <span className="text-text-primary">
                            {agent.name}
                          </span>
                          {agent.id !== "__builtin__" && agent.persona?.mbti && (
                            <span className="text-accent-purple/70">{agent.persona.mbti}</span>
                          )}
                        </div>
                        <p className="text-text-muted mt-0.5 ml-6 line-clamp-1">
                          {agent.id === "__builtin__"
                            ? "内置 Worker Agent — 高效任务执行"
                            : agent.persona?.narrative?.slice(0, 80)}
                        </p>
                      </button>
                    ))}
                    {/* 自定义 ID 输入 */}
                    <div className="border-t border-border px-3 py-2 bg-bg-secondary/50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted shrink-0">或输入 ID:</span>
                        <input
                          type="text"
                          value={customAgentId}
                          onChange={(e) => { setCustomAgentId(e.target.value); if (e.target.value) setAgentId(e.target.value); }}
                          placeholder="手动输入 Agent ID"
                          className="flex-1 bg-bg-primary border border-border rounded px-2 py-1
                                     text-xs font-mono text-text-secondary
                                     placeholder-text-muted/50
                                     focus:outline-none focus:border-cyan-700/50"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 关闭下拉的遮罩 */}
              {showAgentDropdown && (
                <div
                  className="fixed inset-0 z-40 bg-black/30"
                  onClick={() => setShowAgentDropdown(false)}
                />
              )}

              <span className="text-xs text-text-muted">
                {agents.length === 0 ? "(暂无已创建 Agent)" : `(${agents.length} 个可用)`}
              </span>

              <button
                onClick={() => setShowWorkspaceConfig(!showWorkspaceConfig)}
                className={`text-xs font-mono px-2 py-0.5 rounded border transition-colors ${
                  showWorkspaceConfig
                    ? "border-cyan-700/30 text-cyan-400"
                    : "border-border text-text-muted"
                }`}
              >
                {workspaceConfig.type === "local" ? "💻" : "☁️"} 工作区配置
              </button>
            </div>

            {/* 工作区配置面板 */}
            {showWorkspaceConfig && (
              <div className="mt-2 p-3 border border-border rounded bg-bg-primary">
                <WorkspaceSelector
                  value={workspaceConfig}
                  onChange={setWorkspaceConfig}
                  disabled={false}
                />
              </div>
            )}
          </>
        )}

        {/* 错误提示 */}
        {error && (
          <div className="mt-2 px-3 py-1.5 bg-rose-900/20 border border-rose-700/30 rounded">
            <span className="text-xs font-mono text-rose-400">{error}</span>
          </div>
        )}
      </div>

      {/* 历史面板 */}
      {showHistory && (
        <div className="border-b border-border max-h-48 overflow-y-auto bg-bg-secondary">
          {history.length === 0 ? (
            <p className="px-4 py-3 text-xs text-text-muted font-mono">暂无历史记录</p>
          ) : (
            history.map((h) => (
              <div key={h.run_id}
                   className="flex items-center gap-3 px-4 py-2 border-b border-border/50
                              hover:bg-bg-primary/50 transition-colors cursor-pointer"
                   onClick={() => setCurrentRunId(h.run_id)}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${h.running ? "bg-emerald-400 animate-pulse" : "bg-text-muted"}`} />
                <span className="text-xs font-mono text-text-secondary w-20 truncate">{h.agent_name}</span>
                <span className="text-xs font-mono text-text-muted flex-1 truncate">{h.task}</span>
                <span className="text-xs font-mono text-text-muted">{h.steps} 步</span>
                <span className="text-xs font-mono text-text-muted">
                  {h.files?.length || 0} 文件
                </span>
                <span className="text-xs font-mono text-text-muted/50 w-16 text-right">
                  {h.created_at?.slice(11, 16)}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── 主体区域 ── */}
      <div className="flex-1 flex min-h-0">
        {/* 左侧: 文件面板 */}
        {showPanel && (
          <div className="w-[280px] shrink-0 border-r border-border overflow-hidden">
            <WorkspacePanel events={events} runId={currentRunId ?? undefined} connected={connected} />
          </div>
        )}

        {/* 中央: 终端 */}
        <div className="flex-1 min-w-0">
          <WorkerTerminal
            events={events}
            connected={connected}
            done={effectiveDone}
            onAccept={handleAccept}
            onRevise={handleFollowUp}
            onNewTask={handleReset}
          />
        </div>
      </div>
    </div>
    </ErrorCatcher>
  );
}
