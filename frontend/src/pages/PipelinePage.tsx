/**
 * PipelinePage — 管道编辑器 + 运行监控。
 *
 * 配置面板式——用下拉选择依赖关系，不写拖拽。
 */

import React, { useState, useCallback, useEffect, useRef } from "react";

// =============================================================================
// 类型
// =============================================================================

interface PipelineNode {
  id: string;
  title: string;
  agent_id: string;
  task: string;
  depends_on: string[];
}

interface PipelineDef {
  id?: string;
  name: string;
  description: string;
  nodes: PipelineNode[];
}

interface PipelineRunState {
  running: boolean;
  events: Array<{ type: string; data: Record<string, unknown> }>;
  nodes: Record<string, string>;  // node_id → status
}

// =============================================================================
// 主组件
// =============================================================================

export default function PipelinePage() {
  const [pipelines, setPipelines] = useState<PipelineDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [run, setRun] = useState<PipelineRunState>({
    running: false,
    events: [],
    nodes: {},
  });
  const abortRef = useRef<AbortController | null>(null);

  // 编辑中的管道
  const [draft, setDraft] = useState<PipelineDef>({
    name: "",
    description: "",
    nodes: [{ id: "node1", title: "步骤 1", agent_id: "", task: "", depends_on: [] }],
  });

  // 加载管道列表
  const loadPipelines = useCallback(async () => {
    try {
      const resp = await fetch("/api/pipelines/");
      const data = await resp.json();
      setPipelines(data);
    } catch {
      // API 不可用
    }
  }, []);

  useEffect(() => {
    loadPipelines();
  }, [loadPipelines]);

  // 添加节点
  const addNode = useCallback(() => {
    setDraft((prev) => ({
      ...prev,
      nodes: [
        ...prev.nodes,
        {
          id: `node${prev.nodes.length + 1}`,
          title: `步骤 ${prev.nodes.length + 1}`,
          agent_id: "",
          task: "",
          depends_on: [],
        },
      ],
    }));
  }, []);

  // 删除节点
  const removeNode = useCallback((nodeId: string) => {
    setDraft((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.id !== nodeId).map((n) => ({
        ...n,
        depends_on: n.depends_on.filter((d) => d !== nodeId),
      })),
    }));
  }, []);

  // 保存管道
  const savePipeline = useCallback(async () => {
    try {
      const resp = await fetch("/api/pipelines/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (resp.ok) {
        setEditing(false);
        loadPipelines();
      }
    } catch (e) {
      console.error("Save failed:", e);
    }
  }, [draft, loadPipelines]);

  // 执行管道
  const executePipeline = useCallback(async () => {
    if (!selectedId) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setRun({ running: true, events: [], nodes: {} });

    try {
      const resp = await fetch(`/api/pipelines/${selectedId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_type: "local" }),
        signal: controller.signal,
      });

      const reader = resp.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const ev = JSON.parse(line.slice(6));
              setRun((prev) => {
                const newEvents = [...prev.events, ev];
                const newNodes = { ...prev.nodes };
                if (ev.type === "pipeline.node_status") {
                  newNodes[ev.data.node_id] = ev.data.status;
                }
                return {
                  ...prev,
                  events: newEvents,
                  nodes: newNodes,
                  running: ev.type !== "pipeline.done",
                };
              });
            } catch {
              // skip
            }
          }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
    } finally {
      setRun((prev) => ({ ...prev, running: false }));
    }
  }, [selectedId]);

  const cancelRun = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  // ── 渲染 ──

  const statusColor = (status: string) => {
    switch (status) {
      case "running": return "bg-blue-500 animate-pulse";
      case "complete": return "bg-emerald-500";
      case "error": return "bg-rose-500";
      case "skipped": return "bg-gray-500";
      default: return "bg-gray-700";
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-dark">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-mono text-text-primary font-semibold">
            🔗 Agent 管道
          </h2>
          {!editing && (
            <select
              value={selectedId || ""}
              onChange={(e) => setSelectedId(e.target.value || null)}
              className="bg-surface border border-border rounded px-2 py-1 text-xs font-mono
                         text-text-secondary focus:outline-none"
            >
              <option value="">— 选择管道 —</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.nodes?.length || 0} 节点)
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => {
              setEditing(!editing);
              if (!editing) {
                setDraft({ name: "", description: "", nodes: [{ id: "node1", title: "步骤 1", agent_id: "", task: "", depends_on: [] }] });
              }
            }}
            className="text-xs font-mono px-2 py-1 rounded border border-border
                       text-text-secondary hover:text-cyan-400 transition-colors"
          >
            {editing ? "取消" : "+ 新建"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {selectedId && !run.running && (
            <button
              onClick={executePipeline}
              className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-white text-xs
                         font-mono rounded transition-colors"
            >
              ▶ 运行
            </button>
          )}
          {run.running && (
            <button
              onClick={cancelRun}
              className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white text-xs
                         font-mono rounded transition-colors"
            >
              ⏹ 停止
            </button>
          )}
        </div>
      </div>

      {/* 主体 */}
      <div className="flex-1 flex min-h-0">
        {/* 编辑面板 */}
        <div className="w-1/2 border-r border-border overflow-y-auto p-4">
          {editing ? (
            <div className="space-y-4">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="管道名称"
                className="w-full bg-surface border border-border rounded px-3 py-1.5
                           text-sm font-mono text-text-primary placeholder-text-muted
                           focus:outline-none focus:border-cyan-700/50"
              />

              {/* 节点列表 */}
              <div className="space-y-3">
                {draft.nodes.map((node, idx) => (
                  <div
                    key={node.id}
                    className="p-3 border border-border rounded bg-surface-dark space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-cyan-400 font-semibold">
                        #{idx + 1} {node.id}
                      </span>
                      {draft.nodes.length > 1 && (
                        <button
                          onClick={() => removeNode(node.id)}
                          className="text-xs text-rose-400 hover:text-rose-300"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <input
                      value={node.title}
                      onChange={(e) => {
                        const newNodes = [...draft.nodes];
                        newNodes[idx] = { ...node, title: e.target.value };
                        setDraft({ ...draft, nodes: newNodes });
                      }}
                      placeholder="节点标题"
                      className="w-full bg-surface border border-border rounded px-2 py-1
                                 text-xs font-mono text-text-primary placeholder-text-muted
                                 focus:outline-none focus:border-cyan-700/50"
                    />
                    <input
                      value={node.agent_id}
                      onChange={(e) => {
                        const newNodes = [...draft.nodes];
                        newNodes[idx] = { ...node, agent_id: e.target.value };
                        setDraft({ ...draft, nodes: newNodes });
                      }}
                      placeholder="Agent ID"
                      className="w-full bg-surface border border-border rounded px-2 py-1
                                 text-xs font-mono text-text-primary placeholder-text-muted
                                 focus:outline-none focus:border-cyan-700/50"
                    />
                    <input
                      value={node.task}
                      onChange={(e) => {
                        const newNodes = [...draft.nodes];
                        newNodes[idx] = { ...node, task: e.target.value };
                        setDraft({ ...draft, nodes: newNodes });
                      }}
                      placeholder="任务描述"
                      className="w-full bg-surface border border-border rounded px-2 py-1
                                 text-xs font-mono text-text-primary placeholder-text-muted
                                 focus:outline-none focus:border-cyan-700/50"
                    />
                    {/* 依赖选择 */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-text-muted">依赖:</span>
                      {draft.nodes
                        .filter((n) => n.id !== node.id)
                        .map((n) => (
                          <label
                            key={n.id}
                            className="flex items-center gap-1 text-xs font-mono text-text-secondary"
                          >
                            <input
                              type="checkbox"
                              checked={node.depends_on.includes(n.id)}
                              onChange={(e) => {
                                const newNodes = [...draft.nodes];
                                const newDepends = e.target.checked
                                  ? [...node.depends_on, n.id]
                                  : node.depends_on.filter((d) => d !== n.id);
                                newNodes[idx] = { ...node, depends_on: newDepends };
                                setDraft({ ...draft, nodes: newNodes });
                              }}
                            />
                            {n.id}
                          </label>
                        ))}
                      {draft.nodes.length <= 1 && (
                        <span className="text-xs text-text-muted">(无)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={addNode}
                  className="px-3 py-1 text-xs font-mono rounded border border-border
                             text-text-secondary hover:text-cyan-400 transition-colors"
                >
                  + 添加节点
                </button>
                <button
                  onClick={savePipeline}
                  disabled={!draft.name || draft.nodes.length === 0}
                  className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:bg-surface-dark
                             disabled:text-text-muted text-white text-xs font-mono rounded
                             transition-colors"
                >
                  保存管道
                </button>
              </div>
            </div>
          ) : selectedId ? (
            <div className="flex items-center justify-center h-full text-text-muted text-sm font-mono">
              选择一个管道并点击运行
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-text-muted text-sm font-mono">
              创建或选择一个管道
            </div>
          )}
        </div>

        {/* 运行监控面板 */}
        <div className="w-1/2 overflow-y-auto p-4">
          {(run.running || run.events.length > 0) ? (
            <div className="space-y-3">
              {/* 节点状态 */}
              {Object.keys(run.nodes).length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-mono text-text-secondary mb-2 font-semibold">
                    节点状态
                  </div>
                  {Object.entries(run.nodes).map(([nodeId, status]) => (
                    <div key={nodeId} className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${statusColor(status)}`} />
                      <span className="text-xs font-mono text-text-secondary">{nodeId}</span>
                      <span className="text-xs font-mono text-text-muted">{status}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* 预览：节点执行顺序 */}
              {draft.nodes.length > 0 && (
                <div className="p-3 border border-cyan-700/30 rounded bg-cyan-900/5">
                  <div className="text-xs font-mono text-cyan-400 mb-1">管道预览</div>
                  <div className="text-xs font-mono text-text-secondary">
                    {draft.nodes.map((n, i) => (
                      <span key={n.id}>
                        {i > 0 && " → "}
                        <span>{n.id}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 事件日志 */}
              <div className="space-y-1">
                <div className="text-xs font-mono text-text-secondary font-semibold">
                  事件日志 ({run.events.length})
                </div>
                <div className="max-h-96 overflow-y-auto space-y-0.5">
                  {run.events.slice(-50).map((ev, i) => (
                    <div key={i} className="text-xs font-mono text-text-muted">
                      [{ev.type}] {JSON.stringify(ev.data).slice(0, 100)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <span className="text-3xl block mb-2">🔗</span>
                <p className="text-text-muted font-mono text-sm">
                  运行管道后在此查看状态
                </p>
                <p className="text-text-muted font-mono text-xs mt-1">
                  节点状态颜色: 蓝色=运行中 绿色=完成 红色=失败
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
