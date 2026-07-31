/**
 * WorkerBench — 工作台主页面。
 *
 * 布局: [左侧: 文件面板 (280px)] [中央: 终端 (flex-1)]
 * 顶部: 任务输入栏 + 执行/停止按钮 + 状态指示器
 */

import React, { useState, useCallback } from "react";
import { useWorkerExecute } from "../api/workers";
import WorkerTerminal from "../components/worker/WorkerTerminal";
import WorkspacePanel from "../components/worker/WorkspacePanel";
import WorkspaceSelector, {
  type WorkspaceConfig,
} from "../components/worker/WorkspaceSelector";

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
  const [task, setTask] = useState("");
  const [agentId, setAgentId] = useState("");
  const [showPanel, setShowPanel] = useState(true);
  const [showWorkspaceConfig, setShowWorkspaceConfig] = useState(false);
  const [workspaceConfig, setWorkspaceConfig] = useState<WorkspaceConfig>({
    type: "local",
    path: "",
  });

  const { events, connected, done, error, execute, cancel, reset } =
    useWorkerExecute();

  // 执行任务
  const handleExecute = useCallback(() => {
    if (!task.trim()) return;
    execute({
      agent_id: agentId || "worker-default",
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

  // 重置
  const handleReset = useCallback(() => {
    reset();
    setTask("");
  }, [reset]);

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
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-surface hover:bg-surface-dark text-text-secondary
                           text-sm font-mono rounded border border-border transition-colors"
              >
                ↺ 新任务
              </button>
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

        {/* Agent ID 输入（可选） */}
        {!connected && (
          <>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs font-mono text-text-muted">Agent:</span>
              <input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="(默认 Worker)"
                disabled={connected}
                className="bg-transparent border-b border-border text-xs font-mono
                           text-text-secondary placeholder-text-muted px-1
                           focus:outline-none focus:border-cyan-700/50 w-48"
              />
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
              <div className="mt-2 p-3 border border-border rounded bg-surface">
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
            <WorkspacePanel events={events} />
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
