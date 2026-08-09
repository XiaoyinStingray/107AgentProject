import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Archive from "../../pages/Archive";
import { MOCK_AGENTS } from "../../mocks/agents";
import {
  ARCHIVE_TABS,
  MOCK_REPLAYS,
  MOCK_TEMPLATES,
  MOCK_ACHIEVEMENTS,
  MOCK_ACHIEVEMENT_SUMMARY,
  formatReplayStatus,
  replayStatusColor,
  formatArchiveTime,
  generateMockReport,
  downloadAsFile,
} from "../../mocks/archive";
import { MOCK_SANDBOX_SCENARIOS } from "../../mocks/sandbox";

const { clientGet } = vi.hoisted(() => ({ clientGet: vi.fn() }));

vi.mock("../../api/client", () => ({
  client: { get: clientGet },
}));

/* ================================================================
   Step 45 — M8 档案馆组件测试
   Layer 1: 组件渲染 + 关键交互（真实 API hooks Mock）
   Layer 2: Mock 工具函数
   ================================================================ */

// Mock useAgents + useWorlds — Archive 内部子组件调用这些 hooks
vi.mock("../../api/agents", () => ({
  useAgents: () => ({ data: MOCK_AGENTS }),
  useAgent: () => ({ data: null }),
  useCreateAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAgent: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("../../api/worlds", () => ({
  useWorlds: () => ({ data: [] }),
  useWorld: () => ({ data: null }),
}));

// Step 45: HighlightsPanel 用 useSimulations 替代 MOCK_REPLAYS
vi.mock("../../api/simulations", () => ({
  useSimulations: () => ({
    data: [
      {
        id: "replay-1", world_id: "world-1",
        started_at: "2026-07-19T10:00:00Z", ended_at: null,
        total_ticks: 20, status: "finished",
        world_name: "新生报到", agent_count: 3, event_count: 47,
      },
      {
        id: "replay-2", world_id: "world-2",
        started_at: "2026-07-19T14:30:00Z", ended_at: null,
        total_ticks: 15, status: "finished",
        world_name: "期末周", agent_count: 2, event_count: 32,
      },
      {
        id: "replay-3", world_id: "world-3",
        started_at: "2026-07-19T16:00:00Z", ended_at: null,
        total_ticks: 8, status: "paused",
        world_name: "毕业选择", agent_count: 1, event_count: 12,
      },
    ],
    isLoading: false,
  }),
  useSimulation: () => ({ data: null }),
}));

// Step 45: TemplatesPanel 用 useScenarios 替代 MOCK_TEMPLATES
vi.mock("../../api/scenarios", () => ({
  useScenarios: () => ({
    data: MOCK_SANDBOX_SCENARIOS.map((sc) => ({
      id: sc.name ?? "unknown",
      name: sc.name,
      description: sc.description,
      time_range: sc.time_range,
      initial_events: sc.initial_events ?? [],
      environment_params: sc.environment_params ?? {},
    })),
    isLoading: false,
  }),
}));

// Step 45: AchievementsPanel 用 useAchievements 真实 API
vi.mock("../../api/achievements", () => ({
  useAchievements: () => ({
    data: {
      achievements: MOCK_ACHIEVEMENTS,
      summary: MOCK_ACHIEVEMENT_SUMMARY,
    },
    isLoading: false,
  }),
}));

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderArchive(initialEntry = "/archive") {
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Archive />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  clientGet.mockReset();
  clientGet.mockResolvedValue([]);
});

/** 辅助：渲染 Archive 并点击指定 Tab */
function renderAndClickTab(tabLabel: string) {
  renderArchive();
  const tabEl = screen.getByText(tabLabel);
  act(() => { fireEvent.click(tabEl); });
  return tabEl;
}

/* ---------- Layer 1: 组件渲染 + 交互 ---------- */

describe("Step 45 Archive — Tab 栏与切换", () => {
  it("renders title and all 7 tabs (4 available + 3 P3)", () => {
    renderArchive();
    expect(screen.getByText("M8 Agent 档案馆")).toBeInTheDocument();
    // 4 个可用 Tab
    expect(screen.getByText("精彩回放")).toBeInTheDocument();
    expect(screen.getByText("实验模板")).toBeInTheDocument();
    expect(screen.getByText("成就系统")).toBeInTheDocument();
    expect(screen.getByText("研究报告导出")).toBeInTheDocument();
  });

  it("defaults to highlights tab", () => {
    renderArchive();
    // 精彩回放面板默认显示——来自 useSimulations mock
    expect(screen.getByText("新生报到")).toBeInTheDocument();
    expect(screen.getByText("期末周")).toBeInTheDocument();
  });

  it("switches to templates tab", () => {
    renderAndClickTab("实验模板");
    // 每个模板有 "🎭 单人" + "👥 多人" 两个按钮
    expect(screen.getAllByText("🎭 单人").length).toBe(3);
    expect(screen.getAllByText("👥 多人").length).toBe(3);
  });

  it("switches to achievements tab", () => {
    renderAndClickTab("成就系统");
    expect(screen.getByText("造物主")).toBeInTheDocument();
    expect(screen.getByText(/成就.*3\/10/)).toBeInTheDocument();
  });

  it("switches to export tab", () => {
    renderAndClickTab("研究报告导出");
    expect(screen.getByText("选择 Agent")).toBeInTheDocument();
  });

});

describe("Step 45 Archive — 精彩回放面板", () => {
  it("renders all replay cards", () => {
    renderArchive();
    expect(screen.getByText("新生报到")).toBeInTheDocument();
    expect(screen.getByText("期末周")).toBeInTheDocument();
    expect(screen.getByText("毕业选择")).toBeInTheDocument();
    // 2 个已完成 + 1 个已暂停（status "finished" → "已完成"）
    expect(screen.getAllByText("已完成").length).toBe(2);
    expect(screen.getByText("已暂停")).toBeInTheDocument();
  });

  it("shows agent count and scenario info in replay cards", () => {
    renderArchive();
    // Step 45: 面板显示 Agent 数量而非逐个名字
    expect(screen.getByText("👥 3 Agent")).toBeInTheDocument();
    expect(screen.getByText("👥 2 Agent")).toBeInTheDocument();
    expect(screen.getByText("👥 1 Agent")).toBeInTheDocument();
  });

  it("shows tick and event counts", () => {
    renderArchive();
    expect(screen.getByText("⏱ 20 Tick")).toBeInTheDocument();
    expect(screen.getByText("📋 47 事件")).toBeInTheDocument();
  });

  it("auto-opens the replay requested by M2", async () => {
    clientGet.mockResolvedValueOnce([
      {
        id: "event-1",
        world_id: "world-2",
        tick: 3,
        type: "thought_stream",
        source_agent_id: "agent-1",
        target_agent_ids: [],
        description: "正在复盘期末周的决定",
        data: { agent_name: "陈墨" },
        created_at: "2026-08-10T00:00:00Z",
      },
    ]);

    renderArchive("/archive?replay=world-2");

    await waitFor(() =>
      expect(clientGet).toHaveBeenCalledWith(
        "/worlds/world-2/events?tick_from=0",
      ),
    );
    expect(
      await screen.findByRole("button", { name: "🔼 收起回放" }),
    ).toBeInTheDocument();
    expect(screen.getByText("正在复盘期末周的决定")).toBeInTheDocument();
  });
});

describe("Step 45 Archive — 实验模板面板", () => {
  it("renders 3 template cards from scenarios", () => {
    renderAndClickTab("实验模板");
    expect(screen.getAllByText(/实验模板/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("新生报到")).toBeInTheDocument();
    expect(screen.getByText("期末周")).toBeInTheDocument();
    expect(screen.getByText("毕业选择")).toBeInTheDocument();
  });

  it("shows tags for each template", () => {
    renderAndClickTab("实验模板");
    // 从场景名推断标签，新生报到→社交/初始关系/低压
    expect(screen.getByText("社交")).toBeInTheDocument();
    expect(screen.getByText("竞争")).toBeInTheDocument();
    expect(screen.getByText("人生转折")).toBeInTheDocument();
  });

  it("shows suggested agents and ticks", () => {
    renderAndClickTab("实验模板");
    // 新生报到 → 3 Agent, 期末周 → 2 Agent
    expect(screen.getByText("👥 3 Agent")).toBeInTheDocument();
    expect(screen.getByText("⏱ 1-30 Tick")).toBeInTheDocument();
  });

  it("renders single/multi buttons for each template", () => {
    renderAndClickTab("实验模板");
    expect(screen.getAllByText("🎭 单人").length).toBe(3);
    expect(screen.getAllByText("👥 多人").length).toBe(3);
  });
});

describe("Step 45 Archive — 成就系统面板", () => {
  it("renders summary cards", () => {
    renderAndClickTab("成就系统");
    expect(screen.getByText("Agent 数").parentElement).toHaveTextContent("3");
    expect(screen.getByText("模拟次数").parentElement).toHaveTextContent("3");
    expect(screen.getByText("总 Tick").parentElement).toHaveTextContent("43");
    expect(screen.getByText("叙事数").parentElement).toHaveTextContent("6");
  });

  it("renders all achievements", () => {
    renderAndClickTab("成就系统");
    expect(screen.getByText("造物主")).toBeInTheDocument();
    expect(screen.getByText("全能选手")).toBeInTheDocument();
    expect(screen.getByText(/成就.*3\/10/)).toBeInTheDocument();
  });

  it("shows unlocked status for completed achievements", () => {
    renderAndClickTab("成就系统");
    expect(screen.getAllByText("✅ 已解锁").length).toBe(3);
  });

  it("shows progress percentage for locked achievements", () => {
    renderAndClickTab("成就系统");
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("43%")).toBeInTheDocument();
  });
});

describe("Step 45 Archive — 研究报告导出面板", () => {
  it("renders agent selection", () => {
    renderAndClickTab("研究报告导出");
    expect(screen.getByText("选择 Agent")).toBeInTheDocument();
    expect(screen.getAllByText("小明").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("小红").length).toBeGreaterThanOrEqual(1);
  });

  it("renders format selection", () => {
    renderAndClickTab("研究报告导出");
    expect(screen.getByText("📝 Markdown")).toBeInTheDocument();
    expect(screen.getByText("📋 JSON")).toBeInTheDocument();
  });

  it("export button is disabled when no agent selected", () => {
    renderAndClickTab("研究报告导出");
    const btn = screen.getByRole("button", { name: /导出报告/ });
    expect(btn).toBeDisabled();
  });

  it("export button enables after selecting agent", () => {
    renderAndClickTab("研究报告导出");
    // 找到包含"小明"文本的按钮（Agent 选择卡片）
    const mingBtn = screen.getAllByText("小明").find(el => el.closest("button"));
    expect(mingBtn).toBeTruthy();
    act(() => { fireEvent.click(mingBtn!.closest("button")!); });
    const btn = screen.getByRole("button", { name: /导出报告/ });
    expect(btn).not.toBeDisabled();
  });

  it("can switch format to JSON", () => {
    renderAndClickTab("研究报告导出");
    act(() => { fireEvent.click(screen.getByText("📋 JSON")); });
    expect(screen.getByText("📋 JSON")).toBeInTheDocument();
  });
});

/* ---------- Layer 2: Mock 工具函数 ---------- */

describe("Step 45 Archive — 工具函数", () => {
  it("formatReplayStatus returns correct labels", () => {
    expect(formatReplayStatus("completed")).toBe("已完成");
    expect(formatReplayStatus("paused")).toBe("已暂停");
    expect(formatReplayStatus("running")).toBe("运行中");
  });

  it("replayStatusColor returns correct classes", () => {
    expect(replayStatusColor("completed")).toContain("accent-green");
    expect(replayStatusColor("paused")).toContain("accent-orange");
    expect(replayStatusColor("running")).toContain("accent-blue");
  });

  it("formatArchiveTime formats ISO date", () => {
    const result = formatArchiveTime("2026-07-19T14:30:00Z");
    expect(result).toMatch(/07-19|07-20/);
  });

  it("generateMockReport contains agent name", () => {
    const report = generateMockReport("小明");
    expect(report).toContain("小明");
    expect(report).toContain("实验报告");
  });

  it("downloadAsFile creates and clicks anchor", () => {
    const createObjectURLSpy = vi.fn(() => "blob:mock-url");
    const revokeObjectURLSpy = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL: createObjectURLSpy,
      revokeObjectURL: revokeObjectURLSpy,
    });

    const clickSpy = vi.fn();
    const createElementSpy = vi.spyOn(document, "createElement").mockReturnValue({
      href: "", download: "", click: clickSpy,
    } as unknown as HTMLAnchorElement);
    const appendChildSpy = vi.spyOn(document.body, "appendChild").mockImplementation((n) => n);
    const removeChildSpy = vi.spyOn(document.body, "removeChild").mockImplementation((n) => n);

    downloadAsFile("test content", "test.md");
    expect(clickSpy).toHaveBeenCalled();
    expect(createObjectURLSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("ARCHIVE_TABS has 4 available items", () => {
    expect(ARCHIVE_TABS.length).toBe(4);
    expect(ARCHIVE_TABS.filter((t) => t.available).length).toBe(4);
  });

  it("MOCK_REPLAYS has 3 records", () => {
    expect(MOCK_REPLAYS.length).toBe(3);
    expect(MOCK_REPLAYS[0].scenarioName).toBe("新生报到");
  });

  it("MOCK_TEMPLATES has 3 templates", () => {
    expect(MOCK_TEMPLATES.length).toBe(3);
    expect(MOCK_TEMPLATES[0].name).toBe("新生报到");
  });

  it("MOCK_ACHIEVEMENTS has 10 achievements with 3 unlocked", () => {
    expect(MOCK_ACHIEVEMENTS.length).toBe(10);
    expect(MOCK_ACHIEVEMENTS.filter((a) => a.unlocked).length).toBe(3);
  });

  it("MOCK_ACHIEVEMENT_SUMMARY has correct values", () => {
    expect(MOCK_ACHIEVEMENT_SUMMARY.totalAgents).toBe(3);
    expect(MOCK_ACHIEVEMENT_SUMMARY.totalTicks).toBe(43);
  });
});
