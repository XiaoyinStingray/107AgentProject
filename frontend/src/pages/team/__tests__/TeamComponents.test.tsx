/**
 * Team 子组件测试 — Step T1。
 * 覆盖: TaskKanban 三列渲染、LiveChat 消息渲染、HealthPanel 进度展示。
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeAll } from "vitest";
import TaskKanban from "../TaskKanban";
import LiveChat from "../LiveChat";
import HealthPanel from "../HealthPanel";
import type { PlanStep } from "../../../types/team";
import type { SSEEvent } from "../../../types/events";

// jsdom 不支持 scrollIntoView，需要 mock
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

// ── Mock Data ──────────────────────────────────────────

const MOCK_STEPS: PlanStep[] = [
  { id: "s1", title: "需求分析", assignee: "a1", description: "", status: "done", progress: 1.0, depends_on: [] },
  { id: "s2", title: "技术方案", assignee: "a2", description: "", status: "active", progress: 0.5, depends_on: [] },
  { id: "s3", title: "整合交付", assignee: null, description: "", status: "pending", progress: 0.0, depends_on: [] },
];

const AGENT_NAMES: Record<string, string> = {
  a1: "小红",
  a2: "小明",
};

// =====================================================================
// TaskKanban
// =====================================================================

describe("TaskKanban", () => {
  it("renders three columns", () => {
    render(<TaskKanban steps={MOCK_STEPS} agentNames={AGENT_NAMES} coordinatorMsg={null} />);
    expect(screen.getByText("TODO")).toBeInTheDocument();
    expect(screen.getByText("DOING")).toBeInTheDocument();
    expect(screen.getByText("DONE")).toBeInTheDocument();
  });

  it("shows step titles in correct columns", () => {
    render(<TaskKanban steps={MOCK_STEPS} agentNames={AGENT_NAMES} coordinatorMsg={null} />);
    // DONE column should have 需求分析
    expect(screen.getByText("需求分析")).toBeInTheDocument();
    // DOING column should have 技术方案
    expect(screen.getByText("技术方案")).toBeInTheDocument();
    // TODO column should have 整合交付
    expect(screen.getByText("整合交付")).toBeInTheDocument();
  });

  it("shows assignee names", () => {
    render(<TaskKanban steps={MOCK_STEPS} agentNames={AGENT_NAMES} coordinatorMsg={null} />);
    expect(screen.getByText("小红")).toBeInTheDocument();
    expect(screen.getByText("小明")).toBeInTheDocument();
  });

  it("shows progress percentage for active steps", () => {
    render(<TaskKanban steps={MOCK_STEPS} agentNames={AGENT_NAMES} coordinatorMsg={null} />);
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("shows coordinator message when present", () => {
    render(<TaskKanban steps={MOCK_STEPS} agentNames={AGENT_NAMES} coordinatorMsg="请注意进度" />);
    expect(screen.getByText("请注意进度")).toBeInTheDocument();
  });

  it("shows empty state for columns with no items", () => {
    const allDone: PlanStep[] = MOCK_STEPS.map(s => ({ ...s, status: "done" as const }));
    render(<TaskKanban steps={allDone} agentNames={AGENT_NAMES} coordinatorMsg={null} />);
    const emptyTexts = screen.getAllByText("暂无");
    expect(emptyTexts.length).toBeGreaterThanOrEqual(2); // TODO and DOING are empty
  });
});

// =====================================================================
// LiveChat
// =====================================================================

describe("LiveChat", () => {
  it("shows connection status", () => {
    render(<LiveChat events={[]} connected={true} isPaused={false} />);
    expect(screen.getByText("实时连接")).toBeInTheDocument();
  });

  it("shows disconnected status", () => {
    render(<LiveChat events={[]} connected={false} isPaused={false} />);
    expect(screen.getByText("连接断开")).toBeInTheDocument();
  });

  it("shows paused status", () => {
    render(<LiveChat events={[]} connected={false} isPaused={true} />);
    expect(screen.getByText("已暂停")).toBeInTheDocument();
  });

  it("shows message count", () => {
    render(<LiveChat events={[]} connected={true} isPaused={false} />);
    expect(screen.getByText("0 条消息")).toBeInTheDocument();
  });

  it("shows empty state when no messages", () => {
    render(<LiveChat events={[]} connected={true} isPaused={false} />);
    expect(screen.getByText("等待 Agent 开始对话…")).toBeInTheDocument();
  });

  it("filters out plan_updated and system events", () => {
    const events: SSEEvent[] = [
      { type: "plan_updated", tick: 1, content: "", id: "1" } as unknown as SSEEvent,
      { type: "connected", tick: 0, content: "", id: "2" } as unknown as SSEEvent,
    ];
    render(<LiveChat events={events} connected={true} isPaused={false} />);
    expect(screen.getByText("0 条消息")).toBeInTheDocument();
  });

  it("filters out plan_revised events from the chat display", () => {
    const events: SSEEvent[] = [
      { type: "plan_revised", tick: 2, content: "", id: "3", data: { old_title: "竞品分析", new_title: "快速竞品扫描" } } as unknown as SSEEvent,
      { type: "plan_updated", tick: 1, content: "", id: "4" } as unknown as SSEEvent,
      { type: "connected", tick: 0, content: "", id: "5" } as unknown as SSEEvent,
    ];
    render(<LiveChat events={events} connected={true} isPaused={false} />);
    expect(screen.getByText("0 条消息")).toBeInTheDocument();
  });
});

// =====================================================================
// HealthPanel
// =====================================================================

describe("HealthPanel", () => {
  it("shows progress bar and count", () => {
    render(
      <HealthPanel
        steps={MOCK_STEPS}
        progressPct={0.33}
        coordinatorMsg={null}
        reportReady={false}
        agentNames={AGENT_NAMES}
      />
    );
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("shows step list with status icons", () => {
    render(
      <HealthPanel
        steps={MOCK_STEPS}
        progressPct={0.33}
        coordinatorMsg={null}
        reportReady={false}
        agentNames={AGENT_NAMES}
      />
    );
    expect(screen.getByText("需求分析")).toBeInTheDocument();
    // "技术方案" 同时出现在步骤列表和当前阶段，用 getAllByText
    expect(screen.getAllByText("技术方案").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("整合交付")).toBeInTheDocument();
  });

  it("shows current active step", () => {
    render(
      <HealthPanel
        steps={MOCK_STEPS}
        progressPct={0.33}
        coordinatorMsg={null}
        reportReady={false}
        agentNames={AGENT_NAMES}
      />
    );
    expect(screen.getByText(/当前阶段/)).toBeInTheDocument();
    // "技术方案" 在步骤列表和当前阶段都出现
    const techSteps = screen.getAllByText("技术方案");
    expect(techSteps.length).toBeGreaterThanOrEqual(1);
  });

  it("shows coordinator message", () => {
    render(
      <HealthPanel
        steps={MOCK_STEPS}
        progressPct={0.5}
        coordinatorMsg="请加快进度"
        reportReady={false}
        agentNames={AGENT_NAMES}
      />
    );
    expect(screen.getByText("请加快进度")).toBeInTheDocument();
  });

  it("shows report ready notification", () => {
    render(
      <HealthPanel
        steps={MOCK_STEPS}
        progressPct={1.0}
        coordinatorMsg={null}
        reportReady={true}
        agentNames={AGENT_NAMES}
      />
    );
    expect(screen.getByText(/全部阶段完成/)).toBeInTheDocument();
  });
});
