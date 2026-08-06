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
import {
  Check, ChevronDown, Copy, FolderOpen, MoreHorizontal,
  Pencil, RefreshCw, Trash2, X,
} from "lucide-react";
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

interface PipelineListItem {
  id: string;
  name: string;
  description?: string;
  node_count?: number;
  status?: string;
}

/* ── 边样式 ── */
function edgeStyle(type: string) {
  if (type === "loop") return { stroke: "#f59e0b", strokeDasharray: "6 3" };
  if (type === "branch") return { stroke: "#10b981", strokeDasharray: "2 2" };
  return { stroke: "#6b7280" };
}

function buildPipelineBody(nodes: Node[], edges: Edge[], name: string, description: string) {
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
  return { name, description, nodes: pnodes, edges: pedges };
}

function pipelineSnapshot(nodes: Node[], edges: Edge[], name: string, description: string) {
  return JSON.stringify(buildPipelineBody(nodes, edges, name, description));
}

function nextCopyName(name: string, pipelines: PipelineListItem[]) {
  const names = new Set(pipelines.map((pipeline) => pipeline.name));
  const base = `${name} - 副本`;
  if (!names.has(base)) return base;
  let index = 2;
  while (names.has(`${base} (${index})`)) index += 1;
  return `${base} (${index})`;
}

export default function PipelineEditor() {
  const { data: agents = [] } = useAgents();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [pipeName, setPipeName] = useState("新建管线");
  const [pipeDesc, setPipeDesc] = useState("");
  const [pipeId, setPipeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pipeList, setPipeList] = useState<PipelineListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [menuPipelineId, setMenuPipelineId] = useState<string | null>(null);
  const [renamePipelineId, setRenamePipelineId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [managementBusyId, setManagementBusyId] = useState<string | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => pipelineSnapshot([], [], "新建管线", ""));
  const nodeCounter = useRef(1);

  const currentSnapshot = useMemo(
    () => pipelineSnapshot(nodes, edges, pipeName, pipeDesc),
    [nodes, edges, pipeName, pipeDesc],
  );
  const isDirty = currentSnapshot !== savedSnapshot;

  // 加载管线列表
  const refreshList = useCallback(async () => {
    setListLoading(true);
    try {
      const r = await fetch("/api/pipelines/", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      if (!Array.isArray(data)) throw new Error("响应格式错误");
      setPipeList(data);
      return true;
    } catch (e) {
      setMsg(`❌ 管线列表加载失败: ${String(e)}`);
      return false;
    } finally {
      setListLoading(false);
    }
  }, []);
  useEffect(() => { void refreshList(); }, [refreshList]);

  // 选中节点数据（类型安全访问）
  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId),
    [edges, selectedEdgeId],
  );
  const nd = (selectedNode?.data ?? {}) as Partial<PipelineNodeData>;
  const getVal = <K extends keyof PipelineNodeData>(key: K, fallback: PipelineNodeData[K]) =>
    (nd[key] ?? fallback) as PipelineNodeData[K];

  // 从现有 Pipeline 加载
  const loadPipeline = useCallback(async (id: string) => {
    if (isDirty && !window.confirm("当前管线有未保存的修改。确定放弃这些修改并加载其他管线吗？")) {
      return false;
    }
    try {
      const r = await fetch(`/api/pipelines/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
      setSelectedEdgeId(null);
      setSavedSnapshot(pipelineSnapshot(ns, [...es, ...extraEs], p.name, p.description || ""));
      setMsg(`✅ 已加载“${p.name}”`);
      return true;
    } catch (e) {
      setMsg(`❌ 管线加载失败: ${String(e)}`);
      return false;
    }
  }, [isDirty, setNodes, setEdges]);

  const fetchPipelineDetail = useCallback(async (id: string) => {
    const response = await fetch(`/api/pipelines/${id}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }, []);

  const renamePipeline = useCallback(async (pipeline: PipelineListItem) => {
    const name = renameValue.trim();
    if (!name) {
      setMsg("❌ 管线名称不能为空");
      return;
    }
    if (name === pipeline.name) {
      setRenamePipelineId(null);
      return;
    }
    setManagementBusyId(pipeline.id);
    try {
      const detail = await fetchPipelineDetail(pipeline.id);
      const response = await fetch(`/api/pipelines/${pipeline.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: detail.description || "",
          nodes: detail.nodes || [],
          edges: detail.edges || [],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setPipeList((items) => items.map((item) => item.id === pipeline.id ? { ...item, name } : item));
      if (pipeId === pipeline.id) {
        setPipeName(name);
        setSavedSnapshot((snapshot) => {
          const saved = JSON.parse(snapshot);
          return JSON.stringify({ ...saved, name });
        });
      }
      setRenamePipelineId(null);
      setMenuPipelineId(null);
      const listReady = await refreshList();
      setMsg(listReady ? `✅ 已重命名为“${name}”` : `✅ 已重命名为“${name}”；列表刷新失败`);
    } catch (e) {
      setMsg(`❌ 重命名失败: ${String(e)}`);
    } finally {
      setManagementBusyId(null);
    }
  }, [renameValue, pipeId, fetchPipelineDetail, refreshList]);

  const duplicatePipeline = useCallback(async (pipeline: PipelineListItem) => {
    setManagementBusyId(pipeline.id);
    try {
      const detail = await fetchPipelineDetail(pipeline.id);
      const name = nextCopyName(pipeline.name, pipeList);
      const response = await fetch("/api/pipelines/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: detail.description || "",
          nodes: detail.nodes || [],
          edges: detail.edges || [],
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const created = await response.json();
      setPipeList((items) => [...items, {
        id: created.id,
        name,
        description: detail.description || "",
        node_count: created.node_count,
        status: "draft",
      }]);
      setMenuPipelineId(null);
      const listReady = await refreshList();
      setMsg(listReady ? `✅ 已创建“${name}”` : `✅ 已创建“${name}”；列表刷新失败`);
    } catch (e) {
      setMsg(`❌ 创建副本失败: ${String(e)}`);
    } finally {
      setManagementBusyId(null);
    }
  }, [pipeList, fetchPipelineDetail, refreshList]);

  const deletePipeline = useCallback(async (pipeline: PipelineListItem) => {
    const nodeCount = pipeline.node_count ?? 0;
    const warning = `确定删除“${pipeline.name}”吗？\n该管线包含 ${nodeCount} 个节点，删除后无法恢复。`;
    if (!window.confirm(warning)) return;
    setManagementBusyId(pipeline.id);
    try {
      const response = await fetch(`/api/pipelines/${pipeline.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setPipeList((items) => items.filter((item) => item.id !== pipeline.id));
      if (pipeId === pipeline.id) {
        setPipeId(null);
        setPipeName("新建管线");
        setPipeDesc("");
        setNodes([]);
        setEdges([]);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        nodeCounter.current = 1;
        setSavedSnapshot(pipelineSnapshot([], [], "新建管线", ""));
      }
      setMenuPipelineId(null);
      setRenamePipelineId(null);
      const listReady = await refreshList();
      setMsg(listReady ? `✅ 已删除“${pipeline.name}”` : `✅ 已删除“${pipeline.name}”；列表刷新失败`);
    } catch (e) {
      setMsg(`❌ 删除失败: ${String(e)}`);
    } finally {
      setManagementBusyId(null);
    }
  }, [pipeId, refreshList, setNodes, setEdges]);

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
    setSelectedEdgeId(null);
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

  const deleteNode = useCallback((nodeId: string) => {
    setNodes((items) => items.filter((node) => node.id !== nodeId));
    setEdges((items) => items.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    ));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [setNodes, setEdges]);

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges((items) => items.filter((edge) => edge.id !== edgeId));
    setSelectedEdgeId(null);
  }, [setEdges]);

  // 保存
  const handleSave = useCallback(async () => {
    setSaving(true); setMsg(null);
    const body = buildPipelineBody(nodes, edges, pipeName, pipeDesc);
    try {
      const url = pipeId ? `/api/pipelines/${pipeId}` : "/api/pipelines/";
      const method = pipeId ? "PUT" : "POST";
      const r = await fetch(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json();
        const savedId = pipeId || d.id;
        setPipeId(savedId);
        setPipeList((prev) => {
          const saved = { id: savedId, name: pipeName };
          return prev.some((p) => p.id === savedId)
            ? prev.map((p) => p.id === savedId ? saved : p)
            : [...prev, saved];
        });
        setSavedSnapshot(pipelineSnapshot(nodes, edges, pipeName, pipeDesc));
        const listReady = await refreshList();
        const savedMsg = `✅ 已保存 (${d.node_count} 节点, ${d.edge_count || body.edges.length} 边)`;
        setMsg(listReady ? savedMsg : `${savedMsg}；但列表刷新失败，请点击刷新按钮重试`);
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
  }, [nodes, edges, pipeName, pipeDesc, pipeId, refreshList]);

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
      <div className="relative z-30 flex items-center gap-3 px-4 py-2.5 border-b border-border bg-bg-secondary/80 shrink-0 backdrop-blur-sm">
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
        {/* 管线库 */}
        <div className="relative">
          <button type="button" onClick={() => {
            setLibraryOpen((open) => !open);
            setMenuPipelineId(null);
            setRenamePipelineId(null);
          }}
            className="h-8 min-w-[132px] px-2.5 inline-flex items-center gap-2 text-xs font-mono bg-bg-primary border border-border rounded-lg text-text-secondary hover:border-text-secondary/40 transition-colors"
            aria-haspopup="menu" aria-expanded={libraryOpen}>
            <FolderOpen size={14} />
            <span className="flex-1 text-left">管线库</span>
            {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-accent-orange" title="有未保存修改" />}
            <ChevronDown size={13} className={libraryOpen ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>

          {libraryOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => {
                setLibraryOpen(false);
                setMenuPipelineId(null);
                setRenamePipelineId(null);
              }} />
              <div className="absolute right-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-lg border border-border bg-bg-card shadow-2xl"
                role="menu" aria-label="管线库">
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono font-semibold text-text-primary">管线库</p>
                    <p className="text-[10px] font-mono text-text-muted">{pipeList.length} 条已保存管线</p>
                  </div>
                  <button type="button" onClick={() => { void refreshList(); }} disabled={listLoading}
                    className="w-7 h-7 inline-flex items-center justify-center rounded text-text-muted hover:bg-bg-primary hover:text-text-primary transition-colors disabled:opacity-40"
                    title="刷新管线列表" aria-label="刷新管线列表">
                    <RefreshCw size={14} className={listLoading ? "animate-spin" : ""} />
                  </button>
                </div>

                <div className="max-h-72 overflow-y-auto p-1.5">
                  {listLoading && pipeList.length === 0 && (
                    <p className="px-2 py-5 text-center text-xs font-mono text-text-muted">正在加载…</p>
                  )}
                  {!listLoading && pipeList.length === 0 && (
                    <p className="px-2 py-5 text-center text-xs font-mono text-text-muted">暂无已保存的管线</p>
                  )}
                  {pipeList.map((pipeline) => {
                    const isCurrent = pipeline.id === pipeId;
                    const isBusy = managementBusyId === pipeline.id;
                    const isRenaming = renamePipelineId === pipeline.id;
                    return (
                      <div key={pipeline.id} className="relative mb-1 last:mb-0 rounded border border-transparent hover:border-border/60"
                        onContextMenu={(event) => {
                          event.preventDefault();
                          setMenuPipelineId(pipeline.id);
                          setRenamePipelineId(null);
                        }}>
                        <div className={isCurrent ? "flex items-center rounded bg-accent-green/10" : "flex items-center rounded hover:bg-bg-primary/70"}>
                          <button type="button" disabled={isBusy}
                            onClick={async () => {
                              const loaded = await loadPipeline(pipeline.id);
                              if (loaded) {
                                setLibraryOpen(false);
                                setMenuPipelineId(null);
                              }
                            }}
                            className="min-w-0 flex-1 px-2.5 py-2 text-left disabled:opacity-40">
                            <div className="flex items-center gap-2">
                              <FolderOpen size={13} className={isCurrent ? "text-accent-green" : "text-text-muted"} />
                              <span className="min-w-0 flex-1 truncate text-xs font-mono text-text-primary">{pipeline.name}</span>
                              {isCurrent && <Check size={13} className="shrink-0 text-accent-green" />}
                            </div>
                            <p className="mt-0.5 pl-5 truncate text-[9px] font-mono text-text-muted"
                              title={pipeline.description || undefined}>
                              {pipeline.node_count ?? 0} 节点{pipeline.description ? ` · ${pipeline.description}` : ""}
                            </p>
                          </button>
                          <button type="button" disabled={isBusy}
                            onClick={() => {
                              setMenuPipelineId((id) => id === pipeline.id ? null : pipeline.id);
                              setRenamePipelineId(null);
                            }}
                            className="mr-1 w-7 h-7 shrink-0 inline-flex items-center justify-center rounded text-text-muted hover:bg-bg-secondary hover:text-text-primary disabled:opacity-40"
                            title={`管理“${pipeline.name}”`} aria-label={`管理“${pipeline.name}”`}>
                            <MoreHorizontal size={15} />
                          </button>
                        </div>

                        {menuPipelineId === pipeline.id && !isRenaming && (
                          <div className="mx-1 mb-1 grid grid-cols-3 gap-1 rounded border border-border/60 bg-bg-secondary/70 p-1" role="menu">
                            <button type="button" onClick={() => {
                              setRenamePipelineId(pipeline.id);
                              setRenameValue(pipeline.name);
                            }} className="inline-flex items-center justify-center gap-1 rounded px-1.5 py-1.5 text-[10px] font-mono text-text-secondary hover:bg-bg-primary hover:text-text-primary">
                              <Pencil size={12} />重命名
                            </button>
                            <button type="button" onClick={() => { void duplicatePipeline(pipeline); }} disabled={isBusy}
                              className="inline-flex items-center justify-center gap-1 rounded px-1.5 py-1.5 text-[10px] font-mono text-text-secondary hover:bg-bg-primary hover:text-text-primary disabled:opacity-40">
                              <Copy size={12} />创建副本
                            </button>
                            <button type="button" onClick={() => { void deletePipeline(pipeline); }} disabled={isBusy}
                              className="inline-flex items-center justify-center gap-1 rounded px-1.5 py-1.5 text-[10px] font-mono text-red-400/80 hover:bg-red-400/10 hover:text-red-400 disabled:opacity-40">
                              <Trash2 size={12} />删除
                            </button>
                          </div>
                        )}

                        {isRenaming && (
                          <div className="mx-1 mb-1 flex items-center gap-1 rounded border border-border/60 bg-bg-secondary/70 p-1">
                            <input autoFocus value={renameValue} disabled={isBusy}
                              onChange={(event) => setRenameValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") void renamePipeline(pipeline);
                                if (event.key === "Escape") setRenamePipelineId(null);
                              }}
                              className="min-w-0 flex-1 rounded border border-border bg-bg-primary px-2 py-1 text-[10px] font-mono text-text-primary outline-none focus:border-accent-green/40"
                              aria-label={`重命名“${pipeline.name}”`} />
                            <button type="button" onClick={() => { void renamePipeline(pipeline); }} disabled={isBusy}
                              className="w-6 h-6 inline-flex items-center justify-center rounded text-accent-green hover:bg-accent-green/10 disabled:opacity-40"
                              title="确认重命名" aria-label="确认重命名"><Check size={13} /></button>
                            <button type="button" onClick={() => setRenamePipelineId(null)} disabled={isBusy}
                              className="w-6 h-6 inline-flex items-center justify-center rounded text-text-muted hover:bg-bg-primary hover:text-text-primary disabled:opacity-40"
                              title="取消重命名" aria-label="取消重命名"><X size={13} /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
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
            onNodeClick={(_e, node) => {
              setSelectedNodeId(node.id);
              setSelectedEdgeId(null);
            }}
            onEdgeClick={(_e, edge) => {
              setSelectedEdgeId(edge.id);
              setSelectedNodeId(null);
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
            }}
            onNodesDelete={(deletedNodes) => {
              if (deletedNodes.some((node) => node.id === selectedNodeId)) {
                setSelectedNodeId(null);
              }
            }}
            onEdgesDelete={(deletedEdges) => {
              if (deletedEdges.some((edge) => edge.id === selectedEdgeId)) {
                setSelectedEdgeId(null);
              }
            }}
            nodeTypes={nodeTypes}
            fitView
            deleteKeyCode="Delete"
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
                {nodes.length} 节点 · {edges.length} 连线 · 点击节点编辑 · 拖拽圆点连线 · Delete 删除
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
            <div className="flex items-start gap-2">
              <h3 className="min-w-0 flex-1 text-sm font-mono text-text-primary font-semibold break-words">
                编辑节点: {selectedNode.data.title}
              </h3>
              <button type="button" onClick={() => deleteNode(selectedNode.id)}
                className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded border border-transparent text-text-muted hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/10 transition-colors"
                title="删除节点" aria-label="删除节点">
                <Trash2 size={15} />
              </button>
            </div>

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

        {!selectedNode && selectedEdge && (
          <div className="w-72 shrink-0 border-l border-border bg-bg-secondary/50 overflow-y-auto p-4 space-y-4">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-mono text-text-primary font-semibold">选中连线</h3>
                <p className="mt-1 text-xs font-mono text-text-secondary break-words">
                  {nodes.find((node) => node.id === selectedEdge.source)?.data.title || selectedEdge.source}
                  <span className="mx-1 text-text-muted">→</span>
                  {nodes.find((node) => node.id === selectedEdge.target)?.data.title || selectedEdge.target}
                </p>
              </div>
              <button type="button" onClick={() => deleteEdge(selectedEdge.id)}
                className="w-8 h-8 shrink-0 inline-flex items-center justify-center rounded border border-transparent text-text-muted hover:text-red-400 hover:border-red-400/30 hover:bg-red-400/10 transition-colors"
                title="删除连线" aria-label="删除连线">
                <Trash2 size={15} />
              </button>
            </div>
            <dl className="space-y-2 text-xs font-mono">
              <div>
                <dt className="text-[10px] text-text-muted">类型</dt>
                <dd className="mt-0.5 text-text-primary">{selectedEdge.data?.edge_type || "flow"}</dd>
              </div>
              {selectedEdge.data?.condition && (
                <div>
                  <dt className="text-[10px] text-text-muted">条件</dt>
                  <dd className="mt-0.5 text-text-primary break-words">{selectedEdge.data.condition}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}
