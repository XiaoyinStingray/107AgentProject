// @ts-nocheck -- ReactFlow v12 node data 泛型太严格，运行时类型安全
/**
 * PipelineEditor — Step 106: 图形化管线编辑器。
 */

import { useState, useCallback, useMemo, useRef } from "react";
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
  const nodeCounter = useRef(1);

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
          title: n.title, agent_id: n.agent_id, task: n.task, role: n.role || "worker",
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
        title: `节点 ${nodeCounter.current - 1}`, agent_id: agents[0]?.id || "worker-default",
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
        const err = await r.json();
        setMsg(`❌ 保存失败: ${err.detail || "未知错误"}`);
      }
    } catch (e) { setMsg(`❌ 网络错误: ${String(e)}`); }
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
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-secondary/50 shrink-0">
        <input value={pipeName} onChange={(e) => setPipeName(e.target.value)}
          className="w-40 px-2 py-1 text-sm font-mono bg-bg-primary border border-border rounded text-text-primary outline-none focus:border-accent-green/40"
          placeholder="管线名称"
        />
        <input value={pipeDesc} onChange={(e) => setPipeDesc(e.target.value)}
          className="w-48 px-2 py-1 text-xs font-mono bg-bg-primary border border-border rounded text-text-secondary outline-none focus:border-accent-green/40"
          placeholder="描述（可选）"
        />
        <div className="w-px h-5 bg-border" />
        <button onClick={addNode}
          className="px-3 py-1 text-xs font-mono rounded border border-accent-green/40 text-accent-green hover:bg-accent-green/10 transition-colors">
          + 添加节点
        </button>
        <button onClick={autoLayout}
          className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:border-text-secondary/40 transition-colors">
          自动布局
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1 text-xs font-mono rounded border border-accent-orange/40 text-accent-orange hover:bg-accent-orange/10 transition-colors disabled:opacity-40">
          {saving ? "保存中…" : "保存"}
        </button>
        {msg && <span className="text-xs font-mono text-text-secondary">{msg}</span>}
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
          >
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

            {/* 特殊工具 */}
            <div>
              <span className="text-[10px] font-mono text-text-secondary">特殊工具</span>
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
            </div>

            {/* Loop/Branch 面板（选中节点后，显示以其为起点的特殊边） */}
            <div>
              <span className="text-[10px] font-mono text-text-secondary">高级（回边/分支）</span>
              <div className="mt-1 space-y-1">
                <button
                  onClick={() => {
                    const target = prompt("回边目标节点 ID：", "");
                    if (!target || !nodes.find((n) => n.id === target)) return;
                    const cond = prompt("触发条件（如 FAILED，留空=无条件）：", "FAILED");
                    const maxIter = parseInt(prompt("最大循环次数：", "3") || "3", 10);
                    const newEdge: Edge = {
                      id: `e_loop_${selectedNode.id}_${target}_${Date.now()}`,
                      source: selectedNode.id, target,
                      type: "smoothstep",
                      style: edgeStyle("loop"),
                      markerEnd: { type: MarkerType.ArrowClosed, color: "#f59e0b" },
                      label: cond || "loop",
                      data: { edge_type: "loop", condition: cond, max_iterations: maxIter || 3 },
                    };
                    setEdges((eds) => [...eds, newEdge]);
                  }}
                  className="w-full text-left px-2 py-1 text-[10px] font-mono rounded border border-dashed border-border/60 text-text-secondary hover:border-accent-orange/40 hover:text-accent-orange transition-colors"
                >
                  + 添加回边 (loop)
                </button>
                <button
                  onClick={() => {
                    const target = prompt("分支目标节点 ID：", "");
                    if (!target || !nodes.find((n) => n.id === target)) return;
                    const cond = prompt("触发条件（如 PASS）：", "PASS");
                    const newEdge: Edge = {
                      id: `e_branch_${selectedNode.id}_${target}_${Date.now()}`,
                      source: selectedNode.id, target,
                      type: "smoothstep",
                      style: edgeStyle("branch"),
                      markerEnd: { type: MarkerType.ArrowClosed, color: "#10b981" },
                      label: cond || "branch",
                      data: { edge_type: "branch", condition: cond, label: cond },
                    };
                    setEdges((eds) => [...eds, newEdge]);
                  }}
                  className="w-full text-left px-2 py-1 text-[10px] font-mono rounded border border-dashed border-border/60 text-text-secondary hover:border-accent-green/40 hover:text-accent-green transition-colors"
                >
                  + 添加分支 (branch)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
