import { useEffect, useRef, useCallback } from "react";
import { useSSEStore } from "../stores/useSSEStore";
import { client } from "../api/client";
import type { SSEEvent, SimEvent } from "../types/events";

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
    totalEventCount,
    appendUnique,
    clear,
    setConnected,
    connected,
    relationships,
    lastRelationshipKey,
    hydrateRelationships,
  } = useSSEStore();

  /** 去重追加事件——委托给 store 的 O(1) appendUnique。 */
  const appendUniqueEvent = useCallback(
    (event: SSEEvent) => {
      appendUnique(event);
      if (event.tick > lastTickRef.current) {
        lastTickRef.current = event.tick;
      }
    },
    [appendUnique],
  );

  /** 重连补偿：从 API 拉取最近事件，弥补 SSE 不重放历史事件的缺陷。
   * 若事件列表为空（页面导航后恢复），拉取全部历史事件。
   *
   * 字段映射：REST API 返回 SimEvent（source_agent_id / description），
   * 前端组件消费 SSEEvent（agent_id / content）。此处做转换。 */
  const replayMissedEvents = useCallback(async () => {
    if (!worldId) return;
    try {
      const storeEvents = useSSEStore.getState().events;
      const from = storeEvents.length === 0 ? 0 : Math.max(0, lastTickRef.current - 5);
      const raw = await client.get<SimEvent[]>(
        `/worlds/${worldId}/events?tick_from=${from}`,
      );
      // 映射：SimEvent → SSEEvent 字段对齐（完全对应后端 _event_to_dict）
      const mapped: SSEEvent[] = raw.map((e) => {
        const data = (e.data ?? {}) as Record<string, unknown>;
        const base: SSEEvent = {
          id: e.id,
          type: e.type,
          agent_id: e.source_agent_id ?? "",
          agent_name: (data.agent_name as string) ?? "",
          description: e.description,
          content: e.description,
          tick: e.tick,
          data,
        };
        // 按类型平铺业务字段，与 sse.py:_event_to_dict 对齐
        if (e.type === "agent_message") {
          base.message = (data.message as string) ?? e.description;
          base.subtext = (data.subtext as string) ?? "";
          base.tone = (data.tone as string) ?? "neutral";
        } else if (e.type === "agent_action") {
          base.action = (data.action as string) ?? "";
          base.target = (data.target as string) ?? "";
        }
        return base;
      });
      for (const e of mapped) {
        appendUniqueEvent(e);
        if (e.tick > lastTickRef.current) {
          lastTickRef.current = e.tick;
        }
      }
    } catch (err) {
      console.warn("replayMissedEvents failed:", err);
    }
  }, [worldId, appendUniqueEvent]);

  const connect = useCallback(() => {
    if (!worldId) return;
    if (eventSourceRef.current) return; // 已连接

    const es = new EventSource(`/api/worlds/${worldId}/stream`);

    es.onopen = () => {
      setConnected(true);
      // replayMissedEvents 由 useEffect 统一触发，避免重复调用
    };
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as SSEEvent;
        appendUniqueEvent(event);
      } catch {
        // 忽略解析失败的帧
      }
    };

    eventSourceRef.current = es;
  }, [worldId, setConnected, appendUniqueEvent]);

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
    totalEventCount,
    connected,
    relationships,
    lastRelationshipKey,
    hydrateRelationships,
    connect,
    disconnect,
    clear,
  };
}
