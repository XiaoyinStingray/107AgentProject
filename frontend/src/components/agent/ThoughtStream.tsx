import { useEffect, useRef, useState } from "react";
import type { SSEEvent } from "../../types/events";
import ThoughtBubble from "./ThoughtBubble";

interface ThoughtStreamProps {
  events: SSEEvent[];
  /** 是否自动滚底——用户手动上滚时暂停 */
  autoScroll?: boolean;
  className?: string;
}

/**
 * 思维流滚动容器。
 * - 新事件到达时自动滚到底部
 * - 用户手动上滚时暂停自动滚底，回到底部后恢复
 * - 空列表时显示提示文案
 */
export default function ThoughtStream({
  events,
  autoScroll = true,
  className = "",
}: ThoughtStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  // 判断是否在底部
  const isAtBottom = () => {
    const el = containerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  // 新事件到达 → 自动滚底
  useEffect(() => {
    if (!autoScroll || userScrolledUp) return;
    const el = containerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events, autoScroll, userScrolledUp]);

  // 检测用户手动滚动
  const handleScroll = () => {
    setUserScrolledUp(!isAtBottom());
  };

  // 连续同一 Agent 的消息合并显示（compact 模式）
  const renderEvents = () => {
    return events.map((event, idx) => {
      const prev = idx > 0 ? events[idx - 1] : null;
      const compact =
        prev != null &&
        prev.type === event.type &&
        prev.agent_id === event.agent_id &&
        prev.type !== "tick_boundary" &&
        prev.type !== "world_event";

      return <ThoughtBubble key={idx} event={event} compact={compact} />;
    });
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className={`
        overflow-y-auto p-4
        ${events.length === 0 ? "flex items-center justify-center" : ""}
        ${className}
      `.trim()}
    >
      {events.length === 0 ? (
        <p className="text-sm text-text-secondary/50 font-mono">
          等待事件…点击「开始推流」启动思维流
        </p>
      ) : (
        <div className="max-w-2xl mx-auto">
          {renderEvents()}

          {/* 手动上滚提示 */}
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
      )}
    </div>
  );
}
