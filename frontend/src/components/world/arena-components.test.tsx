import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Arena from "../../pages/Arena";

/** 找到正方/反方的 Agent 选择卡片容器 */
function getSelectorCard(label: "正方" | "反方"): HTMLElement {
  const headings = screen.getAllByRole("heading");
  const h = headings.find((el) => el.textContent?.includes(label));
  if (!h) throw new Error(`找不到${label}选择器`);
  // Card 组件是 h2 的父级 div
  return h.closest("div")!;
}

describe("Step 22 Arena", () => {
  it("renders setup phase with mode tabs and start button", () => {
    render(<Arena />);

    expect(screen.getByText("M4 竞技场")).toBeInTheDocument();
    expect(screen.getByText("辩论赛")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /开始对决/ })).toBeDisabled();
  });

  it("enables start when two different agents and topic selected", () => {
    render(<Arena />);

    // 正方选小明
    fireEvent.click(within(getSelectorCard("正方")).getByText("小明"));
    // 反方选小刚
    fireEvent.click(within(getSelectorCard("反方")).getByText("小刚"));

    expect(screen.getByRole("button", { name: /开始对决/ })).not.toBeDisabled();
  });

  it("completes setup → debating → judging → result flow", () => {
    vi.useFakeTimers();
    render(<Arena />);

    fireEvent.click(within(getSelectorCard("正方")).getByText("小明"));
    fireEvent.click(within(getSelectorCard("反方")).getByText("小刚"));

    // 开始
    fireEvent.click(screen.getByRole("button", { name: /开始对决/ }));
    // 辩论阶段 — 应看到辩题
    expect(screen.getByText("辩论赛")).toBeInTheDocument();
    expect(screen.getByText(/期末该不该熬夜复习/)).toBeInTheDocument();

    // 逐轮推进（6 条对话 × 1800ms）
    for (let i = 0; i < 6; i++) {
      act(() => vi.advanceTimersByTime(1800));
    }
    // 裁判评分 1500ms
    act(() => vi.advanceTimersByTime(1500));
    // 进入结果页
    expect(screen.getByText(/获胜/)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("shows score bars, judge reasoning, and transcript in result", () => {
    vi.useFakeTimers();
    render(<Arena />);

    fireEvent.click(within(getSelectorCard("正方")).getByText("小明"));
    fireEvent.click(within(getSelectorCard("反方")).getByText("小刚"));
    fireEvent.click(screen.getByRole("button", { name: /开始对决/ }));
    // 推进完辩论和裁判
    for (let i = 0; i < 6; i++) act(() => vi.advanceTimersByTime(1800));
    act(() => vi.advanceTimersByTime(1500));

    // 结果页 — 裁判和对话卡（各出现一次）
    expect(screen.getByText(/裁判评语/)).toBeInTheDocument();
    expect(screen.getByText(/对话记录/)).toBeInTheDocument();
    // 分数维度 — 双方各一份，共 2 个
    expect(screen.getAllByText(/论点质量/)).toHaveLength(2);
    expect(screen.getAllByText(/表达能力/)).toHaveLength(2);
    expect(screen.getAllByText(/应变能力/)).toHaveLength(2);
    expect(screen.getAllByText(/人设一致/)).toHaveLength(2);

    vi.useRealTimers();
  });
});
