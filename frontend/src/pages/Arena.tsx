import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import StatusDot from "../components/shared/StatusDot";
import { MOCK_AGENTS } from "../mocks/agents";
import { useAgentStore } from "../stores/useAgentStore";
import { ARENA_TOPICS, MOCK_ARENA_RESULT } from "../mocks/arena";
import type { ArenaTranscriptRound } from "../mocks/arena";
import type { AgentResponse } from "../types/agent";

/* ================================================================
   Step 22 — 竞技场页面 (M4)
   两个 Agent 在竞技场景中对决，LLM 裁判评分。
   前端 Mock 模式——Phase 8 接真实 ArenaEngine。
   ================================================================ */

type ArenaPhase = "setup" | "debating" | "judging" | "result";

const DEBATE_INTERVAL = 1800; // 每轮对话间隔 ms
const JUDGE_DELAY = 1500;     // 裁判评分延迟 ms

const MODES = [
  { key: "debate" as const, label: "辩论赛", desc: "正反双方就议题展开三轮辩论", emoji: "🗣️", available: true },
  { key: "interview" as const, label: "面试竞争", desc: "同岗位竞争，展示专业能力", emoji: "💼", available: false },
  { key: "pitch" as const, label: "路演对决", desc: "各自陈述方案，争取投资人", emoji: "📊", available: false },
];

export default function Arena() {
  const agents = useAvailableAgents();

  // === setup 状态 ===
  const [mode, setMode] = useState<string>("debate");
  const [agentAId, setAgentAId] = useState<string>("");
  const [agentBId, setAgentBId] = useState<string>("");
  const [topic, setTopic] = useState(ARENA_TOPICS[0]);
  const [customTopic, setCustomTopic] = useState("");
  const [phase, setPhase] = useState<ArenaPhase>("setup");
  const [result] = useState(MOCK_ARENA_RESULT);
  const [visibleRounds, setVisibleRounds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const agentA = agents.find((a) => a.id === agentAId);
  const agentB = agents.find((a) => a.id === agentBId);
  const effectiveTopic = topic === "__custom__" ? customTopic : topic;
  const canStart = agentAId && agentBId && agentAId !== agentBId && effectiveTopic.trim().length > 0;

  // 清理 timer
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleStart = useCallback(() => {
    if (!canStart) return;
    setVisibleRounds(0);
    setPhase("debating");

    // 逐轮展开对话
    const totalRounds = result.transcript.length;
    timerRef.current = setInterval(() => {
      setVisibleRounds((prev) => {
        const next = prev + 1;
        if (next >= totalRounds) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          // 辩论结束 → 裁判评分
          setPhase("judging");
          setTimeout(() => setPhase("result"), JUDGE_DELAY);
          return totalRounds;
        }
        return next;
      });
    }, DEBATE_INTERVAL);
  }, [canStart, result.transcript.length, clearTimer]);

  const handleReset = useCallback(() => {
    clearTimer();
    setPhase("setup");
  }, [clearTimer]);

  // 组件卸载时清理
  useEffect(() => clearTimer, [clearTimer]);

  // === debating（逐轮展开对话） ===
  if (phase === "debating" || phase === "judging") {
    const visible = result.transcript.slice(0, visibleRounds);
    const grouped = groupByRound(visible);

    return (
      <div className="h-full overflow-y-auto p-6 animate-fade-in">
        {/* 标题区 */}
        <div className="text-center mb-6">
          <span className="text-3xl">⚔️</span>
          <h1 className="text-xl font-mono text-text-primary mt-2 mb-1">
            辩论赛
          </h1>
          <p className="text-sm text-text-secondary font-mono">
            {effectiveTopic}
          </p>
          <div className="flex items-center justify-center gap-4 mt-3 text-sm font-mono">
            <span className="text-accent-blue">{agentA?.name}</span>
            <span className="text-text-secondary/40">vs</span>
            <span className="text-accent-orange">{agentB?.name}</span>
          </div>
        </div>

        {/* 对话区 */}
        <Card className="mb-6">
          <div className="space-y-4">
            {grouped.map(([round, entries]) => (
              <div key={round}>
                <div className="text-xs font-mono text-text-secondary/60 mb-2 border-b border-border pb-1">
                  第 {round} 轮
                </div>
                {entries.map((entry, idx) => (
                  <DebateBubble
                    key={idx}
                    entry={entry}
                    align={idx === 0 ? "left" : "right"}
                    agents={agents}
                  />
                ))}
              </div>
            ))}
          </div>
        </Card>

        {/* 等候裁判提示 */}
        {phase === "judging" && (
          <div className="text-center py-4 animate-fade-in">
            <div className="text-2xl mb-2 animate-pulse">🧐</div>
            <p className="text-sm font-mono text-text-secondary">
              裁判正在评分…
            </p>
          </div>
        )}

        {phase === "debating" && (
          <div className="text-center py-2">
            <p className="text-xs font-mono text-text-secondary/50 animate-pulse">
              第 {grouped.length} / 3 轮
            </p>
          </div>
        )}
      </div>
    );
  }

  // === result ===
  if (phase === "result") {
    const winner = result.winnerName;
    const winnerId = result.winnerId;
    const scoreA = result.scores.find((s) => s.agentId === agentAId);
    const scoreB = result.scores.find((s) => s.agentId === agentBId);

    return (
      <div className="h-full overflow-y-auto p-6 animate-fade-in">
        {/* 胜者横幅 */}
        <div className="text-center mb-8">
          <span className="text-4xl">🏆</span>
          <h1 className="text-2xl font-mono text-accent-green mt-2 mb-1">
            {winner} 获胜！
          </h1>
          <p className="text-sm text-text-secondary font-mono">
            辩题：{effectiveTopic}
          </p>
        </div>

        {/* 比分对比 */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {[scoreA, scoreB].map((score) => {
            if (!score) return null;
            const agent = agents.find((a) => a.id === score.agentId);
            const isWinner = score.agentId === winnerId;
            return (
              <Card key={score.agentId} hover={false}>
                <div className="flex items-center gap-3 mb-4">
                  <StatusDot
                    status={isWinner ? "active" : "idle"}
                    label=""
                  />
                  <span className="font-mono text-sm text-text-primary">
                    {agent?.name}
                  </span>
                  {isWinner && <Badge label="胜者" variant="P0" />}
                  <span className="ml-auto font-mono text-2xl text-accent-green">
                    {score.total.toFixed(1)}
                  </span>
                </div>
                <ScoreBar label="论点质量" value={score.logic} color="bg-accent-blue" />
                <ScoreBar label="表达能力" value={score.eloquence} color="bg-accent-purple" />
                <ScoreBar label="应变能力" value={score.adaptability} color="bg-accent-orange" />
                <ScoreBar label="人设一致" value={score.character} color="bg-accent-green" />
              </Card>
            );
          })}
        </div>

        {/* 裁判评语 */}
        <Card className="mb-8">
          <h2 className="text-sm font-mono text-text-primary mb-3">📋 裁判评语</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            {result.reasoning}
          </p>
        </Card>

        {/* 对话记录 */}
        <Card>
          <h2 className="text-sm font-mono text-text-primary mb-4">📝 对话记录</h2>
          <div className="space-y-4">
            {groupByRound(result.transcript).map(([round, entries]) => (
              <div key={round}>
                <div className="text-xs font-mono text-text-secondary/60 mb-2 border-b border-border pb-1">
                  第 {round} 轮
                </div>
                {entries.map((entry, idx) => (
                  <TranscriptBubble key={idx} entry={entry} agents={agents} />
                ))}
              </div>
            ))}
          </div>
        </Card>

        {/* 底部操作 */}
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={handleReset}
            className="text-sm font-mono text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            ← 返回配置
          </button>
        </div>
      </div>
    );
  }

  // === setup ===
  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-green mb-1">M4 竞技场</h1>
      <p className="text-sm text-text-secondary font-mono mb-6">
        选择两位 Agent 和竞技模式，观察他们的对决
      </p>

      {/* 模式 Tab 栏 */}
      <div className="flex gap-2 mb-6">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            disabled={!m.available}
            onClick={() => setMode(m.key)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-mono
              transition-colors duration-200
              ${!m.available
                ? "border-border bg-bg-secondary/50 text-text-secondary/40 cursor-not-allowed"
                : mode === m.key
                  ? "border-accent-green bg-accent-green/10 text-accent-green"
                  : "border-border bg-bg-card text-text-secondary hover:border-text-secondary"
              }
            `.trim()}
          >
            <span>{m.emoji}</span>
            <span>{m.label}</span>
            {!m.available && <Badge label="P2" variant="P2" />}
          </button>
        ))}
      </div>

      {/* 当前模式描述 */}
      <p className="text-xs text-text-secondary/60 font-mono mb-6">
        {MODES.find((m) => m.key === mode)?.desc}
      </p>

      {/* Agent 选择 + 辩题 */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <AgentSelector
          label="正方"
          agents={agents}
          selectedId={agentAId}
          excludedId={agentBId}
          onSelect={setAgentAId}
        />
        <AgentSelector
          label="反方"
          agents={agents}
          selectedId={agentBId}
          excludedId={agentAId}
          onSelect={setAgentBId}
        />
      </div>

      {/* 辩题选择 */}
      <Card className="mb-6">
        <h2 className="text-sm font-mono text-text-primary mb-3">辩题</h2>
        <div className="flex flex-wrap gap-2 mb-4">
          {ARENA_TOPICS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTopic(t)}
              className={`
                px-3 py-1.5 rounded text-xs font-mono transition-colors
                ${topic === t
                  ? "bg-accent-blue/20 border border-accent-blue text-accent-blue"
                  : "bg-bg-secondary border border-border text-text-secondary hover:border-text-secondary"
                }
              `.trim()}
            >
              {t}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTopic("__custom__")}
            className={`
              px-3 py-1.5 rounded text-xs font-mono transition-colors
              ${topic === "__custom__"
                ? "bg-accent-purple/20 border border-accent-purple text-accent-purple"
                : "bg-bg-secondary border border-border text-text-secondary hover:border-text-secondary"
              }
            `.trim()}
          >
            自定义
          </button>
        </div>
        {topic === "__custom__" && (
          <input
            type="text"
            value={customTopic}
            onChange={(e) => setCustomTopic(e.target.value)}
            placeholder="输入你的辩题…"
            className="w-full bg-bg-secondary border border-border rounded px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-secondary/40 focus:outline-none focus:border-accent-green transition-colors"
          />
        )}
      </Card>

      {/* 开始按钮 */}
      <div className="flex justify-center gap-3">
        <button
          type="button"
          disabled={!canStart}
          onClick={handleStart}
          className={`
            px-8 py-3 rounded-lg font-mono text-sm transition-all
            ${canStart
              ? "bg-accent-green text-bg-primary hover:bg-accent-green/90 cursor-pointer"
              : "bg-bg-secondary border border-border text-text-secondary/40 cursor-not-allowed"
            }
          `.trim()}
        >
          ⚔️ 开始对决
        </button>
      </div>

      {!canStart && agentAId && agentBId && agentAId === agentBId && (
        <p className="text-xs font-mono text-accent-red text-center mt-3">
          正方和反方不能是同一个 Agent
        </p>
      )}
    </div>
  );
}

/* ========== 子组件 ========== */

function AgentSelector({
  label,
  agents,
  selectedId,
  excludedId,
  onSelect,
}: {
  label: string;
  agents: AgentResponse[];
  selectedId: string;
  excludedId: string;
  onSelect: (id: string) => void;
}) {
  const available = agents.filter((a) => a.id !== excludedId);

  return (
    <Card>
      <h2 className="text-sm font-mono text-text-primary mb-3">
        {label === "正方" ? "🔵" : "🔴"} {label}
        {selectedId && (
          <span className="ml-2 text-accent-green">
            {agents.find((a) => a.id === selectedId)?.name}
          </span>
        )}
      </h2>
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {available.length === 0 ? (
          <p className="text-xs font-mono text-text-secondary/60 text-center py-6">
            暂无可选 Agent
          </p>
        ) : (
          available.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelect(agent.id)}
              className={`
                w-full flex items-center gap-2 px-3 py-2 rounded text-left text-xs font-mono
                transition-colors
                ${selectedId === agent.id
                  ? "bg-accent-green/10 border border-accent-green/30 text-accent-green"
                  : "bg-bg-secondary/60 border border-transparent text-text-secondary hover:border-border"
                }
              `.trim()}
            >
              <StatusDot
                status={agent.energy > 70 ? "active" : "idle"}
                label=""
              />
              <span>{agent.name}</span>
              <span className="ml-auto text-text-secondary/50">
                {agent.persona.mbti}
              </span>
            </button>
          ))
        )}
      </div>
    </Card>
  );
}

function ScoreBar({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  const pct = Math.min(100, (value / 10) * 100);
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex justify-between text-xs font-mono mb-1">
        <span className="text-text-secondary">{label}</span>
        <span className="text-text-primary">{value.toFixed(1)}</span>
      </div>
      <div className="h-1.5 bg-bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DebateBubble({
  entry,
  align,
  agents,
}: {
  entry: ArenaTranscriptRound;
  align: "left" | "right";
  agents: AgentResponse[];
}) {
  const agent = agents.find((a) => a.id === entry.speakerId);
  const isLeft = align === "left";

  return (
    <div className={`flex gap-2 mb-3 ${isLeft ? "justify-start" : "justify-end"}`}>
      <div
        className={`
          max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed
          ${isLeft
            ? "bg-accent-blue/10 border border-accent-blue/20 text-text-primary"
            : "bg-accent-orange/10 border border-accent-orange/20 text-text-primary"
          }
        `.trim()}
      >
        <div className="text-xs font-mono text-text-secondary/70 mb-1">
          {agent?.name ?? entry.speakerName}
        </div>
        {entry.content}
      </div>
    </div>
  );
}

function TranscriptBubble({
  entry,
  agents,
}: {
  entry: ArenaTranscriptRound;
  agents: AgentResponse[];
}) {
  const agent = agents.find((a) => a.id === entry.speakerId);
  return (
    <div className="flex gap-2 mb-2">
      <div className="max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed bg-accent-blue/10 border border-accent-blue/20 text-text-primary">
        <div className="text-xs font-mono text-text-secondary/70 mb-1">
          {agent?.name ?? entry.speakerName}
        </div>
        {entry.content}
      </div>
    </div>
  );
}

/* ========== 工具函数 ========== */

function groupByRound(
  transcript: ArenaTranscriptRound[],
): [number, ArenaTranscriptRound[]][] {
  const map = new Map<number, ArenaTranscriptRound[]>();
  for (const entry of transcript) {
    const list = map.get(entry.round);
    if (list) {
      list.push(entry);
    } else {
      map.set(entry.round, [entry]);
    }
  }
  return [...map.entries()].sort(([a], [b]) => a - b);
}

function useAvailableAgents(): AgentResponse[] {
  const createdAgents = useAgentStore((s) => s.agents);
  return useMemo(() => {
    const byId = new Map<string, AgentResponse>();
    [...MOCK_AGENTS, ...createdAgents].forEach((a) => byId.set(a.id, a));
    return [...byId.values()];
  }, [createdAgents]);
}
