/**
 * WorkerBench — 工作台主页面。
 *
 * 布局: [左侧: 文件面板 (280px)] [中央: 终端 (flex-1)]
 * 顶部: 任务输入栏 + 执行/停止按钮 + 状态指示器
 */

import React from "react";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkerExecute } from "../api/workers";
import WorkerTerminal from "../components/worker/WorkerTerminal";
import DecisionForkPanel from "../components/worker/DecisionForkPanel";
import WorkspacePanel from "../components/worker/WorkspacePanel";
import WorkspaceSelector, {
  type WorkspaceConfig,
} from "../components/worker/WorkspaceSelector";
import { useAgents } from "../api/agents";
import { unlock } from "../game/achievements";
import { useFeatureAnchor } from "../hooks/useFeatureAnchor";
import { useQuery } from "@tanstack/react-query";

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
  useFeatureAnchor();
  const { data: agents = [] } = useAgents();
  const [searchParams] = useSearchParams();
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

  // Step 105: 角色 + 工具选择
  const [workerRole, setWorkerRole] = useState("worker");
  const [enabledTools, setEnabledTools] = useState<string[]>([]); // 空=全部可用
  const ALL_TOOLS = [
    { key: "web_search", label: "🔍 搜索", group: "基础" },
    { key: "run_python", label: "🐍 Python", group: "基础" },
    { key: "write_file", label: "📝 写文件", group: "基础" },
    { key: "read_file", label: "📖 读文件", group: "基础" },
    { key: "list_files", label: "📂 列文件", group: "基础" },
    { key: "install_package", label: "📦 安装包", group: "基础" },
    { key: "mindmap", label: "🧠 思维导图", group: "特殊" },
    { key: "chart", label: "📊 图表", group: "特殊" },
    { key: "timeline", label: "📅 时间线", group: "特殊" },
    { key: "summarize", label: "📝 摘要", group: "特殊" },
    { key: "translate", label: "🌐 翻译", group: "特殊" },
    { key: "data_profile", label: "📈 数据画像", group: "特殊" },
    { key: "code_review", label: "🔍 代码审查", group: "特殊" },
    { key: "outline", label: "📋 大纲", group: "特殊" },
  ];
  const ROLES_WORKER = [
    { value: "worker", label: "🔧 默认" },
    { value: "analyst", label: "📊 分析师" },
    { value: "writer", label: "✍️ 写手" },
    { value: "reviewer", label: "🔍 审稿人" },
    { value: "executor", label: "⚡ 执行者" },
  ];

  // Step 100: 配方选择
  const { data: recipes = [] } = useQuery({
    queryKey: ["worker-recipes"],
    queryFn: async () => {
      const res = await fetch("/api/workers/recipes");
      if (!res.ok) return [];
      return res.json() as Promise<Array<{ id: string; name: string; description: string; icon: string; phase_count: number; phases: Array<{ title: string; output: string }> }>>;
    },
    staleTime: 60_000,
  });
  const [selectedRecipe, setSelectedRecipe] = useState("");

  const { events, connected, done, error, execute, fork, cancel, reset, hydrate, resubscribe } =
    useWorkerExecute();

  // 双重保险：done 状态可能未及时更新，从 events 推断
  const effectiveDone = done || (
    events.length > 0 &&
    ["worker.done", "worker.summary", "worker.error"].includes(
      events[events.length - 1]?.type ?? ""
    )
  );

  // 致命错误终止：最后一条事件是 worker.error
  const fatalError = events.length > 0 && events[events.length - 1]?.type === "worker.error";

  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [workerRunning, setWorkerRunning] = useState(false);
  const [reconnectNotice, setReconnectNotice] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Array<{
    run_id: string; agent_name: string; task: string; running: boolean;
    state: string; steps: number; files: Array<{path: string; size: number}>;
    accepted: boolean; created_at: string;
  }>>([]);

  // 追踪 runId——从 events 中反向查找最近 started（O(1) 命中）
  const latestRunId = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "worker.started") {
        return events[i].data?.run_id as string | undefined;
      }
    }
    return undefined;
  }, [events]);

  useEffect(() => {
    if (latestRunId) setCurrentRunId(latestRunId);
  }, [latestRunId]);

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
          setWorkerRunning(true);
          // 加载历史事件并还原终端
          try {
            const evResp = await fetch(`/api/workers/${latest.run_id}/events`, { signal: controller.signal });
            if (evResp.ok) {
              const evData = await evResp.json();
              if (evData.events?.length > 0) {
                hydrate(evData.events);
                if (evData.accepted) setAccepted(true);
                setReconnectNotice(`已恢复: ${latest.task?.slice(0, 60)}…`);
                // 如果 Worker 仍在运行，重新订阅 SSE 事件流
                if (evData.running) {
                  resubscribe(latest.run_id, evData.events.length);
                }
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 纪念墙跳转：URL 带 ?run_id=xxx → 自动加载该 Worker 历史
  useEffect(() => {
    const rid = searchParams.get("run_id");
    if (!rid) return;
    const load = async () => {
      try {
        const evResp = await fetch(`/api/workers/${rid}/events`);
        if (evResp.ok) {
          const evData = await evResp.json();
          if (evData.events?.length > 0) {
            hydrate(evData.events);
            setCurrentRunId(rid);
            if (evData.accepted) setAccepted(true);
            setReconnectNotice(`📋 已加载: ${evData.task?.slice(0, 60) || rid}`);
          }
        }
      } catch { /* 静默失败 */ }
    };
    load();
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps
  const buildRequest = useCallback((taskText: string, reuse: boolean) => ({
    agent_id: effectiveAgentId,
    task: taskText,
    role: workerRole,
    enabled_tools: enabledTools.length > 0 ? enabledTools : undefined,
    recipe_id: selectedRecipe || undefined,
    workspace_type: workspaceConfig.type,
    workspace_config: workspaceConfig.type === "cloud"
      ? { host: workspaceConfig.host, port: workspaceConfig.port, user: workspaceConfig.user, key: workspaceConfig.key, path: workspaceConfig.path }
      : { path: workspaceConfig.path },
    reuse_run_id: reuse && currentRunId ? currentRunId : undefined,
  }), [effectiveAgentId, workspaceConfig, currentRunId, workerRole, enabledTools, selectedRecipe]);

  // 执行新任务（新工作区）
  const handleExecute = useCallback(() => {
    if (!task.trim()) return;
    setWorkerRunning(true);
    execute(buildRequest(task.trim(), false));
  }, [task, execute, buildRequest]);

  // 停止（中断 SSE + 清除事件）
  const handleCancel = useCallback(() => {
    reset();
    setWorkerRunning(false);
  }, [reset]);

  const loadHistory = useCallback(async () => {
    try {
      const resp = await fetch("/api/workers/history");
      if (resp.ok) setHistory(await resp.json());
    } catch {}
  }, []);

  const handleSelectHistoryRun = useCallback(async (runId: string) => {
    const selectedHistory = history.find((item) => item.run_id === runId);
    setCurrentRunId(runId);
    setAccepted(selectedHistory?.accepted ?? false);
    try {
      const response = await fetch(`/api/workers/${runId}/events`);
      if (response.ok) {
        const payload = await response.json();
        if (payload.events?.length > 0) {
          hydrate(payload.events);
          // 如果 Worker 仍在运行，重新订阅 SSE 事件流
          if (payload.running) {
            setWorkerRunning(true);
            resubscribe(runId, payload.events.length);
          }
        }
      }
    } catch { /* 决策面板仍可读取持久化决策日志 */ }
  }, [history, hydrate, resubscribe]);

  const handleFork = useCallback((runId: string, stepIndex: number, alternativeDecision: string) => {
    setAccepted(false);
    setWorkerRunning(true);
    setReconnectNotice(`正在从 Step ${stepIndex} 创建新路线…`);
    void fork(runId, {
      fork_point_step: stepIndex,
      alternative_decision: alternativeDecision,
    });
  }, [fork]);

  // 挂载时加载历史
  useEffect(() => { loadHistory(); }, [loadHistory]);

  // M12 成就：第一个任务完成（仅成功）+ 工具大师 + 产出达人
  useEffect(() => {
    if (effectiveDone && events.length > 0) {
      // 仅 worker.done 才算完成（排除 worker.error）
      const lastDone = events[events.length - 1];
      if (lastDone?.type === "worker.done" || lastDone?.type === "worker.summary") {
        unlock("worker-first-task");
      }
      // 工具大师
      const specialNames = ["mindmap_generate", "chart_generate", "timeline_generate", "summarize", "translate", "data_profile", "code_review", "outline_generate"];
      let used: Set<string>;
      try { used = new Set(JSON.parse(localStorage.getItem("used-special-tools") || "[]")); } catch { used = new Set(); }
      for (const ev of events) {
        const toolName = (ev.data as any)?.tool_name as string | undefined;
        if (ev.type === "worker.tool_start" && toolName && specialNames.includes(toolName)) used.add(toolName);
      }
      localStorage.setItem("used-special-tools", JSON.stringify([...used]));
      if (used.size >= 3) unlock("worker-special-tool");
    }
  }, [effectiveDone, events]);

  // 产出达人：累计产出 10 个文件
  useEffect(() => {
    const totalFiles = history.reduce((sum, h) => sum + (h.files?.length || 0), 0);
    if (totalFiles >= 10) unlock("worker-output-10");
  }, [history]);

  // 任务完成/出错/停止时刷新历史
  useEffect(() => {
    if (events.length === 0) return;
    const last = events[events.length - 1];
    if (!last) return;
    const triggerTypes = ["worker.done", "worker.error", "worker.summary", "worker.cancelled"];
    if (triggerTypes.includes(last.type)) {
      setWorkerRunning(false);
      loadHistory();
    }
  }, [events, loadHistory]);

  const [accepted, setAccepted] = useState(false);

  // 已验收状态变化时刷新
  useEffect(() => { if (done || accepted) loadHistory(); }, [done, accepted, loadHistory]);

  // 运行中每 10 秒轮询一次历史（防止 SSE 断连导致 done 不触发）
  useEffect(() => {
    if (!connected && !workerRunning) return;
    const interval = setInterval(() => loadHistory(), 10_000);
    return () => clearInterval(interval);
  }, [connected, workerRunning, loadHistory]);

  // 重置 = 新任务（不清除 workerRunning，后台 Worker 可能仍在运行）
  const handleReset = useCallback(async () => {
    reset();
    setTask("");
    setCurrentRunId(null);
    setAccepted(false);
    // 检查后台是否仍有运行中的 Worker
    try {
      const resp = await fetch("/api/workers/running/list");
      if (resp.ok) {
        const running = await resp.json() as Array<{ run_id: string; running: boolean }>;
        const stillRunning = running.some((w) => w.running);
        setWorkerRunning(stillRunning);
      } else {
        setWorkerRunning(false);
      }
    } catch {
      setWorkerRunning(false);
    }
  }, [reset]);

  // 认可交付——先更新 UI，后台持久化 + 刷新历史
  const handleAccept = useCallback(() => {
    if (accepted) return;
    setAccepted(true);
    if (currentRunId) {
      fetch(`/api/workers/${currentRunId}/accept`, { method: "POST" })
        .then(() => loadHistory())
        .catch(() => {});
    }
  }, [currentRunId, accepted, loadHistory]);

  // 追加对话——复用当前工作区（直接传 currentRunId，不绕 buildRequest）
  const handleFollowUp = useCallback((instruction: string) => {
    const rid = currentRunId;  // 闭包捕获当前值
    if (!instruction.trim() || !rid) return;
    setAccepted(false);
    setWorkerRunning(true);
    execute({
      agent_id: effectiveAgentId,
      task: instruction.trim(),
      workspace_type: workspaceConfig.type,
      workspace_config: workspaceConfig.type === "cloud"
        ? { host: workspaceConfig.host, port: workspaceConfig.port, user: workspaceConfig.user, key: workspaceConfig.key, path: workspaceConfig.path }
        : { path: workspaceConfig.path },
      reuse_run_id: rid,
    });
  }, [currentRunId, effectiveAgentId, workspaceConfig, execute]);

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
      <div className="flex-shrink-0 px-4 py-4 border-b border-border bg-gradient-to-b from-surface-dark to-bg-primary">
        <div className="flex items-start gap-4">
          {/* 任务输入 */}
          <div className="flex-1">
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述你想让 Agent 完成的任务...&#10;例如：搜索 AI Agent 框架的最新发展，写一份报告"
              rows={3}
              disabled={connected || workerRunning}
              className="w-full bg-bg-primary border border-border rounded-lg px-4 py-3
                         text-sm font-mono text-text-primary placeholder-text-muted
                         resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            />

            {/* 示例任务 + 快捷操作栏 */}
            {!connected && !workerRunning && !effectiveDone && (
              <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                <span className="text-[10px] font-mono text-text-muted/60 shrink-0">💡 推荐:</span>
                {EXAMPLE_TASKS.map((t, i) => (
                  <button key={i} onClick={() => handleExample(t)}
                    className="text-[10px] font-mono px-2.5 py-1 rounded-full border border-border/60
                               text-text-muted hover:text-cyan-400 hover:border-cyan-700/40 hover:bg-cyan-500/5
                               transition-all truncate max-w-[260px]"
                    title={t}>{t.slice(0, 55)}…</button>
                ))}
              </div>
            )}
          </div>

          {/* 角色 + 工具 + 执行按钮 */}
          <div className="flex flex-col gap-2.5 shrink-0 min-w-[210px]">
            {!connected && !workerRunning && !effectiveDone && (
              <>
                {/* 配方选择 */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-text-muted/60 w-8">配方</span>
                  <select value={selectedRecipe} onChange={(e) => setSelectedRecipe(e.target.value)}
                    className="flex-1 bg-bg-primary border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary outline-none focus:border-accent-green/40 transition-all">
                    <option value="">— 不使用配方 —</option>
                    {recipes.map((r) => (
                      <option key={r.id} value={r.id} title={r.description}>{r.icon} {r.name}（{r.phase_count} 步）</option>
                    ))}
                  </select>
                </div>

                {/* 配方阶段信息 */}
                {selectedRecipe && (() => {
                  const recipe = recipes.find((r) => r.id === selectedRecipe);
                  if (!recipe) return null;
                  return (
                    <div className="ml-10 p-2 bg-bg-primary rounded-lg border border-border/60 space-y-1">
                      <div className="text-[10px] font-mono text-text-muted/60">{recipe.description}</div>
                      {recipe.phases.map((phase, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[10px] font-mono">
                          <span className="text-cyan-400 shrink-0 mt-0.5">{i + 1}.</span>
                          <span className="text-text-secondary">{phase.title}</span>
                          {phase.output && <span className="text-text-muted/50 truncate" title={phase.output}>→ {phase.output}</span>}
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* 角色选择 */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-text-muted/60 w-8">角色</span>
                  <select value={workerRole} onChange={(e) => setWorkerRole(e.target.value)}
                    className="flex-1 bg-bg-primary border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary outline-none focus:border-accent-green/40 transition-all">
                    {ROLES_WORKER.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                {/* 工具开关 */}
                <details className="text-xs font-mono group">
                  <summary className="flex items-center gap-2 text-text-muted cursor-pointer hover:text-text-primary select-none">
                    <span className="text-[10px] w-8">工具</span>
                    <span className="flex-1 px-2 py-1 rounded-lg border border-border/60 bg-bg-primary text-[10px] group-open:border-cyan-700/40 transition-all">
                      🛠️ {enabledTools.length === 0 ? "全部可用" : `已选 ${enabledTools.length}`}
                    </span>
                  </summary>
                  <div className="mt-1.5 p-2 bg-bg-primary rounded-lg border border-border/60 max-h-[180px] overflow-y-auto space-y-0.5 ml-10">
                    {ALL_TOOLS.map((t) => {
                      const allSelected = enabledTools.length === 0;
                      const checked = allSelected || enabledTools.includes(t.key);
                      return (
                        <label key={t.key}
                          className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-cyan-500/5 cursor-pointer transition-all">
                          <input type="checkbox" checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                if (allSelected) setEnabledTools(ALL_TOOLS.filter(t2 => t2.key !== t.key).map(t2 => t2.key));
                                else {
                                  const next = [...enabledTools, t.key];
                                  setEnabledTools(next.length === ALL_TOOLS.length ? [] : next);
                                }
                              } else {
                                if (allSelected) setEnabledTools(ALL_TOOLS.filter(t2 => t2.key !== t.key).map(t2 => t2.key));
                                else setEnabledTools(enabledTools.filter(k => k !== t.key));
                              }
                            }}
                            className="rounded w-3 h-3 accent-cyan-500" />
                          <span className="text-[10px] text-text-secondary">{t.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </details>

                <button onClick={handleExecute} disabled={!task.trim()}
                  className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-bg-secondary
                             disabled:text-text-muted text-white text-sm font-mono rounded-lg
                             transition-all disabled:cursor-not-allowed shadow-sm hover:shadow-md">
                  ▶ 执行任务
                </button>
              </>)}
            {connected && (
              <button
                onClick={handleCancel}
                className="px-4 py-2 bg-rose-800 hover:bg-rose-700 text-white text-sm
                           font-mono rounded transition-colors"
              >
                ⏹ 停止
              </button>
            )}
            {!connected && workerRunning && !effectiveDone && (
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

          </div>
        </div>

        {/* Agent 选择器 */}
        {!connected && !workerRunning && (
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

      <DecisionForkPanel
        runs={history}
        currentRunId={currentRunId}
        connected={connected}
        currentAgentId={effectiveAgentId}
        currentAgentName={selectedAgent?.name ?? ""}
        onSelectRun={(runId) => { void handleSelectHistoryRun(runId); }}
        onFork={handleFork}
      />

      {/* ── 主体区域 ── */}
      <div className="flex-1 flex min-h-0">
        {/* 中央: 终端 */}
        <div className="flex-1 min-w-0 flex flex-col">
          <WorkerTerminal
            events={events}
            connected={connected}
            done={effectiveDone}
            fatalError={fatalError}
            accepted={accepted}
            onAccept={handleAccept}
            onRevise={(instruction: string) => {
              if (!instruction.trim()) return;
              setAccepted(false);
              setWorkerRunning(true);
              execute({
                agent_id: effectiveAgentId,
                task: instruction.trim(),
                workspace_type: workspaceConfig.type,
                workspace_config: { path: workspaceConfig.path },
                reuse_run_id: currentRunId || latestRunId,
              });
            }}
            onNewTask={handleReset}
          />
        </div>

        {/* 右侧: 历史 + 文件面板 */}
        <div className="w-[300px] shrink-0 border-l border-border bg-bg-secondary/30 flex flex-col overflow-hidden">
          {/* 历史记录 */}
          <div className="flex-1 flex flex-col min-h-0 border-b border-border">
            <div className="px-3 py-2 border-b border-border/50 bg-bg-secondary/50 shrink-0">
              <span className="text-[10px] font-mono text-text-muted font-semibold">🕐 历史记录</span>
              <span className="text-[10px] font-mono text-text-muted/50 ml-2">{history.length} 条</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {history.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <span className="text-xl block mb-1">📋</span>
                  <p className="text-[10px] font-mono text-text-muted">暂无历史</p>
                  <p className="text-[10px] font-mono text-text-muted/50 mt-0.5">完成任务后出现</p>
                </div>
              ) : (
                history.map((h) => (
                  <button key={h.run_id}
                    onClick={() => { void handleSelectHistoryRun(h.run_id); loadHistory(); }}
                    className={`w-full text-left px-3 py-2 border-b border-border/30 hover:bg-bg-primary/50 transition-colors ${h.accepted ? "bg-emerald-500/5" : ""}`}>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${h.running ? "bg-emerald-400 animate-pulse" : h.accepted ? "bg-emerald-400" : "bg-text-muted/60"}`} />
                      <span className="text-[10px] font-mono text-text-secondary truncate flex-1">{h.agent_name || "Agent"}</span>
                      {h.accepted && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                          ✓ 已验收
                        </span>
                      )}
                      {h.running && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shrink-0 animate-pulse">
                          运行中
                        </span>
                      )}
                      <span className="text-[10px] font-mono text-text-muted/50">{h.created_at?.slice(5, 16)}</span>
                    </div>
                    <p className="text-[10px] font-mono text-text-muted truncate mt-0.5 ml-3">{h.task?.slice(0, 40)}</p>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* 文件面板 */}
          <div id="section-files" className="flex-1 flex flex-col min-h-0">
            <div className="px-3 py-2 border-b border-border/50 bg-bg-secondary/50 shrink-0">
              <span className="text-[10px] font-mono text-text-muted font-semibold">📁 文件</span>
              {currentRunId && <span className="text-[10px] font-mono text-text-muted/50 ml-2">{currentRunId.slice(0, 8)}</span>}
            </div>
            <div className="flex-1 overflow-hidden">
              <WorkspacePanel events={events} runId={currentRunId ?? undefined} connected={connected} />
            </div>
          </div>
        </div>
      </div>
    </div>
    </ErrorCatcher>
  );
}
