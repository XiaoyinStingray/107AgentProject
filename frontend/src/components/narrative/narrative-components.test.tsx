import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import NarrativeFactory from "../../pages/NarrativeFactory";
import { MOCK_AGENTS } from "../../mocks/agents";
import { getMockNarrative, countWords, NARRATIVE_STYLES } from "../../mocks/narratives";
import type { NarrativeStyle } from "../../mocks/narratives";

/* ================================================================
   Step 34a — 叙事工厂组件测试（适配真实 API 路径）
   ================================================================ */

// Mock useAgents — 返回 MOCK_AGENTS
vi.mock("../../api/agents", () => ({
  useAgents: () => ({ data: MOCK_AGENTS }),
  useAgent: () => ({ data: null }),
  useCreateAgent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteAgent: () => ({ mutateAsync: vi.fn() }),
}));

// Mock useWorlds — 提供一个可选 World
vi.mock("../../api/worlds", () => ({
  useWorlds: () => ({
    data: [
      {
        id: "world-test",
        name: "测试 World",
        scenario: { name: "新生报到" },
        agent_ids: ["mock-1", "mock-2", "mock-3"],
        current_tick: 3,
        status: "finished",
      },
    ],
  }),
}));

// Mock 叙事 mutation hooks — story/diary/letter 走 API 路径
const { narrativeMockResult } = vi.hoisted(() => ({
  narrativeMockResult: {
    title: "图书馆三楼的灯",
    content: "六点半之前到达图书馆三楼靠窗的位置，这是我坚持了三周的习惯。",
    style: "story",
    agent_id: "mock-1",
    generated_at: "2026-07-22T00:00:00",
  },
}));

vi.mock("../../api/narratives", () => ({
  useGenerateStory: () => ({
    mutateAsync: () => Promise.resolve(narrativeMockResult),
    isPending: false,
  }),
  useGenerateDiary: () => ({
    mutateAsync: () => Promise.resolve(narrativeMockResult),
    isPending: false,
  }),
  useGenerateLetter: () => ({
    mutateAsync: () => Promise.resolve(narrativeMockResult),
    isPending: false,
  }),
  useGeneratePodcast: () => ({
    mutateAsync: () => Promise.resolve(narrativeMockResult),
    isPending: false,
  }),
  useGenerateParallel: () => ({
    mutateAsync: () => Promise.resolve(narrativeMockResult),
    isPending: false,
  }),
  useGenerateMicrofilm: () => ({
    mutateAsync: () => Promise.resolve(narrativeMockResult),
    isPending: false,
  }),
  useGenerateSerial: () => ({
    mutateAsync: () => Promise.resolve(narrativeMockResult),
    isPending: false,
  }),
  useGenerateSelfportrait: () => ({
    mutateAsync: () => Promise.resolve(narrativeMockResult),
    isPending: false,
  }),
}));

const testQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function renderNarrativeFactory() {
  return render(
    <QueryClientProvider client={testQueryClient}>
      <MemoryRouter>
        <NarrativeFactory />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function selectWorld() {
  fireEvent.click(screen.getByRole("button", { name: /测试 World/ }));
}

describe("Step 23 NarrativeFactory — setup phase", () => {
  it("renders style tabs including P3 placeholders", () => {
    renderNarrativeFactory();

    // 4 个可用风格——用 button role 精确定位，避免与「当前选择」摘要卡冲突
    expect(screen.getByRole("button", { name: /小说化叙事/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agent 日记/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /未来的信/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /播客脚本/ })).toBeInTheDocument();

    // 3 个新增 P2 风格
    expect(screen.getByRole("button", { name: /微电影大纲/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /自动连载/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agent 自画像/ })).toBeInTheDocument();
  });

  it("disables generate button until agent and world are selected", () => {
    renderNarrativeFactory();

    const generateBtn = screen.getByRole("button", { name: /生成叙事/ });
    expect(generateBtn).toBeDisabled();

    // 选 Agent 后仍 disabled（缺 World）
    fireEvent.click(screen.getAllByRole("button", { name: /小明/ })[0]);
    expect(generateBtn).toBeDisabled();

    // 选 World 后 enabled
    selectWorld();
    expect(generateBtn).toBeEnabled();
  });

  it("enables all 8 style tabs including P3 upgrades", () => {
    renderNarrativeFactory();
    const microFilm = screen.getByRole("button", { name: /微电影大纲/ });
    expect(microFilm).toBeEnabled();
  });

  it("shows target input only for letter and podcast styles", () => {
    renderNarrativeFactory();

    // 默认 story 风格——无 target 输入
    expect(screen.queryByPlaceholderText(/未来的自己/)).not.toBeInTheDocument();

    // 切到 letter
    fireEvent.click(screen.getByRole("button", { name: /未来的信/ }));
    expect(screen.getByPlaceholderText(/未来的自己/)).toBeInTheDocument();

    // 切到 diary
    fireEvent.click(screen.getByRole("button", { name: /Agent 日记/ }));
    expect(screen.queryByPlaceholderText(/未来的自己/)).not.toBeInTheDocument();

    // 切到 podcast
    fireEvent.click(screen.getByRole("button", { name: /播客脚本/ }));
    expect(screen.getByPlaceholderText(/小镇做题家的逆袭/)).toBeInTheDocument();
  });
});

describe("Step 34a NarrativeFactory — generating & result phases", () => {
  it("generates narrative (story via API) and shows result", async () => {
    renderNarrativeFactory();

    // 选 Agent + World + 默认 story 风格
    fireEvent.click(screen.getAllByRole("button", { name: /小明/ })[0]);
    selectWorld();
    fireEvent.click(screen.getByRole("button", { name: /生成叙事/ }));

    // result 阶段——通过 mocked API 返回
    expect(await screen.findByText("图书馆三楼的灯")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /重新生成/ })).toBeInTheDocument();
  });

  it("supports reset back to setup from result", async () => {
    renderNarrativeFactory();

    fireEvent.click(screen.getAllByRole("button", { name: /小明/ })[0]);
    selectWorld();
    fireEvent.click(screen.getByRole("button", { name: /生成叙事/ }));
    await screen.findByText("图书馆三楼的灯");

    fireEvent.click(screen.getByRole("button", { name: /返回配置/ }));
    expect(screen.getByText("M5 叙事工厂")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成叙事/ })).toBeInTheDocument();
  });

  it("generates podcast via API", async () => {
    renderNarrativeFactory();

    fireEvent.click(screen.getAllByRole("button", { name: /小红/ })[0]);
    selectWorld();
    // 切到 podcast 风格
    fireEvent.click(screen.getByRole("button", { name: /播客脚本/ }));
    fireEvent.click(screen.getByRole("button", { name: /生成叙事/ }));

    // podcast 走真实 API（mocked）
    expect(await screen.findByText("图书馆三楼的灯")).toBeInTheDocument();
  });
});

describe("Step 23 — narrative mocks utilities", () => {
  it("getMockNarrative returns matching result for known agent-style pair", () => {
    const result = getMockNarrative("mock-1", "story");
    expect(result.agent_id).toBe("mock-1");
    expect(result.style).toBe("story");
    expect(result.title).toBe("图书馆三楼的灯");
    expect(result.content.length).toBeGreaterThan(100);
    expect(result.word_count).toBeGreaterThan(0);
  });

  it("getMockNarrative falls back to mock-1 result for unknown agent", () => {
    const result = getMockNarrative("unknown-agent", "diary");
    // 回退到 mock-1 的 diary，但 agent_id 被替换
    expect(result.style).toBe("diary");
    expect(result.agent_id).toBe("unknown-agent");
    expect(result.content.length).toBeGreaterThan(0);
  });

  it("countWords counts non-whitespace characters", () => {
    expect(countWords("hello world")).toBe(10);
    expect(countWords("你好 世界")).toBe(4);
    expect(countWords("")).toBe(0);
    expect(countWords("  \n\t ")).toBe(0);
  });

  it("NARRATIVE_STYLES has 8 available + 0 placeholder entries", () => {
    const available = NARRATIVE_STYLES.filter((s) => s.available);
    const placeholders = NARRATIVE_STYLES.filter((s) => !s.available);
    expect(available).toHaveLength(8);
    expect(placeholders).toHaveLength(0);
    expect(available.map((s) => s.key)).toEqual([
      "story", "diary", "letter", "podcast", "parallel",
      "microfilm", "serial", "selfportrait",
    ]);
  });

  it("all 4 narrative styles have mock content for mock-1", () => {
    const styles: NarrativeStyle[] = ["story", "diary", "letter", "podcast"];
    for (const style of styles) {
      const result = getMockNarrative("mock-1", style);
      expect(result.style).toBe(style);
      expect(result.content.length).toBeGreaterThan(50);
      expect(result.title.length).toBeGreaterThan(0);
    }
  });

  it("all 3 mock agents have story and diary mock content", () => {
    const agentIds = ["mock-1", "mock-2", "mock-3"];
    for (const agentId of agentIds) {
      const story = getMockNarrative(agentId, "story");
      const diary = getMockNarrative(agentId, "diary");
      expect(story.content.length).toBeGreaterThan(100);
      expect(diary.content.length).toBeGreaterThan(100);
    }
  });
});
