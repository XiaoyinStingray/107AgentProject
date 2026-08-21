import { describe, expect, it } from "vitest";

import { onlyRunningWorkers, toWorkerAgentSelectionId } from "./WorkerBench";

describe("WorkerBench Agent history restoration", () => {
  it("maps the persisted default worker to the built-in selector option", () => {
    expect(toWorkerAgentSelectionId("worker-default")).toBe("__builtin__");
  });

  it("keeps a persisted personalized Agent id unchanged", () => {
    expect(toWorkerAgentSelectionId("857471c1-12a0-4c50-af04-792845597c92"))
      .toBe("857471c1-12a0-4c50-af04-792845597c92");
  });

  it("does not treat finished history as a running Worker", () => {
    const workers = [
      { run_id: "old", task: "旧任务", agent_id: "old-agent", agent_name: "旧 Agent", running: false },
      { run_id: "active", task: "当前任务", agent_id: "new-agent", agent_name: "当前 Agent", running: true },
    ];

    expect(onlyRunningWorkers(workers).map((worker) => worker.run_id)).toEqual(["active"]);
  });
});
