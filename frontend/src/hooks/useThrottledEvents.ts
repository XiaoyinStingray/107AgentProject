import { useEffect, useState } from "react";
import type { SSEEvent } from "../types/events";
import type { SandboxSpeed } from "../types/sandbox";

/**
 * 事件节流展示。
 * - paused=true 或 events 被清空再填充 → 全量展示
 * - 正常运行 → 逐个节流展示
 */
export function useThrottledEvents(
  events: SSEEvent[],
  speed: SandboxSpeed,
  paused: boolean,
  resetKey: string | null,
): SSEEvent[] {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => setVisibleCount(0), [resetKey]);

  useEffect(() => {
    if (events.length === 0) {
      setVisibleCount(0);
      return;
    }
    // 暂停状态 / 需要追赶 → 全量展示
    if (paused || visibleCount > events.length) {
      setVisibleCount(events.length);
      return;
    }
    if (visibleCount >= events.length) return;
    const timer = window.setTimeout(
      () => setVisibleCount((c) => Math.min(c + 1, events.length)),
      800 / speed,
    );
    return () => window.clearTimeout(timer);
  }, [events.length, paused, speed, visibleCount]);

  return events.slice(0, visibleCount);
}
