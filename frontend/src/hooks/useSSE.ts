import { useEffect, useRef, useCallback } from "react";
import { useSSEStore } from "../stores/useSSEStore";

/**
 * 真 SSE hook——连接后端 `GET /api/worlds/{id}/stream`，接收实时事件。
 * Step 18 定义接口，Step 19 单人剧场正式使用。
 */
export function useSSE(worldId: string | null) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const { events, appendEvent, clear, setConnected, connected } = useSSEStore();

  const connect = useCallback(() => {
    if (!worldId) return;

    const es = new EventSource(`/api/worlds/${worldId}/stream`);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data);
        appendEvent(event);
      } catch {
        // 忽略解析失败的帧
      }
    };

    eventSourceRef.current = es;
  }, [worldId, appendEvent, setConnected]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    setConnected(false);
  }, [setConnected]);

  // 组件卸载时断开
  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  return { events, connected, connect, disconnect, clear };
}
