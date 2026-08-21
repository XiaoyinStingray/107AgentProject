import { useEffect, useMemo, useRef, useState } from "react";
import type { SSEEvent, SSEEventType } from "../../types/events";
import type { EventFeedProps } from "../../types/sandbox";
import { getSessionEndCopy } from "./sessionEnd";

/**
 * 群体沙盒事件流。
 * 自动滚底（复用 ThoughtStream 模式），用户手动上滚时暂停。
 */
export default function EventFeed({
  events,
  selectedTick = null,
  agents = [],
  feedFilterIds = [],
  onToggleFeedAgent,
  className = "",
}: EventFeedProps) {
  const feedEvents = useMemo(
    () => events.filter(
      (event) =>
        event.type !== "thought_stream" &&
        !INFRASTRUCTURE_EVENTS.has(event.type) &&
        (selectedTick === null || event.tick === selectedTick) &&
        (feedFilterIds.length === 0 || !event.agent_id || feedFilterIds.includes(event.agent_id)),
    ),
    [events, selectedTick, feedFilterIds],
  );
  const sessionEndEvent = useMemo(
    () => {
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (
          event.type === "session_end" &&
          (selectedTick === null || event.tick === selectedTick)
        ) {
          return event;
        }
      }
      return undefined;
    },
    [events, selectedTick],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // 用 wheel/touchstart 检测用户真实滚动交互（程序化滚动不触发这些事件）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) setUserScrolledUp(true);
    };
    const onTouch = () => setUserScrolledUp(true);
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchstart", onTouch, { passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouch);
    };
  }, []);

  // 新事件到达 → 自动滚底（除非用户主动上滚暂停跟随）
  useEffect(() => {
    if (userScrolledUp) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [feedEvents.length, sessionEndEvent, userScrolledUp]);

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-xs font-mono text-text-secondary">EVENT FEED</h2>
        <span className="text-xs font-mono text-text-secondary/60">
          {selectedTick === null ? "全部" : `Tick #${selectedTick}`}
        </span>
      </div>

      {agents.length > 0 && onToggleFeedAgent && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border shrink-0 overflow-x-auto">
          <span className="text-xs font-mono text-text-secondary/60 shrink-0">Agent:</span>
          {agents.map((agent) => {
            const isActive = feedFilterIds.length === 0 || feedFilterIds.includes(agent.id);
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onToggleFeedAgent(agent.id)}
                className={`text-xs font-mono px-2 py-0.5 rounded border transition-colors shrink-0 ${
                  isActive
                    ? "border-accent-blue/60 bg-accent-blue/10 text-accent-blue"
                    : "border-border bg-bg-secondary/40 text-text-secondary/60 hover:text-text-secondary"
                }`}
              >
                {agent.name || agent.id.slice(0, 8)}
              </button>
            );
          })}
        </div>
      )}

      <div
        ref={containerRef}
        data-testid="event-feed-scroll"
        className={`flex-1 min-h-0 overflow-y-auto p-4 ${className}`}
      >
        {feedEvents.length === 0 && !sessionEndEvent ? (
          <p className="text-xs font-mono text-text-secondary/60 text-center py-8">
            {events.length === 0 ? "等待事件…" : "当前 Tick 没有事件"}
          </p>
        ) : feedEvents.length > 0 ? (
          <div className="space-y-2">
            {feedEvents.map((event, index) => (
              <EventRow
                key={`${event.tick}-${event.type}-${index}`}
                event={event}
              />
            ))}
          </div>
        ) : null}

        {sessionEndEvent && <SessionEndCard event={sessionEndEvent} />}

        {userScrolledUp && (
          <button
            onClick={() => {
              setUserScrolledUp(false);
              requestAnimationFrame(() => {
                const el = containerRef.current;
                if (el) el.scrollTop = el.scrollHeight;
              });
            }}
            className="
              sticky bottom-2 left-1/2 -translate-x-1/2
              text-xs font-mono text-accent-blue/80
              bg-bg-card border border-accent-blue/20 rounded-full
              px-3 py-1 hover:bg-accent-blue/10 transition-colors
            "
          >
            ↓ 回到底部
          </button>
        )}
      </div>
    </>
  );
}

function SessionEndCard({ event }: { event: SSEEvent }) {
  const copy = getSessionEndCopy(event.reason);
  return (
    <section
      role="status"
      className="mt-3 rounded-lg border border-accent-green/35 bg-accent-green/10 px-4 py-3"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden="true">✅</span>
        <strong className="text-sm font-mono text-accent-green">{copy.title}</strong>
        <span className="ml-auto text-xs font-mono text-text-secondary/60">
          Tick #{event.tick}
        </span>
      </div>
      <p className="mt-1 text-xs font-mono text-text-secondary">{copy.detail}</p>
    </section>
  );
}

function EventRow({ event }: { event: SSEEvent }) {
  const visual = EVENT_VISUALS[event.type];
  const isInjected = !!event.data?.injected;
  const targetNames: string[] = isInjected ? ((event.data?.target_names as string[]) ?? []) : [];
  // 使用 || 而非 ?? ——空字符串也应回退到默认值
  const actor = event.agent_name || "WORLD";

  return (
    <article
      className={`border-l-2 ${visual.border} bg-bg-secondary/60 px-3 py-2`}
    >
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className={visual.text}>{visual.label}</span>
        <span className="text-text-secondary/60">Tick #{event.tick}</span>
        <span className="ml-auto text-text-secondary">{actor}</span>
        {isInjected && targetNames.length > 0 && (
          <span className="text-accent-orange/80">→ {targetNames.join(", ")}</span>
        )}
      </div>
      <p className="text-sm text-text-primary mt-1 leading-relaxed">
        {formatEventDescription(event)}
      </p>
      {event.type === "relationship_change" && (
        <RelationshipMeta event={event} />
      )}
      {event.type === "conflict_detected" && (
        <ConflictMeta event={event} />
      )}
    </article>
  );
}

function RelationshipMeta({ event }: { event: SSEEvent }) {
  const data = event.data;
  const oldScore = typeof data?.old_score === "number" ? data.old_score : null;
  const score = typeof data?.new_score === "number" ? data.new_score : null;
  const change = oldScore === null || score === null ? null : score - oldScore;
  const changeText = change === null ? "变化未知" : formatSignedNumber(change);
  const scoreText = score === null ? "分数未知" : `当前 ${score.toFixed(2)}`;

  return (
    <div className="mt-2 flex items-center gap-2 text-xs font-mono text-accent-purple/80">
      <span>关系变化 {changeText}</span>
      <span className="text-text-secondary/50">·</span>
      <span>{scoreText}</span>
    </div>
  );
}

function ConflictMeta({ event }: { event: SSEEvent }) {
  const data = event.data;
  const goalA = typeof data?.goal_a === "string" ? data.goal_a : null;
  const goalB = typeof data?.goal_b === "string" ? data.goal_b : null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-mono text-accent-red/80">
      {goalA && <span>⚔️ {goalA}</span>}
      {goalA && goalB && <span className="text-text-secondary/50">vs</span>}
      {goalB && <span>{goalB}</span>}
    </div>
  );
}

function formatEventDescription(event: SSEEvent): string {
  const stripMarkers = (t: string) => {
    let cleaned = t.replace(/\[END_TICK\]/g, "").trim();
    // 清除 DSML 标签：支持 <||DSML||...>、< | | DSML | | ...>、</ | | DSML | | ...> 等格式（包括跨行）
    // 关键：| 和 | 之间可能有空格（如 < | | DSML | |）
    cleaned = cleaned.replace(/<\/?\s*\|\s*\|\s*DSML\s*\|\s*\|[^>]*>/gs, "").trim();
    cleaned = cleaned.replace(/<\/?\s*\|\s*\|\s*DSML\s*\|\s*\|/g, "").trim();
    cleaned = cleaned.replace(/\|\s*\|\s*DSML\s*\|\s*\|\s*>/g, "").trim();
    cleaned = cleaned.replace(/\|\s*\|\s*DSML\s*\|\s*\|/g, "").trim();
    // 清除 tool_calls 残留
    cleaned = cleaned.replace(/tool_calls/g, "").trim();
    return cleaned;
  };
  if (event.type === "agent_message") {
    const raw = event.message ?? event.description ?? "Agent 发送了一条消息";
    return stripMarkers(raw);
  }
  if (event.type === "agent_action") {
    const action = event.action ?? "执行行动";
    const target = event.target ? ` → ${event.target}` : "";
    const message = event.message ? `：${stripMarkers(event.message)}` : "";
    return `${action}${target}${message}`;
  }
  const raw = event.description ?? event.message ?? event.content ?? "未命名事件";
  return stripMarkers(raw);
}

function formatSignedNumber(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

const EVENT_VISUALS: Record<
  SSEEventType,
  { label: string; border: string; text: string }
> = {
  thought_stream: {
    label: "THOUGHT",
    border: "border-accent-blue",
    text: "text-accent-blue",
  },
  agent_message: {
    label: "MESSAGE",
    border: "border-accent-purple",
    text: "text-accent-purple",
  },
  agent_action: {
    label: "ACTION",
    border: "border-accent-green",
    text: "text-accent-green",
  },
  world_event: {
    label: "WORLD",
    border: "border-accent-orange",
    text: "text-accent-orange",
  },
  relationship_change: {
    label: "RELATION",
    border: "border-accent-cyan",
    text: "text-accent-cyan",
  },
  conflict_detected: {
    label: "CONFLICT",
    border: "border-accent-red",
    text: "text-accent-red",
  },
  tick_boundary: {
    label: "TICK",
    border: "border-border",
    text: "text-text-secondary",
  },
  // 基础设施事件（不进入 EventFeed，占位满足 Record 类型）
  connected: { label: "", border: "", text: "" },
  paused: { label: "", border: "", text: "" },
  error: { label: "", border: "", text: "" },
  session_end: { label: "", border: "", text: "" },
  goal_update: { label: "", border: "", text: "" },
  plan_updated: { label: "", border: "", text: "" },
  plan_revised: { label: "", border: "", text: "" },
  coordinator_nudge: { label: "", border: "", text: "" },
  report_ready: { label: "", border: "", text: "" },
  debate_update: { label: "", border: "", text: "" },
  role_evolved: { label: "", border: "", text: "" },
};

const INFRASTRUCTURE_EVENTS = new Set<SSEEventType>([
  "connected",
  "paused",
  "error",
  "session_end",
  "goal_update",
  "plan_updated",
  "coordinator_nudge",
  "report_ready",
  "debate_update",
  "role_evolved",
]);
