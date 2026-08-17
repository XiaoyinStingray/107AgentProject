/**
 * DuelArena — Step 100b: Agent 实时对战页面。
 *
 * 左右分屏 + 中间实时比分。
 */

import { useState, useCallback, useRef, useEffect } from "react";
import Card from "../components/shared/Card";
import ScoreBar from "../components/duel/ScoreBar";
import { useAgents } from "../api/agents";

interface DuelEvent {
  type: string;
  side: "a" | "b";
  worker_event?: {
    type: string;
    data: { tool_name?: string; reason?: string; result_summary?: string; thought?: string; step_index?: number };
  };
  scores?: Record<string, number>;
}

interface DuelResult {
  winner: string;
  final_scores: {
    a: { name: string; search_quality: number; step_efficiency: number; self_check: number; total_steps: number; total: number };
    b: { name: string; search_quality: number; step_efficiency: number; self_check: number; total_steps: number; total: number };
  };
  summary: string;
}

export default function DuelArena() {
  const { data: agents = [] } = useAgents();
  const [agentAId, setAgentAId] = useState("");
  const [agentBId, setAgentBId] = useState("");
  const [task, setTask] = useState("");
  const [running, setRunning] = useState(false);
  const [logsA, setLogsA] = useState<string[]>([]);
  const [logsB, setLogsB] = useState<string[]>([]);
  const [scores, setScores] = useState({ a_search: 50, a_efficiency: 50, a_selfcheck: 50, b_search: 50, b_efficiency: 50, b_selfcheck: 50 });
  const [result, setResult] = useState<DuelResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const logsARef = useRef<HTMLDivElement>(null);
  const logsBRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (logsARef.current) logsARef.current.scrollTop = logsARef.current.scrollHeight;
  }, [logsA]);
  useEffect(() => {
    if (logsBRef.current) logsBRef.current.scrollTop = logsBRef.current.scrollHeight;
  }, [logsB]);

  const start = useCallback(async () => {
    if (!agentAId || !agentBId || !task) return;
    setRunning(true);
    setLogsA([]);
    setLogsB([]);
    setResult(null);
    setScores({ a_search: 50, a_efficiency: 50, a_selfcheck: 50, b_search: 50, b_efficiency: 50, b_selfcheck: 50 });

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/bench/duel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_a_id: agentAId, agent_b_id: agentBId, task }),
        signal: controller.signal,
      });

      const reader = res.body?.getReader();
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
              const evt: DuelEvent = JSON.parse(line.slice(6));

              if (evt.type === "duel.event" && evt.worker_event) {
                const we = evt.worker_event;
                const data = we.data || {};
                let logLine = "";
                if (we.type === "worker.step_decision") {
                  logLine = `▸ ${data.reason?.slice(0, 80) || "决策"}`;
                } else if (we.type === "worker.tool_start") {
                  logLine = `🔧 ${data.tool_name} ...`;
                } else if (we.type === "worker.tool_result") {
                  logLine = `   → ${data.result_summary?.slice(0, 100) || "完成"}`;
                } else if (we.type === "worker.thought") {
                  logLine = `💭 ${data.thought?.slice(0, 80) || ""}`;
                } else if (we.type === "worker.done") {
                  logLine = "✅ 完成";
                }
                if (logLine) {
                  if (evt.side === "a") setLogsA((p) => [...p, logLine]);
                  else setLogsB((p) => [...p, logLine]);
                }
              } else if (evt.type === "duel.score" && evt.scores) {
                setScores((prev) => ({ ...prev, ...evt.scores }));
              } else if (evt.type === "duel.done") {
                setResult(evt as unknown as DuelResult);
              }
            } catch { /* */ }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Duel error:", err);
        setLogsA((p) => [...p, `❌ 连接错误: ${err.message || '未知错误'}`]);
      }
    }
    setRunning(false);
  }, [agentAId, agentBId, task]);

  const nameA = agents.find((a: any) => a.id === agentAId)?.name || "Agent A";
  const nameB = agents.find((a: any) => a.id === agentBId)?.name || "Agent B";

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      <h1 className="text-xl font-mono text-accent-orange mb-4">⚔️ Agent 对战</h1>

      {/* Setup */}
      <Card className="p-4 mb-4 space-y-3">
        <div className="flex gap-3">
          <select
            value={agentAId}
            onChange={(e) => setAgentAId(e.target.value)}
            className="flex-1 px-3 py-1.5 text-xs font-mono rounded border border-border bg-bg-primary text-text-primary"
          >
            <option value="">选择 Agent A...</option>
            {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <span className="text-lg font-mono text-accent-orange self-center">VS</span>
          <select
            value={agentBId}
            onChange={(e) => setAgentBId(e.target.value)}
            className="flex-1 px-3 py-1.5 text-xs font-mono rounded border border-border bg-bg-primary text-text-primary"
          >
            <option value="">选择 Agent B...</option>
            {agents.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <input
          type="text"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="任务描述，如：搜索 AI Agent 框架的最新发展并写一份对比报告"
          className="w-full px-3 py-1.5 text-xs font-mono rounded border border-border bg-bg-primary text-text-primary placeholder-text-secondary"
        />
        <button
          type="button"
          onClick={start}
          disabled={running || !agentAId || !agentBId || !task}
          className="w-full px-4 py-2 text-xs font-mono rounded-lg border border-accent-orange/40 bg-accent-orange/10 text-accent-orange hover:bg-accent-orange/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? "⚔️ 对战中..." : "⚔️ 开始对战"}
        </button>
      </Card>

      {/* Arena */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        {/* Left terminal */}
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-accent-blue" />
            <span className="text-xs font-mono text-accent-blue font-semibold">{nameA}</span>
            <span className="text-[10px] font-mono text-text-secondary ml-auto">
              搜索:{scores.a_search} 效率:{scores.a_efficiency} 自检:{scores.a_selfcheck}
            </span>
          </div>
          <div ref={logsARef} className="h-64 overflow-y-auto space-y-0.5 text-[10px] font-mono text-text-secondary">
            {logsA.map((l, i) => (
              <p key={i} className={l.startsWith("🔧") ? "text-accent-blue" : l.startsWith("✅") ? "text-accent-green" : ""}>{l}</p>
            ))}
            {running && logsA.length === 0 && <p className="text-text-secondary animate-pulse">等待 Agent A 开始...</p>}
          </div>
        </Card>
        {/* Right terminal */}
        <Card className="p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-accent-orange" />
            <span className="text-xs font-mono text-accent-orange font-semibold">{nameB}</span>
            <span className="text-[10px] font-mono text-text-secondary ml-auto">
              搜索:{scores.b_search} 效率:{scores.b_efficiency} 自检:{scores.b_selfcheck}
            </span>
          </div>
          <div ref={logsBRef} className="h-64 overflow-y-auto space-y-0.5 text-[10px] font-mono text-text-secondary">
            {logsB.map((l, i) => (
              <p key={i} className={l.startsWith("🔧") ? "text-accent-orange" : l.startsWith("✅") ? "text-accent-green" : ""}>{l}</p>
            ))}
            {running && logsB.length === 0 && <p className="text-text-secondary animate-pulse">等待 Agent B 开始...</p>}
          </div>
        </Card>
      </div>

      {/* Score bar */}
      <Card className="p-4 mb-4">
        <p className="text-xs font-mono text-text-secondary mb-2">实时比分</p>
        <ScoreBar
          labelA={nameA}
          labelB={nameB}
          scoreA={scores.a_search + scores.a_efficiency + scores.a_selfcheck}
          scoreB={scores.b_search + scores.b_efficiency + scores.b_selfcheck}
        />
      </Card>

      {/* Result */}
      {result && (
        <Card className="p-4 border-accent-green/40 bg-accent-green/5">
          <p className="text-sm font-mono text-accent-green font-semibold mb-2">
            🏆 {result.winner === "draw" ? "平局" : `胜者: ${result.winner === "a" ? nameA : nameB}`}
          </p>
          <p className="text-xs font-mono text-text-secondary">{result.summary}</p>
        </Card>
      )}
    </div>
  );
}
