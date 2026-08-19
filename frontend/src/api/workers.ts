/**
 * Worker API — AgentWorker 前端 API 层。
 *
 * 使用 fetch + ReadableStream 消费 SSE（POST 请求不能用 EventSource）。
 */

import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

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

export interface WorkerDecisionStep {
  step_index: number;
  action: string;
  reason: string;
  tool_name: string;
  result_summary: string;
  timestamp: string;
}

export interface WorkerForkOption {
  title: string;
  decision: string;
  rationale: string;
}

export interface WorkerForkRequest {
  fork_point_step: number;
  alternative_decision: string;
}

export interface WorkerDecisionLog {
  run_id: string;
  running: boolean;
  agent_id: string;
  agent_name: string;
  needs_agent_binding: boolean;
  decisions: WorkerDecisionStep[];
}

async function readApiError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return String(payload?.detail || payload?.message || response.statusText);
  } catch {
    return text || response.statusText;
  }
}

export async function getWorkerDecisionLog(runId: string): Promise<WorkerDecisionLog> {
  const response = await fetch(`/api/workers/${runId}/decisions`);
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json();
  return {
    run_id: String(payload?.run_id || runId),
    running: Boolean(payload?.running),
    agent_id: String(payload?.agent_id || ""),
    agent_name: String(payload?.agent_name || "?"),
    needs_agent_binding: Boolean(payload?.needs_agent_binding ?? !payload?.agent_id),
    decisions: Array.isArray(payload?.decisions) ? payload.decisions : [],
  };
}

export async function bindWorkerAgent(runId: string, agentId: string) {
  const response = await fetch(`/api/workers/${runId}/bind-agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  return response.json() as Promise<{
    run_id: string;
    agent_id: string;
    agent_name: string;
    bound: boolean;
  }>;
}

export async function generateWorkerForkOptions(
  runId: string,
  forkPointStep: number,
): Promise<WorkerForkOption[]> {
  const response = await fetch(`/api/workers/${runId}/fork-options`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fork_point_step: forkPointStep }),
  });
  if (!response.ok) throw new Error(await readApiError(response));
  const payload = await response.json();
  return Array.isArray(payload?.options) ? payload.options : [];
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
  const eventsRef = useRef<WorkerEvent[]>([]);
  eventsRef.current = state.events;

  const consume = useCallback(async (
    url: string,
    body: Record<string, unknown>,
    initialEvents: WorkerEvent[] = [],
  ) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      connected: true,
      events: initialEvents,
      done: false,
      error: null,
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const message = await readApiError(response);
        setState((prev) => ({ ...prev, connected: false, error: message }));
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

  const execute = useCallback(async (req: WorkerExecuteRequest) => {
    // 中止任何已有的连接（包括 resubscribe 的 SSE 流）
    abortRef.current?.abort();
    const initialEvents = req.reuse_run_id
      ? [...eventsRef.current, {
          type: "worker.started" as WorkerEventType,
          data: { run_id: req.reuse_run_id, agent_name: "", task: `--- 追加: ${req.task.slice(0, 60)} ---`, workspace: "" },
          timestamp: new Date().toISOString(),
        }]
      : [];
    await consume("/api/workers/execute", req as unknown as Record<string, unknown>, initialEvents);
  }, [consume]);

  const fork = useCallback(async (runId: string, req: WorkerForkRequest) => {
    await consume(
      `/api/workers/${runId}/fork`,
      req as unknown as Record<string, unknown>,
    );
  }, [consume]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setState({ connected: false, events: [], done: false, error: null });
  }, []);

  /** 从已保存的事件列表恢复（重连/查看历史时用，不中断当前 SSE 连接） */
  const hydrate = useCallback((savedEvents: WorkerEvent[]) => {
    const lastEvent = savedEvents[savedEvents.length - 1];
    const isDone = lastEvent?.type === "worker.done" || lastEvent?.type === "worker.error";
    setState({
      connected: false,
      events: savedEvents.slice(-1000),
      done: isDone,
      error: null,
    });
  }, []);

  /** 重新订阅运行中 Worker 的 SSE 事件流（页面切换后恢复用） */
  const resubscribe = useCallback(async (runId: string, fromIndex: number) => {
    const controller = new AbortController();
    abortRef.current = controller;

    setState((prev) => ({ ...prev, connected: true }));

    try {
      const response = await fetch(
        `/api/workers/${runId}/events/stream?from_index=${fromIndex}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        setState((prev) => ({ ...prev, connected: false }));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setState((prev) => ({ ...prev, connected: false }));
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
                  events: newEvents.slice(-1000),
                  done: isDone,
                  error:
                    event.type === "worker.error"
                      ? String(event.data?.message || "未知错误")
                      : prev.error,
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
        error: err instanceof Error ? err.message : "重连失败",
      }));
    }
  }, []);

  return { ...state, execute, fork, cancel, reset, hydrate, resubscribe };
}

// =============================================================================
// useWorkerHistory — Step 100a: 获取所有 Worker 历史记录
// =============================================================================

export interface WorkerHistoryEntry {
  run_id: string;
  agent_name: string;
  task: string;
  state: string;
  steps: number;
  files: Array<{ path: string; size: number }>;
  created_at: string;
}

export function useWorkerHistory() {
  return useQuery<WorkerHistoryEntry[]>({
    queryKey: ["worker-history"],
    queryFn: async () => {
      const res = await fetch("/api/workers/history");
      if (!res.ok) throw new Error("Failed to fetch worker history");
      return res.json();
    },
    refetchInterval: 10000, // 10 秒刷新
  });
}
