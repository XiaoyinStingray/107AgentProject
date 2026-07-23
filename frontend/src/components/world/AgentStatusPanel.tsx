import type { AgentResponse } from "../../types/agent";
import type { SSEEvent } from "../../types/events";
import Card from "../shared/Card";
import StatusDot from "../shared/StatusDot";
import Badge from "../shared/Badge";
import { EMOTION_LABELS } from "../../constants/labels";

interface AgentStatusPanelProps {
  agent: AgentResponse;
  /** SSE 事件流——用于推断 Agent 实时状态 */
  events: SSEEvent[];
  className?: string;
}

/* ================================================================
   Agent 实时状态面板——单人剧场左栏。
   展示 Agent 的核心指标 + 最新状态推断。
   ================================================================ */

export default function AgentStatusPanel({
  agent,
  events,
  className = "",
}: AgentStatusPanelProps) {
  // 从事件流推断当前状态
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const isThinking =
    lastEvent?.type === "thought_stream" &&
    lastEvent?.agent_id === agent.id;
  const isActing =
    lastEvent?.type === "agent_action" &&
    lastEvent?.agent_id === agent.id;

  const status: "thinking" | "active" | "idle" = isThinking
    ? "thinking"
    : isActing
      ? "active"
      : events.length > 0
        ? "active"
        : "idle";

  // 精力模拟衰减（每 5 条事件 -2%，下限 10%）
  const energyDecay = Math.max(10, agent.energy - Math.floor(events.length / 5) * 2);

  // 情绪向量（VAD）
  const { valence, arousal, dominance, label } = agent.emotional_state;

  return (
    <Card className={`flex flex-col gap-4 ${className}`}>
      {/* ── 头部：头像区 ── */}
      <div className="flex items-center gap-3">
        {/* 头像圆 */}
        <div className="w-12 h-12 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-xl select-none">
          {agent.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-base text-text-primary truncate">
              {agent.name}
            </h3>
            <StatusDot status={status} label="" />
          </div>
          <span className="text-sm font-mono text-accent-purple/80 bg-accent-purple/10 px-1.5 py-0.5 rounded">
            {agent.persona.mbti}
          </span>
        </div>
      </div>

      {/* ── 精力条 ── */}
      <div>
        <div className="flex justify-between text-sm text-text-secondary mb-1">
          <span>⚡ 精力</span>
          <span className="font-mono">{energyDecay}%</span>
        </div>
        <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              energyDecay > 60
                ? "bg-accent-green"
                : energyDecay > 30
                  ? "bg-accent-orange"
                  : "bg-accent-red"
            }`}
            style={{ width: `${energyDecay}%` }}
          />
        </div>
      </div>

      {/* ── 情绪 VAD ── */}
      <div>
        <p className="text-sm text-text-secondary mb-2">
          情绪: <Badge label={EMOTION_LABELS[label] ?? label} />
        </p>
        <div className="space-y-1.5">
          <VadBar label="愉悦" value={valence} variant="green" />
          <VadBar label="唤醒" value={arousal} variant="orange" />
          <VadBar label="支配" value={dominance} variant="blue" />
        </div>
      </div>

      {/* ── 目标列表 ── */}
      {agent.goals.length > 0 && (
        <div>
          <p className="text-sm text-text-secondary mb-1.5">🎯 目标</p>
          <ul className="space-y-1.5">
            {agent.goals.map((g) => (
              <li
                key={g.id}
                className="flex items-start gap-1.5 text-sm text-text-primary font-mono"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${
                    g.status === "active"
                      ? "bg-accent-green"
                      : g.status === "achieved"
                        ? "bg-accent-blue"
                        : "bg-text-secondary"
                  }`}
                />
                <span className="flex-1">{g.description}</span>
                <span className="text-xs text-text-secondary/60">
                  P{g.priority}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 人格快照 ── */}
      <div>
        <p className="text-sm text-text-secondary mb-1">💡 价值观</p>
        <div className="flex flex-wrap gap-1">
          {agent.persona.values.map((v) => (
            <span
              key={v}
              className="text-xs font-mono text-accent-blue/70 bg-accent-blue/10 px-1.5 py-0.5 rounded"
            >
              {v}
            </span>
          ))}
        </div>
      </div>
    </Card>
  );
}

/* ── 子组件：VAD 进度条 ── */
const VAD_BAR_COLORS = {
  green: "bg-accent-green",
  orange: "bg-accent-orange",
  blue: "bg-accent-blue",
} as const;

function VadBar({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: keyof typeof VAD_BAR_COLORS;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-text-secondary w-8 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-bg-primary rounded-full overflow-hidden">
        <div
          className={`h-full ${VAD_BAR_COLORS[variant]} rounded-full transition-all duration-300`}
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
      <span className="text-text-secondary/60 font-mono w-8 text-right">
        {value.toFixed(1)}
      </span>
    </div>
  );
}
