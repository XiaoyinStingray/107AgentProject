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

  /** 去重追加事件。
   *  有 id → 按 id 去重（防 SSE 重连 + API 补发重复）。
   *  无 id → 同 type + 同 tick 的连续事件跳过（防 paused 每秒一条撑爆数组）。 */
  const appendUnique = useCallback(
    (event: SSEEvent) => {
      const existing = useSSEStore.getState().events;
      if (event.id && existing.some((e) => e.id === event.id)) return;
      // 无 id 的基础设施事件（paused/connected/tick_boundary 等）——防重复堆积
      if (!event.id) {
        const last = existing[existing.length - 1];
        if (last && last.type === event.type && last.tick === event.tick) return;
      }
      appendEvent(event);
      if (event.tick > lastTickRef.current) {
        lastTickRef.current = event.tick;
      }
    },
    [appendEvent],
  );

  /** 重连补偿：从 API 拉取最近事件，弥补 SSE 不重放历史事件的缺陷。
   * 若事件列表为空（页面导航后恢复），拉取全部历史事件。 */
  const replayMissedEvents = useCallback(async () => {
    if (!worldId) return;
    try {
      const storeEvents = useSSEStore.getState().events;
      const from = storeEvents.length === 0 ? 0 : Math.max(0, lastTickRef.current - 5);
      const missed = await client.get<SSEEvent[]>(
        `/worlds/${worldId}/events?tick_from=${from}`,
      );
      for (const e of missed) {
        appendUnique(e);
        if (e.tick > lastTickRef.current) {
          lastTickRef.current = e.tick;
        }
      }
    } catch (err) {
      console.warn("replayMissedEvents failed:", err);
    }
  }, [worldId, appendUnique]);

  const connect = useCallback(() => {
    if (!worldId) return;
    if (eventSourceRef.current) return; // 已连接

    const es = new EventSource(`/api/worlds/${worldId}/stream`);

    es.onopen = () => {
      setConnected(true);
      replayMissedEvents(); // SSE 断线重连时补发
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

  // worldId 变化时：清空旧数据、连接 SSE、拉取历史事件（与 SSE 成败无关）
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
      // 历史事件从 REST API 拉取，不依赖 SSE 连接状态（重启后 SSE 可能 404）
      replayMissedEvents();
    } else {
      disconnect();
    }
    return () => disconnect();
  }, [worldId, connect, disconnect, clear, replayMissedEvents]);

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
