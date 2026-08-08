/**
 * PipelinePage — 模板选择 + 编辑 + 运行。
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useAgents } from "../api/agents";
import { getRequestedPipelineId } from "./pipeline/runNavigation";
import {
  describeLoopFinish,
  describeLoopProgress,
  isPreviewablePipelineFile,
  type LoopProgress,
} from "./pipeline/runPresentation";

interface PNode { id: string; title: string; agent_id: string; task: string; depends_on: string[]; }
interface Pipeline { id?: string; name: string; description: string; nodes: PNode[]; }
interface LoopTimelineItem extends LoopProgress { id: string; text: string; kind: "loop" | "done"; }
interface FileVersion {
  id: string;
  path: string;
  content: string;
  size: number;
  label: string;
  iteration: number;
  capturedAt: string;
}

export default function PipelinePage() {
  const { data: agents = [] } = useAgents();
  const [templates, setTemplates] = useState<Pipeline[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Pipeline>({name:"",description:"",nodes:[]});
  const [suggestGoal, setSuggestGoal] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [run, setRun] = useState<{running:boolean;events:any[];nodes:Record<string,string>;finished:boolean}>({running:false,events:[],nodes:{},finished:false});
  const abortRef = useRef<AbortController|null>(null);
  const [msg, setMsg] = useState<string|null>(null);
  const [completedRuns, setCompletedRuns] = useState<Set<string>>(new Set());
  const [runFiles, setRunFiles] = useState<Array<{path:string;size:number;content?:string}>>([]);
  const [viewingFile, setViewingFile] = useState<{path:string;content:string}|null>(null);
  const [loopTimeline, setLoopTimeline] = useState<LoopTimelineItem[]>([]);
  const [nodeAttempts, setNodeAttempts] = useState<Record<string, number>>({});
  const [currentStage, setCurrentStage] = useState("等待运行");
  const [fileVersions, setFileVersions] = useState<FileVersion[]>([]);
  const [viewingVersion, setViewingVersion] = useState<FileVersion | null>(null);
  const versionCounterRef = useRef(0);
  const captureQueueRef = useRef<Promise<void>>(Promise.resolve());
  const requestedPipelineIdRef = useRef<string | null>(
    getRequestedPipelineId(window.location.search),
  );

  const load = useCallback(async () => {
    try {
      const r=await fetch("/api/pipelines/");
      if(r.ok) {
        const list = await r.json();
        setTemplates(list);
        const requestedPipelineId = requestedPipelineIdRef.current;
        if (requestedPipelineId) {
          requestedPipelineIdRef.current = null;
          if (list.some((pipeline: Pipeline) => pipeline.id === requestedPipelineId)) {
            setSelected(requestedPipelineId);
          } else {
            setMsg("未找到从编辑器打开的管道，请确认它仍然存在");
          }
        }
        // 恢复已完成的管线
        const done = new Set<string>();
        for (const t of list) {
          try {
            const rr = await fetch(`/api/pipelines/${t.id}/runs`);
            if (rr.ok) {
              const rd = await rr.json();
              if (rd.runs?.length > 0) {
                done.add(t.id);
                // 恢复最近一次运行的节点状态
                const last = rd.runs[rd.runs.length-1];
                if (t.id === selected && last.nodes) {
                  setRun(prev => ({...prev, nodes: last.nodes, finished: true, running: false, events: prev.events}));
                  setRunFiles([]);  // 文件从磁盘读取
                }
              }
            }
          } catch {}
        }
        setCompletedRuns(done);
      }
    } catch {}
  }, [selected]);
  useEffect(() => { load(); }, [selected]);

  const selectedPipe = useMemo(() => templates.find(t=>t.id===selected), [templates,selected]);

  // 选择管线时加载文件列表（如果已完成）
  useEffect(() => {
    if (selected && completedRuns.has(selected)) {
      fetch(`/api/pipelines/${selected}/files`).then(r=>r.json()).then(d=>{
        if (d.files) setRunFiles(d.files);
      }).catch(()=>{});
      // 恢复节点状态
      fetch(`/api/pipelines/${selected}/runs`).then(r=>r.json()).then(d=>{
        if (d.runs?.length > 0 && d.runs[d.runs.length-1].nodes) {
          setRun(prev => ({...prev, nodes: d.runs[d.runs.length-1].nodes, finished: true, running: false}));
        }
      }).catch(()=>{});
    }
  }, [selected, completedRuns]);

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
      if (r.ok) {
        const saved = await r.json();
        // 更新本地列表（不重新加载全部，避免 selectedPipe 闪变）
        if (draft.id) {
          setTemplates(prev => prev.map(t => t.id===draft.id ? {...t, ...draft} : t));
        } else {
          setTemplates(prev => [...prev, {...draft, id: saved.id}]);
          setSelected(saved.id);
        }
        setEditing(false);
        setMsg("保存成功"); setTimeout(()=>setMsg(null),2000);
      }
    } catch {}
  };

  // 删除
  const del = async (id:string) => {
    if (!confirm("确认删除此管道模板？")) return;
    try { await fetch(`/api/pipelines/${id}`,{method:"DELETE"}); load(); if (selected===id) setSelected(null); } catch {}
  };

  // 运行
  const captureFileVersions = useCallback(async (
    pipelineId: string,
    iteration: number,
    label: string,
  ) => {
    try {
      const listResponse = await fetch(`/api/pipelines/${pipelineId}/files`, { cache: "no-store" });
      if (!listResponse.ok) return;
      const listData = await listResponse.json();
      const previewable = (listData.files || []).filter((file: {path:string}) =>
        isPreviewablePipelineFile(file.path),
      );
      const captured = await Promise.all(previewable.map(async (file: {path:string;size:number}) => {
        const response = await fetch(
          `/api/pipelines/${pipelineId}/files/${encodeURIComponent(file.path)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return null;
        const detail = await response.json();
        return {
          id: `${iteration}-${file.path}-${versionCounterRef.current++}`,
          path: file.path,
          content: detail.content || "",
          size: detail.size ?? file.size ?? 0,
          label,
          iteration,
          capturedAt: new Date().toLocaleTimeString(),
        } satisfies FileVersion;
      }));
      setFileVersions((previous) => [
        ...previous,
        ...captured.filter((version): version is FileVersion => version !== null),
      ]);
    } catch {
      // 实时版本抓取失败不应中断管道执行；最终文件仍由现有区域展示。
    }
  }, []);

  const queueVersionCapture = useCallback((pipelineId: string, iteration: number, label: string) => {
    captureQueueRef.current = captureQueueRef.current.then(
      () => captureFileVersions(pipelineId, iteration, label),
    );
  }, [captureFileVersions]);

  const exec = async () => {
    if (!selected) return;
    const ctrl = new AbortController(); abortRef.current = ctrl;
    setRun({running:true,events:[],nodes:{},finished:false});
    setLoopTimeline([]);
    setNodeAttempts({});
    setCurrentStage("正在启动管道…");
    setFileVersions([]);
    setViewingVersion(null);
    versionCounterRef.current = 0;
    captureQueueRef.current = Promise.resolve();
    let lastLoopProgress: LoopProgress | null = null;
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
            const isDone = ev.type==="pipeline.done";
            if (ev.type === "pipeline.started") {
              setCurrentStage("管道已启动，等待第一个节点");
            }
            if (ev.type === "pipeline.node_status" && ev.data?.status === "running") {
              const nodeId = ev.data.node_id;
              setNodeAttempts((previous) => ({
                ...previous,
                [nodeId]: (previous[nodeId] || 0) + 1,
              }));
              setCurrentStage(`正在执行：${selectedPipe?.nodes.find((node) => node.id === nodeId)?.title || nodeId}`);
            }
            if (ev.type === "pipeline.loop_triggered") {
              lastLoopProgress = {
                iteration: ev.data.iteration,
                maxIterations: ev.data.max_iterations,
              };
              const text = describeLoopProgress(lastLoopProgress);
              setLoopTimeline((previous) => [...previous, {
                ...lastLoopProgress!,
                id: `loop-${ev.data.edge_id}-${ev.data.iteration}`,
                text,
                kind: "loop",
              }]);
              setCurrentStage(text);
              queueVersionCapture(
                selected,
                ev.data.iteration,
                ev.data.iteration === 1 ? "初始版本（触发第 1 次回放）" : `第 ${ev.data.iteration - 1} 次修改后`,
              );
            }
            if (isDone) {
              const finishText = describeLoopFinish(lastLoopProgress);
              setCurrentStage(finishText);
              setLoopTimeline((previous) => [...previous, {
                iteration: lastLoopProgress?.iteration || 0,
                maxIterations: lastLoopProgress?.maxIterations || 0,
                id: `done-${Date.now()}`,
                text: finishText,
                kind: "done",
              }]);
              queueVersionCapture(
                selected,
                (lastLoopProgress?.iteration || 0) + 1,
                lastLoopProgress ? "最终版本" : "初始即最终版本",
              );
            }
            setRun(prev => ({...prev, events:[...prev.events,ev], nodes:ev.type==="pipeline.node_status"?{...prev.nodes,[ev.data.node_id]:ev.data.status}:prev.nodes, running:!isDone, finished:isDone}));
            if (isDone && selected) {
              setCompletedRuns(prev => new Set(prev).add(selected));
              // 加载产出文件列表
              fetch(`/api/pipelines/${selected}/files`).then(r=>r.json()).then(d=>{
                if (d.files) setRunFiles(d.files);
              }).catch(()=>{});
            }
          } catch {}
        }
        buf = buf.includes("\n") ? buf.slice(buf.lastIndexOf("\n")+1) : buf;
      }
    } catch(e:unknown) { if (e instanceof Error && e.name==="AbortError") return; }
    finally { setRun(p=>({...p,running:false})); }
  };

  const sc = (s:string) => ({running:"border-blue-500 bg-blue-900/20 text-blue-400",complete:"border-emerald-500 bg-emerald-900/20 text-emerald-400",error:"border-rose-500 bg-rose-900/20 text-rose-400",skipped:"border-gray-500 bg-gray-900/20 text-gray-400"}[s]||"border-border bg-bg-secondary text-text-secondary");

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-bg-secondary shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-mono text-text-primary font-semibold">🔗 Agent 管道</h2>
          <a href="/pipeline-editor" className="text-[10px] font-mono text-accent-green hover:underline ml-2">🎨 图形化编辑器 →</a>
          {msg && <span className="text-xs font-mono text-emerald-400">{msg}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={newBlank} className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:text-cyan-400">+ 新建</button>
          {selected && !run.running && <button onClick={exec} className="px-3 py-1 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-mono rounded">
            {completedRuns.has(selected) ? "↻ 重新运行" : "▶ 运行"}
          </button>}
          {run.running ? (
        <button onClick={()=>abortRef.current?.abort()} className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white text-xs font-mono rounded">⏹ 停止</button>
      ) : null}
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
                   onClick={()=>{setSelected(t.id!);setEditing(false);setRun({running:false,events:[],nodes:{},finished:false});}}
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
            /* 预览选中管道 + 运行结果 */
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-mono text-text-primary font-semibold">{selectedPipe.name}</h3>
                    {completedRuns.has(selected!) && (
                      <span className="text-xs font-mono text-emerald-500 border border-emerald-700/30 rounded px-1.5 py-0.5 bg-emerald-900/10">
                        🏁 已完成
                      </span>
                    )}
                  </div>
                  {selectedPipe.description && <p className="text-xs text-text-muted mt-1">{selectedPipe.description}</p>}
                </div>
                <div className="flex gap-2">
                  {!completedRuns.has(selected!) && (
                    <button onClick={editSelected} className="px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:text-cyan-400">✏️ 编辑</button>
                  )}
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
              {/* 产出文件 */}
              {run.finished && runFiles.length>0 && (
                <div className="p-3 border border-border rounded bg-bg-primary">
                  <h4 className="text-xs font-mono text-text-secondary mb-2">📁 产出文件 ({runFiles.length})</h4>
                  {viewingFile ? (
                    <div>
                      <button onClick={()=>setViewingFile(null)}
                              className="text-xs font-mono text-text-muted hover:text-text-primary mb-2 px-2 py-0.5 border border-border rounded">← 返回</button>
                      <pre className="text-xs font-mono text-text-secondary whitespace-pre-wrap bg-bg-primary p-3 rounded border border-border max-h-80 overflow-y-auto">{viewingFile.content}</pre>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {runFiles.map(f=>(
                        <div key={f.path} className="flex items-center gap-2 py-0.5">
                          <span className="text-xs font-mono text-cyan-400 cursor-pointer hover:underline"
                                onClick={async()=>{try{const r=await fetch(`/api/pipelines/${selected}/files/${encodeURIComponent(f.path)}`);if(r.ok)setViewingFile(await r.json())}catch{}}}>
                            📄 {f.path}
                          </span>
                          <span className="text-xs text-text-muted">({(f.size/1024).toFixed(1)}KB)</span>
                          <a href="#" onClick={async e=>{e.preventDefault();try{const r=await fetch(`/api/pipelines/${selected}/files/${encodeURIComponent(f.path)}`);if(r.ok){const d=await r.json();const b=new Blob([d.content]);const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=f.path;a.click();URL.revokeObjectURL(u)}}catch{}}}
                             className="text-xs text-text-muted hover:text-cyan-400 underline">下载</a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* 运行结果 */}
              {(run.running||run.events.length>0) && (
                <div className="space-y-3">
                  <div className="p-3 border border-cyan-800/40 rounded bg-cyan-950/10">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-xs font-mono text-cyan-400">⚙️ 生产过程</h4>
                      <span className="text-[10px] font-mono text-text-muted">
                        详细过程仅保留于本次实时会话
                      </span>
                    </div>
                    <p className="mt-2 text-xs font-mono text-text-primary">{currentStage}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedPipe.nodes.map((node) => (
                        <span key={node.id} className="px-2 py-1 rounded border border-border bg-bg-primary text-[10px] font-mono text-text-secondary">
                          {node.title}：启动 {nodeAttempts[node.id] || 0} 次
                        </span>
                      ))}
                    </div>
                    {loopTimeline.length > 0 && (
                      <ol className="mt-3 space-y-1.5 border-l border-border pl-3">
                        {loopTimeline.map((item) => (
                          <li key={item.id} className={`text-xs font-mono ${item.kind === "done" ? "text-emerald-400" : "text-amber-400"}`}>
                            {item.kind === "loop" ? "🔄" : "🏁"} {item.text}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>

                  {fileVersions.length > 0 && (
                    <div className="p-3 border border-border rounded bg-bg-primary">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <h4 className="text-xs font-mono text-text-secondary">🗂️ 本次文档演化</h4>
                        <span className="text-[10px] font-mono text-text-muted">刷新后仅保留最终文件</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {fileVersions.map((version) => (
                          <button key={version.id} type="button" onClick={() => setViewingVersion(version)}
                            className={`px-2 py-1 rounded border text-[10px] font-mono transition-colors ${viewingVersion?.id === version.id ? "border-cyan-500 text-cyan-400 bg-cyan-950/30" : "border-border text-text-secondary hover:border-cyan-700/50"}`}>
                            {version.path} · {version.label}
                          </button>
                        ))}
                      </div>
                      {viewingVersion && (() => {
                        const sameFileVersions = fileVersions.filter((version) => version.path === viewingVersion.path);
                        const index = sameFileVersions.findIndex((version) => version.id === viewingVersion.id);
                        const previousVersion = index > 0 ? sameFileVersions[index - 1] : null;
                        return (
                          <div className="mt-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-mono text-cyan-400">{viewingVersion.path} · {viewingVersion.label}</span>
                              <span className="text-[10px] font-mono text-text-muted">抓取于 {viewingVersion.capturedAt}</span>
                            </div>
                            <div className={`grid gap-2 ${previousVersion ? "grid-cols-2" : "grid-cols-1"}`}>
                              {previousVersion && (
                                <div>
                                  <p className="mb-1 text-[10px] font-mono text-text-muted">上一版本：{previousVersion.label}</p>
                                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-bg-secondary p-2 text-xs font-mono text-text-muted">{previousVersion.content}</pre>
                                </div>
                              )}
                              <div>
                                <p className="mb-1 text-[10px] font-mono text-text-muted">当前版本：{viewingVersion.label}</p>
                                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded border border-border bg-bg-secondary p-2 text-xs font-mono text-text-secondary">{viewingVersion.content}</pre>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  <div className="p-3 border border-border rounded bg-bg-primary">
                    <h4 className="text-xs font-mono text-text-secondary mb-2">节点状态</h4>
                    {Object.entries(run.nodes).map(([nid,status])=>(
                      <div key={nid} className="flex items-center gap-2 py-0.5">
                        <span className={`w-2 h-2 rounded-full ${status==="running"?"bg-blue-500 animate-pulse":status==="complete"?"bg-emerald-500":status==="error"?"bg-rose-500":"bg-gray-500"}`}/>
                        <span className="text-xs font-mono text-text-secondary">{selectedPipe.nodes.find(n=>n.id===nid)?.title||nid}</span>
                        <span className="text-xs text-text-muted">{status}</span>
                      </div>
                    ))}
                  </div>
                  {/* 各节点事件摘要 */}
                  {!run.running && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-mono text-text-secondary">节点详情</h4>
                      {selectedPipe.nodes.map(n=>{
                        const nodeEvts = run.events.filter(e=>e.type==="pipeline.node_event"&&e.data?.node_id===n.id);
                        const nodeStatus = run.nodes[n.id]||"pending";
                        return (
                          <details key={n.id} className="p-2 border border-border rounded bg-bg-primary">
                            <summary className="cursor-pointer text-xs font-mono text-text-secondary flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${nodeStatus==="complete"?"bg-emerald-500":nodeStatus==="error"?"bg-rose-500":"bg-gray-500"}`}/>
                              {n.title} — {nodeEvts.length} 事件
                            </summary>
                            <div className="mt-2 max-h-40 overflow-y-auto space-y-0.5">
                              {nodeEvts.length===0
                                ? <p className="text-xs text-text-muted font-mono">无事件记录</p>
                                : nodeEvts.map((ev,i)=>(
                                  <div key={i} className="text-xs font-mono text-text-muted truncate">
                                    [{i+1}] {String(ev.data?.sse||"").slice(0,120)}
                                  </div>
                                ))}
                            </div>
                          </details>
                        );
                      })}
                    </div>
                  )}
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
  );
}
