import { useEffect, useRef } from "react";
import ThoughtBubble from "../../components/agent/ThoughtBubble";
import type { SSEEvent } from "../../types/events";

interface Props {
  events: SSEEvent[];
  connected: boolean;
  isPaused: boolean;
}

export default function LiveChat({ events, connected, isPaused }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { bottomRef.current?.scrollIntoView?.({ behavior: "smooth" }); } catch {}
  }, [events.length]);

  const chatEvents = events.filter(
    (e) => e.type !== "tick_boundary" && e.type !== "connected" && e.type !== "paused" && e.type !== "session_end"
      && e.type !== "plan_updated" && e.type !== "plan_revised" && e.type !== "coordinator_nudge"
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <span className={`w-2 h-2 rounded-full ${connected ? "bg-accent-green" : "bg-accent-red"}`} />
        <span className="text-xs font-mono text-text-secondary">
          {connected ? "实时连接" : isPaused ? "已暂停" : "连接断开"}
        </span>
        <span className="text-xs font-mono text-text-secondary/50 ml-auto">
          {chatEvents.length} 条消息
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {chatEvents.length === 0 && (
          <p className="text-xs font-mono text-text-secondary/40 text-center py-8">
            {connected ? "等待 Agent 开始对话…" : isPaused ? "模拟已暂停" : "正在连接…"}
          </p>
        )}
        {chatEvents.map((e) => (
          <ThoughtBubble key={e.id || `${e.tick}-${e.type}`} event={e} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
