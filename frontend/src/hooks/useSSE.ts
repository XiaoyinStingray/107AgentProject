import { useEffect, useRef, useCallback } from "react";
import { useSSEStore } from "../stores/useSSEStore";
import { client } from "../api/client";
import type { SSEEvent } from "../types/events";

/**
 * 真 SSE hook——连接后端 `GET /api/worlds/{id}/stream`，接收实时事件。
 *
 * 特性：
 * - EventSource 原生自动重连
 * - 重连后自动拉取最近事件补偿（防断线丢数据）
 * - 按事件 id 去重
 */
export function useSSE(worldId: string | null) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const lastTickRef = useRef<number>(0);
  const prevWorldIdRef = useRef<string | null>(null);
  const {
    events,
    appendEvent,
    clear,
    setConnected,
    connected,
    relationships,
    lastRelationshipKey,
    hydrateRelationships,
  } = useSSEStore();

  /** 去重追加事件 */
  const appendUnique = useCallback(
    (event: SSEEvent) => {
      const existing = useSSEStore.getState().events;
      // 按 id 去重；无 id 的事件（如 connected/error）直接追加
      if (event.id && existing.some((e) => e.id === event.id)) return;
      appendEvent(event);
      if (event.tick > lastTickRef.current) {
        lastTickRef.current = event.tick;
      }
    },
    [appendEvent],
  );

  /** 断线重连补偿：拉取 lastTick 之后的事件 */
  const replayMissedEvents = useCallback(async () => {
    if (!worldId || lastTickRef.current <= 0) return;
    try {
      const missed = await client.get<SSEEvent[]>(
        `/worlds/${worldId}/events?tick_from=${lastTickRef.current}`,
      );
      missed.forEach((e) => appendUnique(e));
    } catch {
      // 补偿失败不影响主流程，静默跳过
    }
  }, [worldId, appendUnique]);

  const connect = useCallback(() => {
    if (!worldId) return;
    if (eventSourceRef.current) return; // 已连接

    const es = new EventSource(`/api/worlds/${worldId}/stream`);

    es.onopen = () => {
      setConnected(true);
      // 重连后补发断线期间的事件
      replayMissedEvents();
    };
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SSEEvent;
        appendUnique(event);
      } catch {
        // 忽略解析失败的帧
      }
    };

    eventSourceRef.current = es;
  }, [worldId, setConnected, appendUnique, replayMissedEvents]);

  const disconnect = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setConnected(false);
  }, [setConnected]);

  // worldId 变化时重连；仅切换到不同 World 时才清空事件
  useEffect(() => {
    const prevId = prevWorldIdRef.current;
    prevWorldIdRef.current = worldId;

    if (worldId !== prevId && prevId !== null) {
      // 切换到了不同的 World → 清空
      clear();
      lastTickRef.current = 0;
    }

    if (worldId) {
      if (!eventSourceRef.current) {
        connect();
      }
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [worldId, connect, disconnect, clear]);

  return {
    events,
    connected,
    relationships,
    lastRelationshipKey,
    hydrateRelationships,
    connect,
    disconnect,
    clear,
  };
}
