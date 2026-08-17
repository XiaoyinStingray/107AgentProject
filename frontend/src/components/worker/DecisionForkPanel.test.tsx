import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import DecisionForkPanel from "./DecisionForkPanel";


const decisions = [
  {
    step_index: 1,
    action: "tool_call",
    reason: "先搜索资料",
    tool_name: "web_search",
    result_summary: "",
    timestamp: "2026-08-17T10:00:00",
  },
  {
    step_index: 2,
    action: "tool_call",
    reason: "整理成报告",
    tool_name: "write_file",
    result_summary: "",
    timestamp: "2026-08-17T10:01:00",
  },
];

const options = [
  { title: "先验证", decision: "先交叉核验来源，再写报告", rationale: "更稳妥" },
  { title: "先成稿", decision: "先写最小版本，再补证据", rationale: "更快" },
  { title: "做对照", decision: "并行整理正反两组证据", rationale: "更全面" },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DecisionForkPanel", () => {
  it("opens from the branches anchor and starts the chosen alternative", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/decisions")) {
        return new Response(JSON.stringify({
          run_id: "run-original",
          agent_id: "agent-yue",
          agent_name: "岳书妍",
          needs_agent_binding: false,
          decisions,
        }), { status: 200 });
      }
      if (url.endsWith("/fork-options")) {
        return new Response(JSON.stringify({ options }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onFork = vi.fn();

    render(
      <MemoryRouter
        initialEntries={["/worker#branches"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <DecisionForkPanel
          runs={[{
            run_id: "run-original",
            agent_name: "岳书妍",
            task: "整理高数复习方案",
            running: false,
          }]}
          currentRunId="run-original"
          connected={false}
          currentAgentId="agent-yue"
          currentAgentName="岳书妍"
          onSelectRun={vi.fn()}
          onFork={onFork}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /决策分叉/ })).toHaveAttribute("aria-expanded", "true");
    await screen.findByText("先搜索资料");
    fireEvent.click(screen.getByRole("button", { name: /生成 3 条候选路线/ }));
    await screen.findByText("先成稿");
    fireEvent.click(screen.getByRole("button", { name: /先成稿/ }));
    fireEvent.click(screen.getByRole("button", { name: /从 Step 1 分叉执行/ }));

    expect(onFork).toHaveBeenCalledWith("run-original", 1, "先写最小版本，再补证据");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("binds a legacy history to the explicitly selected same-name Agent", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/decisions")) {
        return new Response(JSON.stringify({
          run_id: "run-legacy",
          agent_id: "",
          agent_name: "岳书言",
          needs_agent_binding: true,
          decisions,
        }), { status: 200 });
      }
      if (url.endsWith("/bind-agent")) {
        expect(JSON.parse(String(init?.body))).toEqual({ agent_id: "agent-yueshuyan" });
        return new Response(JSON.stringify({
          run_id: "run-legacy",
          agent_id: "agent-yueshuyan",
          agent_name: "岳书言",
          bound: true,
        }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter
        initialEntries={["/worker#branches"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <DecisionForkPanel
          runs={[{
            run_id: "run-legacy",
            agent_name: "岳书言",
            task: "旧版学习任务",
            running: false,
          }]}
          currentRunId="run-legacy"
          connected={false}
          currentAgentId="agent-yueshuyan"
          currentAgentName="岳书言"
          onSelectRun={vi.fn()}
          onFork={vi.fn()}
        />
      </MemoryRouter>,
    );

    const bindButton = await screen.findByRole("button", { name: "绑定到 岳书言" });
    fireEvent.click(bindButton);
    await screen.findByText("已绑定到 岳书言，现在可以生成候选路线");
    expect(screen.getByRole("button", { name: /生成 3 条候选路线/ })).toBeEnabled();
  });
});
