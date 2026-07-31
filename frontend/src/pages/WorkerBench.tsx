/**
 * WorkerBench — 工作台主页面。
 *
 * 布局: [左侧: 文件面板 (280px)] [中央: 终端 (flex-1)]
 * 顶部: 任务输入栏 + 执行/停止按钮 + 状态指示器
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
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

  const { events, connected, done, error, execute, cancel, reset } =
    useWorkerExecute();

  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [reconnectNotice, setReconnectNotice] = useState<string | null>(null);
  const prevConnectedRef = useRef(false);

  // 追踪 runId：connected 从 false→true 时记录
  useEffect(() => {
    if (connected && !prevConnectedRef.current) {
      // 从最近事件中提取 run_id
      const started = events.find((e) => e.type === "worker.started");
      if (started) {
        setCurrentRunId(started.data?.run_id as string ?? null);
      }
    }
    prevConnectedRef.current = connected;
  }, [connected, events]);

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
          setReconnectNotice(`检测到后台运行的 Worker: ${latest.task?.slice(0, 60)}…`);
        }
      } catch {
        if (controller.signal.aborted) return;
      }
    };
    checkRunning();
    return () => controller.abort();
  }, []);

  // 执行任务
  const handleExecute = useCallback(() => {
    if (!task.trim()) return;
    execute({
      agent_id: effectiveAgentId,
      task: task.trim(),
      workspace_type: workspaceConfig.type,
      workspace_config: workspaceConfig.type === "cloud"
        ? {
            host: workspaceConfig.host,
            port: workspaceConfig.port,
            user: workspaceConfig.user,
            key: workspaceConfig.key,
            path: workspaceConfig.path,
          }
        : { path: workspaceConfig.path },
    });
  }, [task, agentId, execute]);

  // 停止
  const handleCancel = useCallback(() => {
    cancel();
  }, [cancel]);

  const [followUp, setFollowUp] = useState("");

  // 重置
  const handleReset = useCallback(() => {
    reset();
    setTask("");
    setFollowUp("");
  }, [reset]);

  // 追加对话——用当前 workspace 重新执行
  const handleFollowUp = useCallback(() => {
    if (!followUp.trim() || !currentRunId) return;
    execute({
      agent_id: effectiveAgentId,
      task: followUp.trim(),
      workspace_type: workspaceConfig.type,
      workspace_config: workspaceConfig.type === "cloud"
        ? { host: workspaceConfig.host, port: workspaceConfig.port, user: workspaceConfig.user, key: workspaceConfig.key, path: workspaceConfig.path }
        : { path: workspaceConfig.path },
    });
    setFollowUp("");
  }, [followUp, currentRunId, effectiveAgentId, workspaceConfig, execute]);

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
    <div className="flex flex-col h-full">
      {/* 重连提示 */}
      {reconnectNotice && (
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
                {/* 追加对话 */}
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && followUp.trim()) handleFollowUp(); }}
                    placeholder="继续对话…（如：把第三段改短一点）"
                    className="w-56 bg-bg-primary border border-border rounded px-2 py-1
                               text-xs font-mono text-text-primary placeholder-text-muted/50
                               focus:outline-none focus:border-cyan-700/50"
                  />
                  <button
                    onClick={handleFollowUp}
                    disabled={!followUp.trim()}
                    className="px-2 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:bg-bg-secondary
                               disabled:text-text-muted text-white text-xs font-mono rounded
                               transition-colors"
                  >
                    发送
                  </button>
                </div>
              </>
            )}

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
            done={done}
          />
        </div>
      </div>
    </div>
  );
}
