import { useEffect, useState } from "react";
import type { SSEEvent } from "../types/events";
import type { SandboxSpeed } from "../types/sandbox";

/** Reveal queued SSE events at the selected presentation speed. */
export function useThrottledEvents(
  events: SSEEvent[],
  speed: SandboxSpeed,
  paused: boolean,
  resetKey: string | null,
): SSEEvent[] {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => setVisibleCount(0), [resetKey]);

  useEffect(() => {
    if (paused || visibleCount >= events.length) return;
    const timer = window.setTimeout(
      () => setVisibleCount((count) => Math.min(count + 1, events.length)),
      800 / speed,
    );
    return () => window.clearTimeout(timer);
  }, [events.length, paused, speed, visibleCount]);

  return events.slice(0, visibleCount);
}
