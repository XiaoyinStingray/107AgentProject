import { useEffect, useRef, useState } from "react";
import type { SSEEvent } from "../../types/events";
import ThoughtBubble from "./ThoughtBubble";

const WINDOW_SIZE = 200;
const WINDOW_STEP = 100;

interface ThoughtStreamProps {
  events: SSEEvent[];
  /** 是否自动滚底——用户手动上滚时暂停 */
  autoScroll?: boolean;
  /** 点击事件气泡时触发——用于决策回放展开 */
  onEventClick?: (event: SSEEvent) => void;
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
  onEventClick,
  className = "",
}: ThoughtStreamProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousLengthRef = useRef(events.length);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [windowEnd, setWindowEnd] = useState(events.length);

  useEffect(() => {
    const previousLength = previousLengthRef.current;
    setWindowEnd((currentEnd) => {
      const followedLatest = currentEnd >= previousLength;
      if (events.length <= WINDOW_SIZE || followedLatest) {
        return events.length;
      }
      return Math.min(currentEnd, events.length);
    });
    previousLengthRef.current = events.length;
    if (events.length === 0) setUserScrolledUp(false);
  }, [events.length]);

  const boundedEnd = Math.min(windowEnd, events.length);
  const windowStart = Math.max(0, boundedEnd - WINDOW_SIZE);
  const visibleEvents = events.slice(windowStart, boundedEnd);
  const hasEarlier = windowStart > 0;
  const followsLatest = boundedEnd >= events.length;

  // 用 wheel/touchstart 检测用户真实滚动交互（程序化滚动不触发这些事件）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // 仅当向上滚时才标记 userScrolledUp，向下滚不做任何操作
      // 这样用户向下滚时不会触发自动跳到底部
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

  // 新事件到达 → 自动滚底（用户未手动上滚时始终滚到底部）
  useEffect(() => {
    if (!autoScroll || userScrolledUp || !followsLatest) return;
    const el = containerRef.current;
    if (!el) return;
    // 直接滚到底部，确保新消息可见
    el.scrollTop = el.scrollHeight;
  }, [events.length, autoScroll, followsLatest]);

  // 连续同一 Agent 的消息合并显示（compact 模式）
  const renderEvents = () => {
    return visibleEvents.map((event, idx) => {
      const originalIndex = windowStart + idx;
      const prev = originalIndex > 0 ? events[originalIndex - 1] : null;
      const compact =
        prev != null &&
        prev.type === event.type &&
        prev.agent_id === event.agent_id &&
        prev.type !== "tick_boundary" &&
        prev.type !== "world_event";
      const key =
        event.id ??
        `${event.tick}-${event.type}-${event.agent_id ?? "world"}-${originalIndex}`;

      return (
        <ThoughtBubble
          key={key}
          event={event}
          compact={compact}
          onClick={onEventClick}
        />
      );
    });
  };

  const showEarlier = () => {
    setUserScrolledUp(true);
    setWindowEnd((currentEnd) =>
      Math.max(WINDOW_SIZE, currentEnd - WINDOW_STEP),
    );
  };

  const returnToLatest = () => {
    setWindowEnd(events.length);
    setUserScrolledUp(false);
    requestAnimationFrame(() => {
      const el = containerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  };

  return (
    <div
      ref={containerRef}
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
          {hasEarlier && (
            <button
              type="button"
              onClick={showEarlier}
              className="
                block mx-auto mb-3 text-xs font-mono text-text-secondary
                border border-border rounded-full px-3 py-1
                hover:text-accent-blue hover:border-accent-blue/40
                transition-colors
              "
            >
              查看更早记录
            </button>
          )}

          {renderEvents()}

          {(userScrolledUp || !followsLatest) && (
            <button
              type="button"
              onClick={returnToLatest}
              className="
                sticky bottom-2 left-1/2 -translate-x-1/2
                text-xs font-mono text-accent-blue/80
                bg-bg-card border border-accent-blue/20 rounded-full
                px-3 py-1 hover:bg-accent-blue/10 transition-colors
              "
            >
              ↓ 回到最新
            </button>
          )}
        </div>
      )}
    </div>
  );
}
