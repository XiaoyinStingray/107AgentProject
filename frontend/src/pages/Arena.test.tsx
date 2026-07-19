import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Link, MemoryRouter } from "react-router-dom";
import App from "../App";
import { MOCK_AGENTS } from "../mocks/agents";
import { ARENA_MODE_OPTIONS } from "../mocks/arena";
import { useAgentStore } from "../stores/useAgentStore";
import Arena from "./Arena";

const TRANSCRIPT_INTERVAL_MS = 800;
const JUDGE_DELAY_MS = 1200;

function renderArena(initialEntry = "/arena") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Arena />
    </MemoryRouter>,
  );
}

function renderArenaWithNavigation(initialEntry = "/arena") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Link to="/arena#item-23">前往大乱斗</Link>
      <Link to="/arena#item-22">返回 1v1</Link>
      <Arena />
    </MemoryRouter>,
  );
}

function advanceMatchToResult() {
  for (let index = 0; index < 7; index += 1) {
    act(() => vi.advanceTimersByTime(TRANSCRIPT_INTERVAL_MS));
  }
  act(() => vi.advanceTimersByTime(JUDGE_DELAY_MS));
}

beforeEach(() => {
  useAgentStore.setState({ agents: [] });
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Step 22 Arena page state", () => {
  it("renders valid defaults and keeps mode and topic controlled", () => {
    renderArena();

    expect(
      screen.getByRole("heading", { name: "1v1 Agent 对抗" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("AGENT A")).toHaveValue(MOCK_AGENTS[0]!.id);
    expect(screen.getByLabelText("AGENT B")).toHaveValue(MOCK_AGENTS[1]!.id);
    expect(
      screen.getByRole("button", { name: "开始 1v1 竞技" }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /面试竞争/ }));
    const interview = ARENA_MODE_OPTIONS.find(
      (option) => option.value === "interview",
    )!;
    expect(screen.getByLabelText("竞技主题")).toHaveValue(
      interview.default_topic,
    );

    fireEvent.change(screen.getByLabelText("竞技主题"), {
      target: { value: "   " },
    });
    expect(
      screen.getByRole("button", { name: "开始 1v1 竞技" }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText("竞技主题"), {
      target: { value: "定制面试主题" },
    });
    expect(
      screen.getByRole("button", { name: "开始 1v1 竞技" }),
    ).toBeEnabled();
  });

  it("includes Agents created in the Step 17 store", () => {
    const createdAgent = {
      ...MOCK_AGENTS[0]!,
      id: "created-arena-agent",
      name: "竞技新人",
      persona: {
        ...MOCK_AGENTS[0]!.persona,
        name: "竞技新人",
      },
    };
    useAgentStore.setState({ agents: [createdAgent] });

    renderArena();
    expect(
      screen.getAllByRole("option", { name: /竞技新人/ }),
    ).toHaveLength(2);
  });

  it("plays six entries, shows the result, resets, and starts cleanly again", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderArena();
    const originalTopic = screen.getByLabelText("竞技主题").getAttribute("value");

    fireEvent.click(screen.getByRole("button", { name: "开始 1v1 竞技" }));
    expect(screen.getByText("0 条发言")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(TRANSCRIPT_INTERVAL_MS));
    expect(screen.getByText("1 条发言")).toBeInTheDocument();

    for (let index = 0; index < 5; index += 1) {
      act(() => vi.advanceTimersByTime(TRANSCRIPT_INTERVAL_MS));
    }
    expect(screen.getByText("6 条发言")).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(TRANSCRIPT_INTERVAL_MS));
    expect(screen.getByText("裁判正在汇总四项评分…")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(JUDGE_DELAY_MS));
    expect(screen.getByText(/胜者 ·/)).toBeInTheDocument();
    expect(screen.getByText("裁判理由")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "返回设置" }));
    expect(
      screen.getByRole("heading", { name: "1v1 Agent 对抗" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("竞技主题")).toHaveValue(originalTopic);

    fireEvent.click(screen.getByRole("button", { name: "开始 1v1 竞技" }));
    expect(screen.getByText("0 条发言")).toBeInTheDocument();
  });

  it.each([
    ["面试竞争", "interview", MOCK_AGENTS[1]!.name, "32", "36"],
    ["创业路演", "pitch", MOCK_AGENTS[0]!.name, "37", "34"],
  ])(
    "completes the %s UI flow with its own result",
    (buttonName, mode, winnerName, agentAScore, agentBScore) => {
      vi.useFakeTimers();
      renderArena();

      fireEvent.click(screen.getByRole("button", { name: new RegExp(buttonName) }));
      const option = ARENA_MODE_OPTIONS.find((item) => item.value === mode)!;
      expect(screen.getByLabelText("竞技主题")).toHaveValue(option.default_topic);
      fireEvent.click(screen.getByRole("button", { name: "开始 1v1 竞技" }));
      advanceMatchToResult();

      expect(screen.getByText(`胜者 · ${winnerName}`)).toBeInTheDocument();
      expect(screen.getByText(agentAScore)).toBeInTheDocument();
      expect(screen.getByText(agentBScore)).toBeInTheDocument();
    },
  );
});

describe("Step 22 Arena hash behavior", () => {
  it.each([
    [23, "大乱斗", "P3"],
    [24, "战报生成", "P2"],
    [25, "盲测模式", "P3"],
    [26, "复盘对比", "P2"],
    [27, "排行榜", "P3"],
    [28, "A/B 测试", "P3"],
  ])("keeps item-%i as the %s %s placeholder", (id, label, priority) => {
    renderArena(`/arena#item-${id}`);
    expect(screen.getByText(new RegExp(label))).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${priority} —`))).toBeInTheDocument();
    expect(
      screen.getByText("当前保留菜单入口，不在 Step 22 实现真实逻辑。"),
    ).toBeInTheDocument();
  });

  it("cleans a running match when navigating away from item-22", () => {
    vi.useFakeTimers();
    renderArenaWithNavigation();

    fireEvent.click(screen.getByRole("button", { name: "开始 1v1 竞技" }));
    act(() => vi.advanceTimersByTime(TRANSCRIPT_INTERVAL_MS));
    expect(screen.getByText("1 条发言")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "前往大乱斗" }));
    expect(
      screen.getByRole("heading", { name: /大乱斗/ }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(TRANSCRIPT_INTERVAL_MS * 10));
    expect(screen.queryByText(/胜者 ·/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("link", { name: "返回 1v1" }));
    expect(
      screen.getByRole("heading", { name: "1v1 Agent 对抗" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("1 条发言")).not.toBeInTheDocument();
  });

  it("does not display a different module for a foreign hash", () => {
    renderArena("/arena#item-29");
    expect(screen.getByText("竞技场功能不存在")).toBeInTheDocument();
    expect(screen.queryByText("小说化叙事")).not.toBeInTheDocument();
  });
});

describe("Step 16 Arena route regression", () => {
  it.each([
    ["/", "人生实验室 · Life Lab"],
    ["/agents", "M1 铸造厂"],
    ["/theater", "M2 单人剧场"],
    ["/sandbox", "群体投放"],
    ["/narratives", "M5 叙事工厂"],
  ])("keeps the existing %s route mounted", (path, heading) => {
    window.history.pushState({}, "", path);
    render(<App />);
    expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("mounts the Step 22 page through App at /arena", () => {
    window.history.pushState({}, "", "/arena#item-22");
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "1v1 Agent 对抗" }),
    ).toBeInTheDocument();
  });
});
