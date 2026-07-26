import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SSEEvent } from "../../types/events";
import ThoughtStream from "./ThoughtStream";

function makeEvents(count: number): SSEEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `event-${index}`,
    type: "agent_message",
    agent_id: `agent-${index % 2}`,
    agent_name: `Agent ${index % 2}`,
    tick: index,
    message: `窗口事件 ${index}`,
  }));
}

describe("Step 47 ThoughtStream windowing", () => {
  it("renders every event when the list has at most 200 items", () => {
    const { container } = render(
      <ThoughtStream events={makeEvents(200)} />,
    );

    expect(screen.getByText("窗口事件 0")).toBeInTheDocument();
    expect(screen.getByText("窗口事件 199")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-slide-in")).toHaveLength(200);
    expect(
      screen.queryByRole("button", { name: "查看更早记录" }),
    ).not.toBeInTheDocument();
  });

  it("keeps only 200 bubbles mounted and can reveal older records", () => {
    const { container } = render(
      <ThoughtStream events={makeEvents(201)} />,
    );

    expect(screen.queryByText("窗口事件 0")).not.toBeInTheDocument();
    expect(screen.getByText("窗口事件 200")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-slide-in")).toHaveLength(200);

    fireEvent.click(screen.getByRole("button", { name: "查看更早记录" }));

    expect(screen.getByText("窗口事件 0")).toBeInTheDocument();
    expect(screen.queryByText("窗口事件 200")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-slide-in")).toHaveLength(200);
  });

  it("does not jump to new events while the user browses older records", async () => {
    const { rerender } = render(
      <ThoughtStream events={makeEvents(500)} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "查看更早记录" }));

    rerender(<ThoughtStream events={makeEvents(501)} />);

    await waitFor(() => {
      expect(screen.queryByText("窗口事件 500")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "↓ 回到最新" }));

    await waitFor(() => {
      expect(screen.getByText("窗口事件 500")).toBeInTheDocument();
    });
  });

  it("preserves event click interaction inside the window", () => {
    const onEventClick = vi.fn();
    const events = makeEvents(201);
    render(
      <ThoughtStream events={events} onEventClick={onEventClick} />,
    );

    fireEvent.click(screen.getByText("窗口事件 200"));

    expect(onEventClick).toHaveBeenCalledWith(events[200]);
  });

  it("renders the existing empty state", () => {
    render(<ThoughtStream events={[]} />);

    expect(screen.getByText(/等待事件/)).toBeInTheDocument();
  });
});
