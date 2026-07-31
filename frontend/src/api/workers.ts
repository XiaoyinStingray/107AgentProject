/**
 * Worker API — AgentWorker 前端 API 层。
 *
 * 使用 fetch + ReadableStream 消费 SSE（POST 请求不能用 EventSource）。
 */

import { useState, useRef, useCallback } from "react";

// =============================================================================
// 类型定义
// =============================================================================

export type WorkerEventType =
  | "worker.started"
  | "worker.plan"
  | "worker.step_decision"
  | "worker.tool_start"
  | "worker.tool_result"
  | "worker.reflection"
  | "worker.file_updated"
  | "worker.done"
  | "worker.error"
  | "worker.summary"
  | "worker.thought";

export interface WorkerEvent {
  type: WorkerEventType;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface WorkerExecuteRequest {
  agent_id: string;
  task: string;
  workspace_type?: "local" | "cloud";
  workspace_config?: Record<string, unknown>;
  reuse_run_id?: string;  // 追加对话时复用已有工作区
}

// =============================================================================
// useWorkerExecute hook — POST SSE 流式消费
// =============================================================================

export interface WorkerExecuteState {
  connected: boolean;
  events: WorkerEvent[];
  done: boolean;
  error: string | null;
}

export function useWorkerExecute() {
  const [state, setState] = useState<WorkerExecuteState>({
    connected: false,
    events: [],
    done: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async (req: WorkerExecuteRequest) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({
      connected: true,
      events: req.reuse_run_id
        ? [...prev.events, {
            type: "worker.started" as WorkerEventType,
            data: { run_id: req.reuse_run_id, agent_name: "", task: `--- 追加: ${req.task.slice(0, 60)} ---`, workspace: "" },
            timestamp: new Date().toISOString(),
          }]
        : [],
      done: false,
      error: null,
    }));

    try {
      const response = await fetch("/api/workers/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        setState((prev) => ({ ...prev, connected: false, error: text }));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setState((prev) => ({ ...prev, connected: false, error: "No response body" }));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const event: WorkerEvent = JSON.parse(line.slice(6));
              setState((prev) => {
                const newEvents = [...prev.events, event];
                const isDone =
                  event.type === "worker.done" || event.type === "worker.error";
                return {
                  ...prev,
                  events: newEvents.slice(-1000), // 最多保留 1000 条
                  done: isDone,
                  error: event.type === "worker.error" ? String(event.data?.message || "未知错误") : prev.error,
                };
              });
            } catch {
              // 忽略解析失败的行
            }
          }
        }
      }

      setState((prev) => ({ ...prev, connected: false }));
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        setState((prev) => ({ ...prev, connected: false }));
        return;
      }
      setState((prev) => ({
        ...prev,
        connected: false,
        error: err instanceof Error ? err.message : "连接失败",
      }));
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ connected: false, events: [], done: false, error: null });
  }, []);

  /** 从已保存的事件列表恢复（重连时用） */
  const hydrate = useCallback((savedEvents: WorkerEvent[]) => {
    abortRef.current?.abort();
    const lastEvent = savedEvents[savedEvents.length - 1];
    const isDone = lastEvent?.type === "worker.done" || lastEvent?.type === "worker.error";
    setState({
      connected: false,
      events: savedEvents.slice(-1000),
      done: isDone,
      error: null,
    });
  }, []);

  return { ...state, execute, cancel, reset, hydrate };
}
