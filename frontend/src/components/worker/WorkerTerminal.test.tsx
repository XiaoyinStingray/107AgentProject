import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { WorkerEvent } from "../../api/workers";
import WorkerTerminal from "./WorkerTerminal";

function event(type: WorkerEvent["type"], data: Record<string, unknown>): WorkerEvent {
  return { type, data, timestamp: "2026-08-18T13:52:07Z" };
}

describe("WorkerTerminal delivery failure", () => {
  it("shows recoverable audit failure instead of a completed delivery", () => {
    const onRevise = vi.fn();
    const events = [
      event("worker.started", {
        run_id: "run-test",
        agent_name: "岳书妍",
        task: "生成方案",
        workspace: "本地工作区",
      }),
      event("worker.error", {
        step_index: 6,
        error_type: "delivery_validation_failed",
        message: "交付验收未通过，final-proposal.md 未生成。",
        recoverable: true,
      }),
    ];

    render(
      <WorkerTerminal
        events={events}
        connected={false}
        done={true}
        fatalError={false}
        onRevise={onRevise}
      />,
    );

    expect(screen.getByText("需要处理")).toBeInTheDocument();
    expect(screen.getByText(/任务暂停，需要处理/)).toBeInTheDocument();
    expect(screen.queryByText(/交付物就绪/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("补充说明或让 Agent 继续当前任务…"), {
      target: { value: "材料已补充，请继续生成文件" },
    });
    fireEvent.click(screen.getByRole("button", { name: "继续" }));

    expect(onRevise).toHaveBeenCalledWith("材料已补充，请继续生成文件");
  });

  it("recognizes legacy audit failures that were incorrectly stored as done", () => {
    const events = [
      event("worker.started", {
        run_id: "run-legacy",
        agent_name: "岳书妍",
        task: "生成方案",
        workspace: "本地工作区",
      }),
      event("worker.done", {
        total_steps: 6,
        files: [],
        reason: "任务已完成（交付验收未通过：发现 11 个问题，已达到两轮自动修订上限）",
      }),
      event("worker.summary", {
        deliverable_summary: "任务完成。共执行 6 步，产生 0 个文件。",
      }),
    ];

    render(
      <WorkerTerminal
        events={events}
        connected={false}
        done={true}
        fatalError={false}
      />,
    );

    expect(screen.getByText("需要处理")).toBeInTheDocument();
    expect(screen.getByText(/任务暂停，需要处理/)).toBeInTheDocument();
    expect(screen.queryByText(/交付物就绪/)).not.toBeInTheDocument();
  });

  it("allows continuing a legacy JSON failure stored as unrecoverable", () => {
    const events = [
      event("worker.started", {
        run_id: "run-legacy-json",
        agent_name: "岳书妍",
        task: "生成方案",
        workspace: "本地工作区",
      }),
      event("worker.error", {
        step_index: 0,
        error_type: "json_parse_failure",
        message: "Agent 输出无法解析为 JSON",
        recoverable: false,
      }),
    ];

    render(
      <WorkerTerminal
        events={events}
        connected={false}
        done={true}
        fatalError={true}
      />,
    );

    expect(screen.getByText("需要处理")).toBeInTheDocument();
    expect(screen.getByText(/任务暂停，需要处理/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("补充说明或让 Agent 继续当前任务…")).toBeInTheDocument();
  });
});
