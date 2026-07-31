/**
 * PipelinePage — 模板选择 + 编辑 + 运行。
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAgents } from "../api/agents";

interface PNode { id: string; title: string; agent_id: string; task: string; depends_on: string[]; }
interface Pipeline { id?: string; name: string; description: string; nodes: PNode[]; }

class Err extends React.Component<{children:React.ReactNode},{e:string|null}> {
  state={e:null as string|null};
  static getDerivedStateFromError(err:Error){return{e:err.message};}
  render(){if(this.state.e)return <div className="p-8 text-center"><p className="text-rose-400 text-sm font-mono">渲染错误: {this.state.e}</p><button onClick={()=>this.setState({e:null})} className="mt-2 text-xs text-cyan-400">重试</button></div>;return this.props.children;}
}

export default function PipelinePage() {
  const { data: agents = [] } = useAgents();
  const [templates, setTemplates] = useState<Pipeline[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Pipeline>({name:"",description:"",nodes:[]});
  const [suggestGoal, setSuggestGoal] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [run, setRun] = useState<{running:boolean;events:any[];nodes:Record<string,string>}>({running:false,events:[],nodes:{}});
  const abortRef = useRef<AbortController|null>(null);
  const [msg, setMsg] = useState<string|null>(null);

  const load = useCallback(async () => {
    try { const r=await fetch("/api/pipelines/"); if(r.ok) setTemplates(await r.json()); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);

  const selectedPipe = useMemo(() => templates.find(t=>t.id===selected), [templates,selected]);

  // LLM 建议
  const suggest = async () => {
    if (!suggestGoal.trim()) return;
    setSuggesting(true);
    try {
      const r = await fetch("/api/pipelines/suggest", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({goal:suggestGoal,agent_ids:agents.map(a=>a.id)})});
      if (r.ok) {
        const s = await r.json();
        if (s.nodes?.length) { setDraft({name:s.name,description:s.description,nodes:s.nodes}); setEditing(true); }
      }
    } catch {} finally { setSuggesting(false); }
  };

  // 编辑已选模板
  const editSelected = () => {
    if (!selectedPipe) return;
    setDraft({...selectedPipe});
    setEditing(true);
  };

  // 新增空白模板
  const newBlank = () => {
    setDraft({name:"",description:"",nodes:[{id:"node1",title:"步骤 1",agent_id:"worker-default",task:"",depends_on:[]}]});
    setEditing(true);
  };

  const addNode = () => setDraft(p=>({...p,nodes:[...p.nodes,{id:`node${p.nodes.length+1}`,title:`步骤 ${p.nodes.length+1}`,agent_id:"worker-default",task:"",depends_on:[]}]}));
  const rmNode = (id:string) => setDraft(p=>({...p,nodes:p.nodes.filter(n=>n.id!==id).map(n=>({...n,depends_on:n.depends_on.filter(d=>d!==id)}))}));

  // 保存（新建或更新）
  const save = async () => {
    if (!draft.name.trim()||draft.nodes.length===0) return;
    try {
      const method = draft.id ? "PUT" : "POST";
      const url = draft.id ? `/api/pipelines/${draft.id}` : "/api/pipelines/";
      const r = await fetch(url, {method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(draft)});
      if (r.ok) { setEditing(false); load(); setMsg("保存成功"); setTimeout(()=>setMsg(null),2000); }
    } catch {}
  };

  // 删除
  const del = async (id:string) => {
    if (!confirm("确认删除此管道模板？")) return;
    try { await fetch(`/api/pipelines/${id}`,{method:"DELETE"}); load(); if (selected===id) setSelected(null); } catch {}
  };

  // 运行
  const exec = async () => {
    if (!selected) return;
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setRun({running:true,events:[],nodes:{}});
    try {
      const r = await fetch(`/api/pipelines/${selected}/execute`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({workspace_type:"local"}),signal:ctrl.signal});
      if (!r.ok) { setMsg(`执行失败 (${r.status})`); setRun(p=>({...p,running:false})); return; }
      const reader = r.body?.getReader(); if(!reader) return;
      const dec = new TextDecoder(); let buf = "";
      while(true) {
        const {done,value}=await reader.read(); if(done) break;
        buf += dec.decode(value,{stream:true});
        for (const line of buf.split("\n")) {
          if (line.startsWith("data: ")) try {
            const ev = JSON.parse(line.slice(6));
            setRun(prev => ({...prev, events:[...prev.events,ev], nodes:ev.type==="pipeline.node_status"?{...prev.nodes,[ev.data.node_id]:ev.data.status}:prev.nodes, running:ev.type!=="pipeline.done"}));
          } catch {}
        }
        buf = buf.includes("\n") ? buf.slice(buf.lastIndexOf("\n")+1) : buf;
      }
    } catch(e:unknown) { if (e instanceof Error && e.name==="AbortError") return; }
    finally { setRun(p=>({...p,running:false})); }
  };

  const sc = (s:string) => ({running:"border-blue-500 bg-blue-900/20 text-blue-400",complete:"border-emerald-500 bg-emerald-900/20 text-emerald-400",error:"border-rose-500 bg-rose-900/20 text-rose-400",skipped:"border-gray-500 bg-gray-900/20 text-gray-400"}[s]||"border-border bg-bg-secondary text-text-secondary");

  return (
    <Err>
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-secondary shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-mono text-text-primary font-semibold">🔗 Agent 管道</h2>
          {msg && <span className="text-xs font-mono text-emerald-400">{msg}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={newBlank} className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:text-cyan-400">+ 新建</button>
          {selected && !run.running && <button onClick={exec} className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-mono rounded">▶ 运行</button>}
          {run.running && <button onClick={()=>abortRef.current?.abort()} className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white text-xs font-mono rounded">⏹ 停止</button>}
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* 左侧: 模板列表 + AI 建议 */}
        <div className="w-[320px] shrink-0 border-r border-border flex flex-col">
          {/* AI 建议 */}
          <div className="p-3 border-b border-border">
            <div className="flex gap-1">
              <input value={suggestGoal} onChange={e=>setSuggestGoal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")suggest()}} placeholder="描述目标，AI 生成管道…"
                     className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary placeholder-text-muted/50 focus:outline-none focus:border-cyan-700/50"/>
              <button onClick={suggest} disabled={suggesting||!suggestGoal.trim()}
                      className="px-2 py-1 bg-cyan-700 hover:bg-cyan-600 disabled:bg-bg-secondary disabled:text-text-muted text-white text-xs font-mono rounded shrink-0">{suggesting?"…":"生成"}</button>
            </div>
          </div>
          {/* 模板列表 */}
          <div className="flex-1 overflow-y-auto">
            {templates.length===0 ? (
              <div className="p-4 text-center">
                <p className="text-xs font-mono text-text-muted">暂无管道模板</p>
                <p className="text-xs font-mono text-text-muted/50 mt-1">用 AI 生成或手动新建</p>
              </div>
            ) : templates.map(t=>(
              <div key={t.id}
                   onClick={()=>{setSelected(t.id!);setEditing(false);}}
                   className={`px-3 py-2 border-b border-border/50 cursor-pointer transition-colors hover:bg-bg-primary/50 ${selected===t.id?"bg-cyan-900/10 border-l-2 border-l-cyan-500":""}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-text-primary font-semibold truncate">{t.name}</span>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={e=>{e.stopPropagation();editSelected();}} className="text-xs text-text-muted hover:text-cyan-400 px-1">✏️</button>
                    <button onClick={e=>{e.stopPropagation();del(t.id!);}} className="text-xs text-text-muted hover:text-rose-400 px-1">🗑</button>
                  </div>
                </div>
                <p className="text-xs text-text-muted mt-0.5">{t.description||`${t.nodes?.length||0} 个节点`}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧: 预览 / 编辑 / 运行监控 */}
        <div className="flex-1 flex min-h-0">
          {editing ? (
            /* 编辑面板 */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center gap-2">
                <button onClick={()=>setEditing(false)} className="text-xs font-mono text-text-muted hover:text-text-primary px-2 py-0.5 border border-border rounded">← 返回</button>
                <input value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})} placeholder="管道名称"
                       className="flex-1 bg-bg-primary border border-border rounded px-3 py-1.5 text-sm font-mono text-text-primary focus:outline-none focus:border-cyan-700/50"/>
              </div>
              {draft.nodes.map((node,idx)=>(
                <div key={node.id} className="p-3 border border-border rounded bg-bg-primary space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-cyan-400">#{idx+1} {node.id}</span>
                    {draft.nodes.length>1 && <button onClick={()=>rmNode(node.id)} className="text-xs text-rose-400">✕</button>}
                  </div>
                  <div className="flex gap-2">
                    <input value={node.title} onChange={e=>{const ns=[...draft.nodes];ns[idx]={...node,title:e.target.value};setDraft({...draft,nodes:ns})}} placeholder="节点标题"
                           className="flex-1 bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-cyan-700/50"/>
                    <select value={node.agent_id} onChange={e=>{const ns=[...draft.nodes];ns[idx]={...node,agent_id:e.target.value};setDraft({...draft,nodes:ns})}}
                            className="w-40 bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-secondary">
                      <option value="worker-default">⚡ 默认 Worker</option>
                      {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <input value={node.task} onChange={e=>{const ns=[...draft.nodes];ns[idx]={...node,task:e.target.value};setDraft({...draft,nodes:ns})}} placeholder="任务描述"
                         className="w-full bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-cyan-700/50"/>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-text-muted shrink-0">依赖:</span>
                    {draft.nodes.filter(n=>n.id!==node.id).length===0
                      ? <span className="text-xs text-text-muted">(无)</span>
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
              <div className="flex gap-2">
                <button onClick={addNode} className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:text-cyan-400">+ 添加节点</button>
                <button onClick={save} disabled={!draft.name.trim()||draft.nodes.length===0}
                        className="px-3 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:bg-bg-secondary disabled:text-text-muted text-white text-xs font-mono rounded">💾 保存</button>
              </div>
            </div>
          ) : selectedPipe && selectedPipe.nodes ? (
            /* 预览选中管道 */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-mono text-text-primary font-semibold">{selectedPipe.name}</h3>
                  {selectedPipe.description && <p className="text-xs text-text-muted mt-1">{selectedPipe.description}</p>}
                </div>
                <div className="flex gap-2">
                  <button onClick={editSelected} className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:text-cyan-400">✏️ 编辑</button>
                  <button onClick={()=>del(selectedPipe.id!)} className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:text-rose-400">🗑 删除</button>
                </div>
              </div>
              {/* 节点预览 */}
              <div className="space-y-2">
                {selectedPipe.nodes.map((n,i)=>(
                  <div key={n.id} className="p-3 border border-border rounded bg-bg-primary">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-mono font-bold ${sc(run.nodes[n.id]||"")}`}>
                        {i+1}
                      </span>
                      <span className="text-sm font-mono text-text-primary">{n.title}</span>
                      <span className="text-xs text-text-muted">@{agents.find(a=>a.id===n.agent_id)?.name||n.agent_id||"worker"}</span>
                    </div>
                    <p className="text-xs text-text-muted ml-7">{n.task}</p>
                    {n.depends_on.length>0 && (
                      <p className="text-xs text-text-muted ml-7 mt-1">← 依赖: {n.depends_on.map(d=>`#${selectedPipe.nodes.findIndex(x=>x.id===d)+1}`).join(", ")}</p>
                    )}
                  </div>
                ))}
              </div>
              {/* 运行状态 */}
              {(run.running||run.events.length>0) && (
                <div className="p-3 border border-border rounded bg-bg-primary">
                  <h4 className="text-xs font-mono text-text-secondary mb-2">运行状态</h4>
                  {Object.entries(run.nodes).map(([nid,status])=>(
                    <div key={nid} className="flex items-center gap-2 py-0.5">
                      <span className={`w-2 h-2 rounded-full ${status==="running"?"bg-blue-500 animate-pulse":status==="complete"?"bg-emerald-500":status==="error"?"bg-rose-500":"bg-gray-500"}`}/>
                      <span className="text-xs font-mono text-text-secondary">{selectedPipe.nodes.find(n=>n.id===nid)?.title||nid}</span>
                      <span className="text-xs text-text-muted">{status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <span className="text-3xl block mb-2">🔗</span>
                <p className="text-text-muted font-mono text-sm">从左侧选择一个管道模板</p>
                <p className="text-text-muted font-mono text-xs mt-1">或使用 AI 生成新的管道</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </Err>
  );
}
