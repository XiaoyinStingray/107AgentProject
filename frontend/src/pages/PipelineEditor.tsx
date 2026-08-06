// @ts-nocheck -- ReactFlow v12 node data 泛型太严格，运行时类型安全
/**
 * PipelineEditor — Step 106: 图形化管线编辑器。
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
  ReactFlow, Controls, MiniMap, Background, BackgroundVariant,
  useNodesState, useEdgesState, addEdge, Connection, MarkerType,
  type Node, type Edge, Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAgents } from "../api/agents";
import PipelineNodeComponent from "../components/pipeline/PipelineNodeComponent";
import type { PipelineNodeData } from "../components/pipeline/PipelineNodeComponent";

/* ── 工具列表 ── */
const ALL_SPECIAL_TOOLS = [
  { key: "mindmap",   label: "🧠 思维导图", desc: "生成 Mermaid 思维导图" },
  { key: "chart",     label: "📊 图表",     desc: "matplotlib 图表" },
  { key: "timeline",  label: "📅 时间线",   desc: "交互式时间线 HTML" },
  { key: "summarize", label: "📝 摘要",     desc: "LLM 智能摘要" },
  { key: "translate", label: "🌐 翻译",     desc: "文档翻译" },
  { key: "data_profile", label: "📈 数据画像", desc: "pandas 统计" },
  { key: "code_review",  label: "🔍 代码审查", desc: "4 维度审查" },
  { key: "outline",   label: "📋 大纲",     desc: "文档大纲生成" },
];

const ROLES = [
  { value: "worker",   label: "🔧 默认" },
  { value: "analyst",  label: "📊 分析师" },
  { value: "writer",   label: "✍️ 写手" },
  { value: "reviewer", label: "🔍 审稿人" },
  { value: "executor", label: "⚡ 执行者" },
];

/* ── 节点类型注册 ── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes = { pipelineNode: PipelineNodeComponent as any };

/* ── 类型 ── */
interface PNode {
  id: string; title: string; agent_id: string; task: string; role: string;
  produces: string[]; depends_on: string[]; extra_tools: string[];
}

interface PEdge {
  id: string; from_node: string; to_node: string; edge_type: string;
  condition: string | null; max_iterations: number; label: string;
}

/* ── 边样式 ── */
function edgeStyle(type: string) {
  if (type === "loop") return { stroke: "#f59e0b", strokeDasharray: "6 3" };
  if (type === "branch") return { stroke: "#10b981", strokeDasharray: "2 2" };
  return { stroke: "#6b7280" };
}

export default function PipelineEditor() {
  const { data: agents = [] } = useAgents();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pipeName, setPipeName] = useState("新建管线");
  const [pipeDesc, setPipeDesc] = useState("");
  const [pipeId, setPipeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pipeList, setPipeList] = useState<Array<{id:string;name:string}>>([]);
  const nodeCounter = useRef(1);

  // 加载管线列表
  const refreshList = useCallback(async () => {
    try { const r = await fetch("/api/pipelines/"); if (r.ok) setPipeList(await r.json()); } catch {}
  }, []);
  useEffect(() => { refreshList(); }, [refreshList]);

  // 选中节点数据（类型安全访问）
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId],
  );
  const nd = (selectedNode?.data ?? {}) as Partial<PipelineNodeData>;
  const getVal = <K extends keyof PipelineNodeData>(key: K, fallback: PipelineNodeData[K]) =>
    (nd[key] ?? fallback) as PipelineNodeData[K];

  // 从现有 Pipeline 加载
  const loadPipeline = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/pipelines/${id}`);
      if (!r.ok) return;
      const p = await r.json();
      setPipeId(p.id); setPipeName(p.name); setPipeDesc(p.description || "");
      const ns: Node[] = (p.nodes || []).map((n: PNode, i: number) => ({
        id: n.id, type: "pipelineNode",
        position: { x: 50 + (i % 3) * 280, y: 50 + Math.floor(i / 3) * 200 },
        data: {
          id: n.id, title: n.title, agent_id: n.agent_id, task: n.task, role: n.role || "worker",
          produces: n.produces || [], extra_tools: n.extra_tools || [],
        },
      }));
      const es: Edge[] = (p.edges || []).map((e: PEdge) => ({
        id: e.id, source: e.from_node, target: e.to_node,
        type: "smoothstep",
        style: edgeStyle(e.edge_type),
        markerEnd: { type: MarkerType.ArrowClosed, color: e.edge_type === "loop" ? "#f59e0b" : "#6b7280" },
        label: e.condition || e.label || undefined,
        data: { edge_type: e.edge_type, condition: e.condition, max_iterations: e.max_iterations },
      }));
      // 也从 depends_on 生成 flow 边
      const extraEs: Edge[] = [];
      for (const n of (p.nodes || [])) {
        for (const dep of (n.depends_on || [])) {
          const exist = es.find((e) => e.source === dep && e.target === n.id);
          if (!exist) {
            extraEs.push({
              id: `e_${dep}_${n.id}`, source: dep, target: n.id,
              type: "smoothstep", style: edgeStyle("flow"),
              markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
              data: { edge_type: "flow" },
            });
          }
        }
      }
      setNodes(ns); setEdges([...es, ...extraEs]);
      nodeCounter.current = ns.length + 1;
      setSelectedNodeId(null);
    } catch { setMsg("加载失败"); }
  }, [setNodes, setEdges]);

  // 添加节点
  const addNode = useCallback(() => {
    const id = `node${nodeCounter.current++}`;
    const x = 100 + Math.random() * 300;
    const y = 100 + Math.random() * 200;
    const newNode: Node = {
      id, type: "pipelineNode", position: { x, y },
      data: {
        id, title: `节点 ${nodeCounter.current - 1}`, agent_id: agents[0]?.id || "worker-default",
        task: "", role: "worker", produces: [], extra_tools: [],
      } satisfies PipelineNodeData,
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  }, [setNodes]);

  // 连线
  const onConnect = useCallback((conn: Connection) => {
    const newEdge: Edge = {
      ...conn,
      id: `e_${conn.source}_${conn.target}_${Date.now()}`,
      type: "smoothstep",
      style: edgeStyle("flow"),
      markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
      data: { edge_type: "flow" },
    };
    setEdges((eds) => addEdge(newEdge, eds));
  }, [setEdges]);

  // 更新选中节点的字段
  const updateNodeField = useCallback((field: string, value: unknown) => {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.map((n) =>
      n.id === selectedNodeId ? { ...n, data: { ...n.data, [field]: value } } : n,
    ));
  }, [selectedNodeId, setNodes]);

  // 保存
  const handleSave = useCallback(async () => {
    setSaving(true); setMsg(null);
    const pnodes = nodes.map((n) => ({
      id: n.id, title: n.data.title,
      agent_id: (n.data as PipelineNodeData).agent_id || "worker-default",
      task: n.data.task || "", role: n.data.role || "worker",
      produces: n.data.produces || [], extra_tools: n.data.extra_tools || [],
      depends_on: edges
        .filter((e) => e.target === n.id && e.data?.edge_type !== "loop" && e.data?.edge_type !== "branch")
        .map((e) => e.source),
      depends_on_files: [], expects: [], enabled_tools: [],
    }));
    const pedges = edges.map((e) => ({
      id: e.id, from_node: e.source, to_node: e.target,
      edge_type: e.data?.edge_type || "flow",
      condition: e.data?.condition || null, condition_field: null,
      max_iterations: e.data?.max_iterations || 3, iteration_label: "",
      priority: 0, label: e.data?.label || "",
    }));
    const body = { name: pipeName, description: pipeDesc, nodes: pnodes, edges: pedges };
    try {
      const url = pipeId ? `/api/pipelines/${pipeId}` : "/api/pipelines/";
      const method = pipeId ? "PUT" : "POST";
      const r = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json();
        if (!pipeId) setPipeId(d.id);
        setMsg(`✅ 已保存 (${d.node_count} 节点, ${d.edge_count || pedges.length} 边)`);
      } else {
        let detail = "";
        try { const err = await r.json(); detail = err.detail || ""; } catch {}
        if (r.status === 400) setMsg(`❌ 数据不合法: ${detail || "请检查节点和边的配置"}`);
        else if (r.status === 404) setMsg(`❌ 管线不存在（请刷新页面）`);
        else if (r.status >= 500) setMsg(`❌ 服务器错误 (${r.status}): ${detail || "请稍后重试"}`);
        else setMsg(`❌ 保存失败 (${r.status}): ${detail || "未知错误"}`);
      }
    } catch (e) {
      const msg = String(e);
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError"))
        setMsg("❌ 无法连接后端，请确认后端服务已启动 (python run.py)");
      else if (msg.includes("timeout") || msg.includes("Timeout"))
        setMsg("❌ 请求超时，请检查后端服务状态");
      else
        setMsg(`❌ 网络错误: ${msg}`);
    }
    setSaving(false);
  }, [nodes, edges, pipeName, pipeDesc, pipeId]);

  // 自动布局 (dagre)
  const autoLayout = useCallback(() => {
    // 简单层级布局：按拓扑排序分层
    const inDegree: Record<string, number> = {};
    for (const n of nodes) inDegree[n.id] = 0;
    for (const e of edges) {
      if (e.data?.edge_type === "flow" || !e.data?.edge_type) {
        inDegree[e.target] = (inDegree[e.target] || 0) + 1;
      }
    }
    const levels: string[][] = [];
    const remaining = new Set(nodes.map((n) => n.id));
    while (remaining.size > 0) {
      const current = [...remaining].filter((id) => (inDegree[id] || 0) === 0);
      if (current.length === 0) {
        // 有环，把剩下的放一层
        levels.push([...remaining]);
        break;
      }
      levels.push(current);
      for (const id of current) {
        remaining.delete(id);
        for (const e of edges) {
          if (e.source === id) inDegree[e.target] = (inDegree[e.target] || 1) - 1;
        }
      }
    }
    setNodes((nds) => nds.map((n) => {
      const levelIdx = levels.findIndex((l) => l.includes(n.id));
      const posInLevel = levels[levelIdx]?.indexOf(n.id) ?? 0;
      const totalInLevel = levels[levelIdx]?.length ?? 1;
      return {
        ...n,
        position: {
          x: 50 + posInLevel * 280 - (totalInLevel * 280) / 2 + 400,
          y: 50 + levelIdx * 200,
        },
      };
    }));
  }, [nodes, edges, setNodes]);

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* 顶部工具栏 */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-bg-secondary/80 shrink-0 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono text-text-primary font-semibold">🎨 管线编辑器</span>
          <a href="/pipeline" className="text-[10px] font-mono text-text-muted hover:text-text-secondary transition-colors ml-1">
            旧版表单 →
          </a>
        </div>
        <div className="w-px h-5 bg-border" />
        <input value={pipeName} onChange={(e) => setPipeName(e.target.value)}
          className="w-36 px-2.5 py-1.5 text-xs font-mono bg-bg-primary border border-border rounded-lg text-text-primary outline-none focus:border-accent-green/40 transition-all"
          placeholder="管线名称"
        />
        <input value={pipeDesc} onChange={(e) => setPipeDesc(e.target.value)}
          className="w-44 px-2.5 py-1.5 text-xs font-mono bg-bg-primary border border-border rounded-lg text-text-secondary outline-none focus:border-accent-green/40 transition-all"
          placeholder="描述（可选）"
        />
        <div className="flex-1" />
        {/* 加载已有管线 */}
        <select
          value=""
          onChange={(e) => { if (e.target.value) loadPipeline(e.target.value); }}
          className="px-2.5 py-1.5 text-xs font-mono bg-bg-primary border border-border rounded-lg text-text-secondary outline-none focus:border-accent-green/40 transition-all min-w-[120px]">
          <option value="">📂 加载管线…</option>
          {pipeList.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          {pipeList.length === 0 && <option disabled>暂无已保存的管线</option>}
        </select>
        <button onClick={addNode}
          className="px-3 py-1.5 text-xs font-mono rounded-lg border border-accent-green/40 text-accent-green hover:bg-accent-green/10 transition-all">
          + 添加节点
        </button>
        <button onClick={autoLayout}
          className="px-3 py-1.5 text-xs font-mono rounded-lg border border-border text-text-secondary hover:border-text-secondary/40 hover:bg-bg-primary/50 transition-all">
          ▦ 自动布局
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-4 py-1.5 text-xs font-mono rounded-lg border border-accent-orange/40 bg-accent-orange/10 text-accent-orange hover:bg-accent-orange/20 transition-all disabled:opacity-40">
          {saving ? "保存中…" : "💾 保存"}
        </button>
        {msg && <span className="text-[10px] font-mono text-text-secondary animate-fade-in">{msg}</span>}
      </div>

      {/* 主体：画布 + 右侧面板 */}
      <div className="flex-1 flex">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_e, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode={["Backspace", "Delete"]}
            multiSelectionKeyCode="Shift"
            className="!bg-bg-primary"
          >
            {/* 空画布引导 */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div className="text-center space-y-3">
                  <div className="text-5xl">🔗</div>
                  <h2 className="text-lg font-mono text-text-primary">创建你的第一个管线</h2>
                  <p className="text-sm font-mono text-text-secondary/60 max-w-md">
                    点击 <span className="text-accent-green">+ 添加节点</span> 创建节点，
                    从节点右侧圆点拖出连线到另一个节点左侧圆点来建立数据流。
                  </p>
                  <div className="flex gap-2 justify-center text-[10px] font-mono text-text-muted/50">
                    <span>🟢 flow 数据流</span>
                    <span>🟠 loop 回边</span>
                    <span>🟢 branch 分支</span>
                  </div>
                </div>
              </div>
            )}
            {/* 节点数统计 */}
            {nodes.length > 0 && (
              <Panel position="bottom-center" className="!bg-bg-secondary/90 !border !border-border/60 !rounded-full !px-3 !py-1 !text-[10px] !font-mono !text-text-muted !backdrop-blur-sm">
                {nodes.length} 节点 · {edges.length} 连线 · 点击节点编辑 · 拖拽圆点连线 · Backspace 删除
              </Panel>
            )}
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#334155" />
            <Controls className="!bg-bg-primary !border-border !rounded-lg" />
            <MiniMap
              className="!bg-bg-secondary !border-border !rounded-lg"
              nodeColor={(n) => {
                const role = (n.data as PipelineNodeData)?.role || "worker";
                const colors: Record<string, string> = { analyst: "#7c3aed", writer: "#059669", reviewer: "#d97706", executor: "#4b5563" };
                return colors[role] || "#6b7280";
              }}
            />
          </ReactFlow>
        </div>

        {/* 右侧编辑面板 */}
        {selectedNode && (
          <div className="w-72 shrink-0 border-l border-border bg-bg-secondary/50 overflow-y-auto p-4 space-y-4">
            <h3 className="text-sm font-mono text-text-primary font-semibold">
              编辑节点: {selectedNode.data.title}
            </h3>

            {/* 标题 */}
            <label className="block">
              <span className="text-[10px] font-mono text-text-secondary">标题</span>
              <input value={selectedNode.data.title || ""}
                onChange={(e) => updateNodeField("title", e.target.value)}
                className="w-full mt-0.5 px-2 py-1 text-xs font-mono bg-bg-primary border border-border rounded text-text-primary outline-none focus:border-accent-green/40"
              />
            </label>

            {/* Agent */}
            <label className="block">
              <span className="text-[10px] font-mono text-text-secondary">Agent</span>
              <select value={selectedNode.data.agent_id || ""}
                onChange={(e) => updateNodeField("agent_id", e.target.value)}
                className="w-full mt-0.5 px-2 py-1 text-xs font-mono bg-bg-primary border border-border rounded text-text-primary outline-none"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>{a.name || a.id}</option>
                ))}
              </select>
            </label>

            {/* 角色 */}
            <label className="block">
              <span className="text-[10px] font-mono text-text-secondary">角色</span>
              <select value={selectedNode.data.role || "worker"}
                onChange={(e) => updateNodeField("role", e.target.value)}
                className="w-full mt-0.5 px-2 py-1 text-xs font-mono bg-bg-primary border border-border rounded text-text-primary outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>

            {/* 任务 */}
            <label className="block">
              <span className="text-[10px] font-mono text-text-secondary">任务描述</span>
              <textarea value={selectedNode.data.task || ""}
                onChange={(e) => updateNodeField("task", e.target.value)}
                rows={3}
                className="w-full mt-0.5 px-2 py-1 text-xs font-mono bg-bg-primary border border-border rounded text-text-primary outline-none focus:border-accent-green/40 resize-none"
              />
            </label>

            {/* 产出文件 */}
            <label className="block">
              <span className="text-[10px] font-mono text-text-secondary">产出文件 (逗号分隔)</span>
              <input
                value={(selectedNode.data.produces || []).join(", ")}
                onChange={(e) => updateNodeField("produces",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="report.md, chart.png"
                className="w-full mt-0.5 px-2 py-1 text-xs font-mono bg-bg-primary border border-border rounded text-text-primary outline-none focus:border-accent-green/40"
              />
            </label>

            {/* 特殊工具 (折叠) */}
            <details className="text-xs font-mono group">
              <summary className="text-[10px] text-text-secondary cursor-pointer hover:text-text-primary select-none">
                🧰 特殊工具 {selectedNode.data.extra_tools?.length > 0 ? `(${selectedNode.data.extra_tools.length})` : ""}
              </summary>
              <div className="mt-1 space-y-0.5 max-h-[200px] overflow-y-auto">
                {ALL_SPECIAL_TOOLS.map((tool) => {
                  const active = (selectedNode.data.extra_tools || []).includes(tool.key);
                  return (
                    <label key={tool.key}
                      className="flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-bg-card/30 cursor-pointer text-xs">
                      <input type="checkbox" checked={active}
                        onChange={(e) => {
                          const cur = new Set(selectedNode.data.extra_tools || []);
                          if (e.target.checked) cur.add(tool.key); else cur.delete(tool.key);
                          updateNodeField("extra_tools", [...cur]);
                        }}
                        className="rounded"
                      />
                      <span className="font-mono text-text-primary">{tool.label}</span>
                      <span className="text-[9px] text-text-secondary/60 ml-auto">{tool.desc}</span>
                    </label>
                  );
                })}
              </div>
            </details>

            {/* Loop/Branch 面板 (折叠) */}
            <details className="text-xs font-mono group" open>
              <summary className="text-[10px] text-text-secondary cursor-pointer hover:text-text-primary select-none">
                🔄🔀 回边 / 分支 控制流
              </summary>
              <p className="text-[9px] font-mono text-text-muted/50 mt-1 mb-2">
                从当前节点（{selectedNode.id}）画控制流到目标节点
              </p>

              {/* 已有特殊边（可删除） */}
              {edges.filter(e => e.source === selectedNode.id && e.data?.edge_type !== 'flow').length > 0 && (
                <div className="mb-2 space-y-0.5">
                  {edges.filter(e => e.source === selectedNode.id && e.data?.edge_type !== 'flow').map(e => (
                    <div key={e.id} className="flex items-center gap-1 text-[9px] font-mono bg-bg-primary rounded px-2 py-1 border border-border/40">
                      <span className={e.data?.edge_type === "loop" ? "text-accent-orange" : "text-accent-green"}>
                        {e.data?.edge_type === "loop" ? "🔄" : "🔀"}
                      </span>
                      <span className="text-text-secondary">{e.source}</span>
                      <span className="text-text-muted">→</span>
                      <span className="text-text-secondary">{e.target}</span>
                      <span className="text-text-muted/50 ml-auto">{e.data?.condition || ""}</span>
                      <button onClick={() => setEdges(eds => eds.filter(x => x.id !== e.id))}
                        className="ml-1 text-text-muted hover:text-red-400">✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* 添加回边 — 下拉选择目标节点 */}
              <details className="text-xs font-mono group">
                <summary className="flex items-center gap-1 px-2 py-1.5 rounded border border-dashed border-accent-orange/30 text-accent-orange/70 hover:text-accent-orange hover:border-accent-orange/50 cursor-pointer transition-colors">
                  <span>🔄 添加回边</span>
                </summary>
                <div className="mt-1.5 p-2 bg-bg-primary rounded border border-border/60 space-y-1.5">
                  <select id="loop-target" className="w-full px-2 py-1 text-[10px] font-mono bg-bg-secondary border border-border rounded text-text-primary outline-none">
                    <option value="">选择回边目标…</option>
                    {nodes.filter(n => n.id !== selectedNode.id).map(n => (
                      <option key={n.id} value={n.id}>{n.data.title} ({n.id})</option>
                    ))}
                  </select>
                  <select id="loop-cond" className="w-full px-2 py-1 text-[10px] font-mono bg-bg-secondary border border-border rounded text-text-primary outline-none">
                    <option value="FAILED">质检结果为 FAILED</option>
                    <option value="PASS">质检结果为 PASS</option>
                    <option value="/error|失败/">包含关键词 error/失败</option>
                    <option value="score < 0.7">评分 score &lt; 0.7</option>
                    <option value="">无条件（始终触发）</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-text-muted">最多</span>
                    <input id="loop-max" type="number" min={1} max={10} defaultValue={3}
                      className="w-12 px-1 py-0.5 text-[10px] font-mono bg-bg-secondary border border-border rounded text-text-primary outline-none text-center" />
                    <span className="text-[9px] text-text-muted">次</span>
                  </div>
                  <button onClick={() => {
                    const target = (document.getElementById("loop-target") as HTMLSelectElement)?.value;
                    const cond = (document.getElementById("loop-cond") as HTMLInputElement)?.value || "";
                    const maxIter = parseInt((document.getElementById("loop-max") as HTMLInputElement)?.value || "3", 10);
                    if (!target || !nodes.find(n => n.id === target)) return;
                    const newEdge: Edge = {
                      id: `e_loop_${selectedNode.id}_${target}_${Date.now()}`,
                      source: selectedNode.id, target, type: "smoothstep",
                      style: edgeStyle("loop"),
                      markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
                      label: cond || "loop",
                      data: { edge_type: "loop", condition: cond || null, max_iterations: maxIter || 3 },
                    };
                    setEdges(eds => [...eds, newEdge]);
                  }}
                    className="w-full py-1 text-[10px] font-mono rounded bg-accent-orange/10 border border-accent-orange/30 text-accent-orange hover:bg-accent-orange/20 transition-colors">
                    确认添加回边
                  </button>
                </div>
              </details>

              {/* 添加分支 — 下拉选择目标节点 */}
              <details className="text-xs font-mono group mt-1">
                <summary className="flex items-center gap-1 px-2 py-1.5 rounded border border-dashed border-accent-green/30 text-accent-green/70 hover:text-accent-green hover:border-accent-green/50 cursor-pointer transition-colors">
                  <span>🔀 添加分支</span>
                </summary>
                <div className="mt-1.5 p-2 bg-bg-primary rounded border border-border/60 space-y-1.5">
                  <select id="branch-target" className="w-full px-2 py-1 text-[10px] font-mono bg-bg-secondary border border-border rounded text-text-primary outline-none">
                    <option value="">选择分支目标…</option>
                    {nodes.filter(n => n.id !== selectedNode.id).map(n => (
                      <option key={n.id} value={n.id}>{n.data.title} ({n.id})</option>
                    ))}
                  </select>
                  <select id="branch-cond" className="w-full px-2 py-1 text-[10px] font-mono bg-bg-secondary border border-border rounded text-text-primary outline-none">
                    <option value="PASS">质检结果为 PASS</option>
                    <option value="FAILED">质检结果为 FAILED</option>
                    <option value="score &gt;= 0.7">评分 score &gt;= 0.7</option>
                    <option value="">无条件（始终触发）</option>
                  </select>
                  <button onClick={() => {
                    const target = (document.getElementById("branch-target") as HTMLSelectElement)?.value;
                    const cond = (document.getElementById("branch-cond") as HTMLInputElement)?.value || "";
                    if (!target || !nodes.find(n => n.id === target)) return;
                    const newEdge: Edge = {
                      id: `e_branch_${selectedNode.id}_${target}_${Date.now()}`,
                      source: selectedNode.id, target, type: "smoothstep",
                      style: edgeStyle("branch"),
                      markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981" },
                      label: cond || "branch",
                      data: { edge_type: "branch", condition: cond || null, label: cond },
                    };
                    setEdges(eds => [...eds, newEdge]);
                  }}
                    className="w-full py-1 text-[10px] font-mono rounded bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/20 transition-colors">
                    确认添加分支
                  </button>
                </div>
              </details>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
