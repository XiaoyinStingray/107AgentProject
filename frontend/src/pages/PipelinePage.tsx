/**
 * PipelinePage — 管道编辑器 + LLM 建议 + 运行监控。
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useAgents } from "../api/agents";

interface PipelineNode {
  id: string; title: string; agent_id: string; task: string; depends_on: string[];
}
interface PipelineDef {
  id?: string; name: string; description: string; nodes: PipelineNode[];
}

export default function PipelinePage() {
  const { data: agents = [] } = useAgents();
  const [pipelines, setPipelines] = useState<PipelineDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [suggestGoal, setSuggestGoal] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [run, setRun] = useState<{running:boolean;events:Array<{type:string;data:Record<string,unknown>}>;nodes:Record<string,string>}>({running:false,events:[],nodes:{}});
  const abortRef = useRef<AbortController|null>(null);
  const [loadError, setLoadError] = useState<string|null>(null);
  const [execError, setExecError] = useState<string|null>(null);

  const [draft, setDraft] = useState<PipelineDef>({
    name: "", description: "",
    nodes: [{id:"node1",title:"步骤 1",agent_id:"",task:"",depends_on:[]}],
  });

  const loadPipelines = useCallback(async () => {
    setLoadError(null);
    try {
      const resp = await fetch("/api/pipelines/");
      if (!resp.ok) throw new Error(`加载失败 (${resp.status})`);
      setPipelines(await resp.json());
    } catch (e) { setLoadError(e instanceof Error ? e.message : "无法加载"); }
  }, []);
  useEffect(() => { loadPipelines(); }, [loadPipelines]);

  // LLM 生成建议
  const handleSuggest = useCallback(async () => {
    if (!suggestGoal.trim()) return;
    setSuggesting(true);
    try {
      const resp = await fetch("/api/pipelines/suggest", {
        method: "POST", headers: {"Content-Type":"application/json"},
        body: JSON.stringify({goal: suggestGoal.trim(), agent_ids: agents.map(a=>a.id)}),
      });
      if (!resp.ok) throw new Error((await resp.json()).detail || "建议失败");
      const suggestion = await resp.json();
      if (suggestion.nodes?.length) {
        setDraft({name:suggestion.name,description:suggestion.description,nodes:suggestion.nodes});
        setEditing(true);
      }
    } catch (e) { setLoadError(e instanceof Error ? e.message : "建议生成失败"); }
    finally { setSuggesting(false); }
  }, [suggestGoal, agents]);

  const addNode = () => setDraft(prev => ({
    ...prev, nodes: [...prev.nodes, {id:`node${prev.nodes.length+1}`,title:`步骤 ${prev.nodes.length+1}`,agent_id:"",task:"",depends_on:[]}],
  }));
  const removeNode = (nodeId:string) => setDraft(prev => ({
    ...prev, nodes: prev.filter(n=>n.id!==nodeId).map(n=>({...n,depends_on:n.depends_on.filter(d=>d!==nodeId)})),
  }));

  const savePipeline = useCallback(async () => {
    try {
      const resp = await fetch("/api/pipelines/", {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(draft),
      });
      if (resp.ok) { setEditing(false); loadPipelines(); }
    } catch {}
  }, [draft, loadPipelines]);

  const executePipeline = useCallback(async () => {
    if (!selectedId) return;
    const controller = new AbortController(); abortRef.current = controller;
    setRun({running:true,events:[],nodes:{}}); setExecError(null);
    try {
      const resp = await fetch(`/api/pipelines/${selectedId}/execute`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({workspace_type:"local"}), signal:controller.signal,
      });
      if (!resp.ok) { setExecError(`执行失败 (${resp.status})`); setRun(p=>({...p,running:false})); return; }
      const reader = resp.body?.getReader(); if (!reader) return;
      const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const {done,value} = await reader.read(); if (done) break;
        buffer += decoder.decode(value,{stream:true});
        const lines = buffer.split("\n"); buffer = lines.pop()||"";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const ev = JSON.parse(line.slice(6));
              setRun(prev => {
                const newEvents = [...prev.events, ev];
                const newNodes = {...prev.nodes};
                if (ev.type==="pipeline.node_status") newNodes[ev.data.node_id] = ev.data.status;
                return {...prev, events:newEvents, nodes:newNodes, running:ev.type!=="pipeline.done"};
              });
            } catch {}
          }
        }
      }
    } catch(e:unknown) { if (e instanceof Error && e.name==="AbortError") return; }
    finally { setRun(p=>({...p,running:false})); }
  }, [selectedId]);

  const statusColor = (s:string) => ({running:"bg-blue-500 animate-pulse",complete:"bg-emerald-500",error:"bg-rose-500",skipped:"bg-gray-500"}[s]||"bg-gray-700");

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-secondary">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-mono text-text-primary font-semibold">🔗 Agent 管道</h2>
          {!editing && (
            <select value={selectedId||""} onChange={e=>setSelectedId(e.target.value||null)}
                    className="bg-bg-primary border border-border rounded px-2 py-1 text-xs font-mono text-text-secondary">
              <option value="">— 选择管道 —</option>
              {pipelines.map(p=><option key={p.id} value={p.id}>{p.name} ({p.nodes?.length||0} 节点)</option>)}
            </select>
          )}
          <button onClick={()=>{setEditing(!editing);if(!editing)setDraft({name:"",description:"",nodes:[{id:"node1",title:"步骤 1",agent_id:"",task:"",depends_on:[]}]})}}
                  className="text-xs font-mono px-2 py-1 rounded border border-border text-text-secondary hover:text-cyan-400">
            {editing?"取消":"+ 新建"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          {selectedId && !run.running && <button onClick={executePipeline} className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-mono rounded">▶ 运行</button>}
          {run.running && <button onClick={()=>abortRef.current?.abort()} className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white text-xs font-mono rounded">⏹ 停止</button>}
        </div>
      </div>
      {(loadError||execError) && (
        <div className="px-4 py-1.5 bg-rose-900/20 border-b border-rose-700/30 flex items-center gap-2">
          <span className="text-xs font-mono text-rose-400">{loadError||execError}</span>
          <button onClick={()=>{setLoadError(null);setExecError(null)}} className="text-xs text-rose-300">✕</button>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* 左侧: 编辑 / 建议 */}
        <div className="w-1/2 border-r border-border overflow-y-auto p-4">
          {/* LLM 建议区 */}
          {!editing && (
            <div className="mb-6 p-4 border border-cyan-700/30 rounded bg-cyan-900/5">
              <h3 className="text-xs font-mono text-cyan-400 mb-2">🤖 AI 生成管道建议</h3>
              <div className="flex gap-2">
                <input value={suggestGoal} onChange={e=>setSuggestGoal(e.target.value)}
                       onKeyDown={e=>{if(e.key==="Enter")handleSuggest()}}
                       placeholder="描述你的目标，AI 会建议管道结构… 如：调研 AI 框架、写对比报告"
                       className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-cyan-700/50"/>
                <button onClick={handleSuggest} disabled={suggesting||!suggestGoal.trim()}
                        className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:bg-bg-secondary disabled:text-text-muted text-white text-xs font-mono rounded shrink-0">
                  {suggesting?"生成中…":"生成"}
                </button>
              </div>
            </div>
          )}

          {editing ? (
            <div className="space-y-4">
              <input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="管道名称"
                     className="w-full bg-bg-primary border border-border rounded px-3 py-1.5 text-sm font-mono text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-cyan-700/50"/>
              {/* 节点列表 */}
              <div className="space-y-3">
                {draft.nodes.map((node,idx)=>(
                  <div key={node.id} className="p-3 border border-border rounded bg-bg-primary space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-cyan-400 font-semibold">#{idx+1} {node.id}</span>
                      {draft.nodes.length>1 && <button onClick={()=>removeNode(node.id)} className="text-xs text-rose-400 hover:text-rose-300">✕</button>}
                    </div>
                    <div className="flex gap-2">
                      <input value={node.title} onChange={e=>{const ns=[...draft.nodes];ns[idx]={...node,title:e.target.value};setDraft({...draft,nodes:ns})}}
                             placeholder="节点标题" className="flex-1 bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-cyan-700/50"/>
                      {/* Agent 选择 */}
                      <select value={node.agent_id}
                              onChange={e=>{const ns=[...draft.nodes];ns[idx]={...node,agent_id:e.target.value};setDraft({...draft,nodes:ns})}}
                              className="w-40 bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-secondary">
                        <option value="">选择 Agent…</option>
                        {agents.map(a=><option key={a.id} value={a.id}>{a.name} {a.persona?.mbti?`[${a.persona.mbti}]`:""}</option>)}
                      </select>
                    </div>
                    <input value={node.task} onChange={e=>{const ns=[...draft.nodes];ns[idx]={...node,task:e.target.value};setDraft({...draft,nodes:ns})}}
                           placeholder="任务描述（如：搜索 AI Agent 框架的最新信息）"
                           className="w-full bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-cyan-700/50"/>
                    {/* 依赖选择 */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-text-muted shrink-0">依赖:</span>
                      {draft.nodes.filter(n=>n.id!==node.id).length===0
                        ? <span className="text-xs text-text-muted">(无其他节点)</span>
                        : draft.nodes.filter(n=>n.id!==node.id).map(n=>(
                          <label key={n.id} className="flex items-center gap-1 text-xs font-mono cursor-pointer">
                            <input type="checkbox" checked={node.depends_on.includes(n.id)}
                                   onChange={e=>{const ns=[...draft.nodes];ns[idx]={...node,depends_on:e.target.checked?[...node.depends_on,n.id]:node.depends_on.filter(d=>d!==n.id)};setDraft({...draft,nodes:ns})}}/>
                            <span className={node.depends_on.includes(n.id)?"text-cyan-400":"text-text-secondary"}>#{draft.nodes.findIndex(x=>x.id===n.id)+1} {n.title}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={addNode} className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:text-cyan-400">+ 添加节点</button>
                <button onClick={savePipeline} disabled={!draft.name||draft.nodes.length===0}
                        className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:bg-bg-secondary disabled:text-text-muted text-white text-xs font-mono rounded">保存管道</button>
              </div>
            </div>
          ) : selectedId ? (
            <div className="text-text-muted text-sm font-mono text-center mt-8">选择一个管道并点击运行</div>
          ) : (
            <div className="text-text-muted text-sm font-mono text-center mt-8">创建或选择一个管道，或使用 AI 生成建议</div>
          )}
        </div>

        {/* 右侧: 预览 + 监控 */}
        <div className="w-1/2 overflow-y-auto p-4">
          {/* 管道预览——节点连接图 */}
          {draft.nodes.length>0 && (
            <div className="mb-6 p-4 border border-border rounded bg-bg-primary">
              <h3 className="text-xs font-mono text-text-secondary mb-3 font-semibold">管道预览</h3>
              <div className="flex flex-wrap items-center gap-1">
                {draft.nodes.map((n,i)=>(
                  <React.Fragment key={n.id}>
                    {i>0 && <span className="text-text-muted text-xs mx-1">→</span>}
                    <div className={`px-2 py-1 rounded border text-xs font-mono ${
                      run.nodes[n.id]==="running"?"border-blue-500 bg-blue-900/20 text-blue-400":
                      run.nodes[n.id]==="complete"?"border-emerald-500 bg-emerald-900/20 text-emerald-400":
                      run.nodes[n.id]==="error"?"border-rose-500 bg-rose-900/20 text-rose-400":
                      run.nodes[n.id]==="skipped"?"border-gray-500 bg-gray-900/20 text-gray-400":
                      "border-border bg-bg-secondary text-text-secondary"
                    }`}>
                      {n.title}
                      {n.agent_id && <span className="ml-1 text-text-muted/50">@{agents.find(a=>a.id===n.agent_id)?.name||n.agent_id.slice(0,6)}</span>}
                    </div>
                  </React.Fragment>
                ))}
              </div>
              {/* 并行依赖显示 */}
              {draft.nodes.some(n=>n.depends_on.length>1) && (
                <div className="mt-2 pt-2 border-t border-border/30">
                  <span className="text-xs text-text-muted">并行节点:</span>
                  {draft.nodes.filter(n=>n.depends_on.length>1).map(n=>(
                    <span key={n.id} className="ml-2 text-xs text-cyan-400 font-mono">
                      {n.title} ← {n.depends_on.map(d=>`#${draft.nodes.findIndex(x=>x.id===d)+1}`).join(" + ")}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 运行监控 */}
          {(run.running||run.events.length>0) ? (
            <div className="space-y-3">
              <div className="text-xs font-mono text-text-secondary font-semibold">节点状态</div>
              {Object.entries(run.nodes).map(([nid,status])=>(
                <div key={nid} className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${statusColor(status||"")}`}/>
                  <span className="text-xs font-mono text-text-secondary">{draft.nodes.find(n=>n.id===nid)?.title||nid}</span>
                  <span className="text-xs font-mono text-text-muted">{status}</span>
                </div>
              ))}
              <div className="text-xs font-mono text-text-secondary font-semibold mt-4">事件日志 ({run.events.length})</div>
              <div className="max-h-64 overflow-y-auto space-y-0.5">
                {run.events.slice(-30).map((ev,i)=>(
                  <div key={i} className="text-xs font-mono text-text-muted">[{ev.type}] {JSON.stringify(ev.data).slice(0,100)}</div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <span className="text-3xl block mb-2">🔗</span>
                <p className="text-text-muted font-mono text-sm">管道预览和运行状态</p>
                <p className="text-text-muted font-mono text-xs mt-1">蓝=运行中 绿=完成 红=失败 灰=跳过</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
