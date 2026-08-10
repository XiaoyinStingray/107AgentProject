import { useEffect, useState } from "react";
import type { SSEEvent } from "../types/events";
import type { SandboxSpeed } from "../types/sandbox";

/**
 * 事件节流展示。
 * - events 被清空再填充 → 全量展示（追赶模式）
 * - 正常运行 / 暂停 → 自适应节流展示
 *   积压越多释放越快，避免事件堆积
 */
export function useThrottledEvents(
  events: SSEEvent[],
  speed: SandboxSpeed,
  resetKey: string | null,
): SSEEvent[] {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => setVisibleCount(0), [resetKey]);

  useEffect(() => {
    if (events.length === 0) {
      setVisibleCount(0);
      return;
    }
    // 需要追赶（visibleCount 落后于 events）→ 全量展示
    if (visibleCount > events.length) {
      setVisibleCount(events.length);
      return;
    }
    if (visibleCount >= events.length) return;

    const backlog = events.length - visibleCount;
    // 积压越多，每次释放越多
    const batchSize =
      backlog > 20 ? 10 :
      backlog > 10 ? 5 :
      backlog > 5 ? 3 : 1;
    const baseInterval = Math.max(200, 500 / speed);

    const timer = window.setTimeout(
      () => setVisibleCount((c) => Math.min(c + batchSize, events.length)),
      baseInterval,
    );
    return () => window.clearTimeout(timer);
  }, [events.length, speed, visibleCount]);

  return events.slice(0, visibleCount);
}
