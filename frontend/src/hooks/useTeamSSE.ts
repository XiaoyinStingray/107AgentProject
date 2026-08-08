/**
 * State 8: Team SSE hook — 连接 GET /api/teams/{team_id}/stream，
 * 将事件分发到 useTeamStore。
 */
import { useEffect, useRef } from "react";
import { useTeamStore } from "../stores/useTeamStore";
import type { TeamSSEEvent } from "../types/team";

export function useTeamSSE(teamId: string | null) {
  const store = useTeamStore();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!teamId) {
      store.reset();
      return;
    }

    const url = `/api/teams/${teamId}/stream`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      store.setConnected(true);
    };

    es.onmessage = (e) => {
      try {
        const event: TeamSSEEvent = JSON.parse(e.data);
        const { type, step_id, data } = event;

        switch (type) {
          case "plan_created":
            store.setPlanCreated(data as any);
            break;
          case "step.started": {
            if (step_id) store.setStepStatus(step_id, "running");
            break;
          }
          case "step.tool_start":
          case "step.tool_result":
          case "step.file_updated":
          case "step.thought":
          case "step.plan":
          case "step.reflection":
          case "step.summary":
            if (step_id) store.appendEvent(step_id, event);
            break;
          case "step.worker_done": {
            if (step_id) {
              const d = data as any;
              store.markStepDone(step_id, d.files ?? [], d.output_summary ?? "", d.steps_used ?? 0, d.duration_secs ?? 0);
            }
            break;
          }
          case "step.worker_error": {
            if (step_id) store.markStepError(step_id, (data as any).error ?? "未知错误");
            break;
          }
          case "role_evolved": {
            const evos = (data as any).evolutions;
            if (evos?.length) store.addEvolution(evos);
            break;
          }
          case "team_done":
            store.setTeamDone(data as any);
            break;
          case "team.error":
            store.setError((data as any).error ?? "执行出错");
            break;
          case "heartbeat":
            // no-op
            break;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      store.setConnected(false);
    };

    return () => {
      es.close();
      esRef.current = null;
      store.setConnected(false);
    };
  }, [teamId]);

  return {
    connected: store.connected,
    isRunning: store.isRunning,
    isDone: store.isDone,
    error: store.error,
    disconnect: () => {
      esRef.current?.close();
      esRef.current = null;
      store.reset();
    },
  };
}
