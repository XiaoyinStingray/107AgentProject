import { useEffect, useRef, useState } from "react";
import type { SSEEvent, SSEEventType } from "../../types/events";
import type { EventFeedProps } from "../../types/sandbox";

/**
 * 群体沙盒事件流。
 * 自动滚底（复用 ThoughtStream 模式），用户手动上滚时暂停。
 */
export default function EventFeed({
  events,
  selectedTick = null,
  className = "",
}: EventFeedProps) {
  const feedEvents = events.filter(
    (event) =>
      event.type !== "thought_stream" &&
      (selectedTick === null || event.tick === selectedTick),
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const isAtBottom = () => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // 新事件到达 → 自动滚底
  useEffect(() => {
    if (userScrolledUp) return;
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events, userScrolledUp]);

  const handleScroll = () => {
    setUserScrolledUp(!isAtBottom());
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-xs font-mono text-text-secondary">EVENT FEED</h2>
        <span className="text-xs font-mono text-text-secondary/60">
          {selectedTick === null ? "全部" : `Tick #${selectedTick}`}
        </span>
      </div>

      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={`flex-1 min-h-0 overflow-y-auto p-4 ${className}`}
      >
        {feedEvents.length === 0 ? (
          <p className="text-xs font-mono text-text-secondary/60 text-center py-8">
            {events.length === 0 ? "等待事件…" : "当前 Tick 没有事件"}
          </p>
        ) : (
          <div className="space-y-2">
            {feedEvents.map((event, index) => (
              <EventRow
                key={`${event.tick}-${event.type}-${index}`}
                event={event}
              />
            ))}
          </div>
        )}

        {userScrolledUp && (
          <button
            onClick={() => {
              setUserScrolledUp(false);
              const el = containerRef.current;
              if (el) el.scrollTop = el.scrollHeight;
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

function EventRow({ event }: { event: SSEEvent }) {
  const visual = EVENT_VISUALS[event.type];
  const actor = event.agent_name ?? "WORLD";

  return (
    <article
      className={`border-l-2 ${visual.border} bg-bg-secondary/60 px-3 py-2`}
    >
      <div className="flex items-center gap-2 text-xs font-mono">
        <span className={visual.text}>{visual.label}</span>
        <span className="text-text-secondary/60">Tick #{event.tick}</span>
        <span className="ml-auto text-text-secondary">{actor}</span>
      </div>
      <p className="text-sm text-text-primary mt-1 leading-relaxed">
        {formatEventDescription(event)}
      </p>
      {event.type === "relationship_change" && (
        <RelationshipMeta event={event} />
      )}
    </article>
  );
}

function RelationshipMeta({ event }: { event: SSEEvent }) {
  const data = event.data;
  const change = typeof data?.change === "number" ? data.change : null;
  const score = typeof data?.score === "number" ? data.score : null;
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

function formatEventDescription(event: SSEEvent): string {
  if (event.type === "agent_message") {
    return event.message ?? event.description ?? "Agent 发送了一条消息";
  }
  if (event.type === "agent_action") {
    const action = event.action ?? "执行行动";
    const target = event.target ? ` → ${event.target}` : "";
    const message = event.message ? `：${event.message}` : "";
    return `${action}${target}${message}`;
  }
  return (
    event.description ?? event.message ?? event.content ?? "未命名事件"
  );
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
    border: "border-accent-green",
    text: "text-accent-green",
  },
  agent_action: {
    label: "ACTION",
    border: "border-accent-orange",
    text: "text-accent-orange",
  },
  world_event: {
    label: "WORLD",
    border: "border-accent-purple",
    text: "text-accent-purple",
  },
  relationship_change: {
    label: "RELATION",
    border: "border-accent-purple",
    text: "text-accent-purple",
  },
  tick_boundary: {
    label: "TICK",
    border: "border-border",
    text: "text-text-secondary",
  },
};
