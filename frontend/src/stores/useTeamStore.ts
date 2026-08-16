/**
 * State 8: Team SSE 事件缓冲 + 步骤状态 Zustand store。
 */
import { create } from "zustand";
import type { StepState, StepStatus, TeamSSEEvent, RoleEvolution, TeamDoneData, TeamPlanCreated, TeamOutcome } from "../types/team";

interface TeamStore {
  // Plan
  planId: string | null;
  task: string;
  totalSteps: number;
  planSteps: TeamPlanCreated["steps"];

  // Steps
  steps: Record<string, StepState>;
  stepOrder: string[];

  // Role evolution
  evolutions: RoleEvolution[];

  // Final report
  report: TeamDoneData["report"] | null;
  workspaceRoot: string;
  outcome: TeamOutcome | null;
  completedSteps: number;
  failedSteps: number;

  // Status
  connected: boolean;
  isRunning: boolean;
  isDone: boolean;
  error: string | null;

  // Actions
  setPlanCreated: (data: TeamPlanCreated) => void;
  setStepStatus: (stepId: string, status: StepStatus) => void;
  appendEvent: (stepId: string, event: TeamSSEEvent) => void;
  markStepDone: (stepId: string, files: string[], summary: string, stepsUsed: number, durationSecs: number) => void;
  markStepError: (stepId: string, error: string) => void;
  addEvolution: (evolutions: RoleEvolution[]) => void;
  setTeamDone: (data: TeamDoneData) => void;
  setError: (error: string) => void;
  setConnected: (c: boolean) => void;
  reset: () => void;
}

function makeInitialStep(id: string, title: string, assigneeId: string | null, assigneeName: string, index: number, total: number): StepState {
  return {
    id,
    title,
    assigneeId,
    assigneeName,
    status: "pending",
    stepIndex: index,
    totalSteps: total,
    files: [],
    outputSummary: "",
    stepsUsed: 0,
    durationSecs: null,
    error: null,
    events: [],
  };
}

const initialState = {
  planId: null,
  task: "",
  totalSteps: 0,
  planSteps: [],
  steps: {},
  stepOrder: [],
  evolutions: [],
  report: null,
  workspaceRoot: "",
  outcome: null,
  completedSteps: 0,
  failedSteps: 0,
  connected: false,
  isRunning: false,
  isDone: false,
  error: null,
};

export const useTeamStore = create<TeamStore>((set, get) => ({
  ...initialState,

  setPlanCreated: (data: TeamPlanCreated) => {
    const steps: Record<string, StepState> = {};
    const order: string[] = [];
    data.steps.forEach((s, i) => {
      steps[s.id] = makeInitialStep(s.id, s.title, s.assignee_id, s.assignee_name, i, data.total_steps);
      order.push(s.id);
    });
    set({
      planId: data.plan_id,
      task: data.task,
      totalSteps: data.total_steps,
      planSteps: data.steps,
      steps,
      stepOrder: order,
      isRunning: true,
      isDone: false,
      outcome: null,
      completedSteps: 0,
      failedSteps: 0,
      error: null,
    });
  },

  setStepStatus: (stepId: string, status: StepStatus) => {
    const steps = { ...get().steps };
    if (steps[stepId]) {
      steps[stepId] = { ...steps[stepId], status };
    }
    set({ steps });
  },

  appendEvent: (stepId: string, event: TeamSSEEvent) => {
    const steps = { ...get().steps };
    if (steps[stepId]) {
      steps[stepId] = {
        ...steps[stepId],
        events: [...steps[stepId].events, event],
      };
    }
    set({ steps });
  },

  markStepDone: (stepId, files, summary, stepsUsed, durationSecs) => {
    const steps = { ...get().steps };
    if (steps[stepId]) {
      steps[stepId] = {
        ...steps[stepId],
        status: "done",
        files,
        outputSummary: summary,
        stepsUsed,
        durationSecs,
      };
    }
    set({ steps });
  },

  markStepError: (stepId, error) => {
    const steps = { ...get().steps };
    if (steps[stepId]) {
      steps[stepId] = { ...steps[stepId], status: "error", error };
    }
    set({ steps });
  },

  addEvolution: (evolutions) => {
    const existing = get().evolutions;
    const seen = new Set(existing.map((e) => `${e.agent_id}|${e.step_title}`));
    const fresh = evolutions.filter((e) => !seen.has(`${e.agent_id}|${e.step_title || ""}`));
    if (fresh.length > 0) {
      set({ evolutions: [...existing, ...fresh] });
    }
  },

  setTeamDone: (data) => {
    const steps = { ...get().steps };
    data.steps.forEach((s) => {
      const stepId = Object.keys(steps).find((k) => steps[k].title === s.step_title);
      if (stepId && !steps[stepId].files.length) {
        steps[stepId] = { ...steps[stepId], files: s.files, durationSecs: s.duration_secs };
      }
    });
    const failedSteps = data.failed_steps ?? data.steps.filter((step) => !step.success).length;
    const outcome = data.outcome ?? (
      failedSteps > 0
        ? (data.total_steps_completed > 0 ? "partial" : "failed")
        : "success"
    );
    set({
      steps,
      report: data.report,
      workspaceRoot: data.workspace_root,
      outcome,
      completedSteps: data.total_steps_completed,
      failedSteps,
      isRunning: false,
      isDone: true,
    });
  },

  setError: (error) => set({ error, isRunning: false }),
  setConnected: (connected) => set({ connected }),
  reset: () => set(initialState),
}));
