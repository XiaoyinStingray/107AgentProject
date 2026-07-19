import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import NarrativeFactory from "../../pages/NarrativeFactory";
import { getMockNarrative, countWords, NARRATIVE_STYLES } from "../../mocks/narratives";
import type { NarrativeStyle } from "../../mocks/narratives";

/* ================================================================
   Step 23 — 叙事工厂组件测试
   Layer 1: 组件渲染 + 关键交互
   ================================================================ */

describe("Step 23 NarrativeFactory — setup phase", () => {
  it("renders style tabs including P3 placeholders", () => {
    render(<NarrativeFactory />);

    // 4 个可用风格——用 button role 精确定位，避免与「当前选择」摘要卡冲突
    expect(screen.getByRole("button", { name: /小说化叙事/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agent 日记/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /未来的信/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /播客脚本/ })).toBeInTheDocument();

    // 3 个 P3 占位
    expect(screen.getByRole("button", { name: /微电影大纲/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /自动连载/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agent 自画像/ })).toBeInTheDocument();
  });

  it("disables generate button until agent is selected", () => {
    render(<NarrativeFactory />);

    const generateBtn = screen.getByRole("button", { name: /生成叙事/ });
    expect(generateBtn).toBeDisabled();

    // 选第一个 Agent（小明）
    fireEvent.click(screen.getByRole("button", { name: /小明/ }));
    expect(generateBtn).toBeEnabled();
  });

  it("disables P3 placeholder style tabs", () => {
    render(<NarrativeFactory />);

    // P3 占位项应该是 disabled button
    const microFilm = screen.getByRole("button", { name: /微电影大纲/ });
    expect(microFilm).toBeDisabled();
  });

  it("shows target input only for letter and podcast styles", () => {
    render(<NarrativeFactory />);

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

describe("Step 23 NarrativeFactory — generating & result phases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates narrative after clicking generate and shows result", () => {
    render(<NarrativeFactory />);

    // 选 Agent + 默认 story 风格
    fireEvent.click(screen.getByRole("button", { name: /小明/ }));
    fireEvent.click(screen.getByRole("button", { name: /生成叙事/ }));

    // generating 阶段
    expect(screen.getByText(/正在生成/)).toBeInTheDocument();

    // 推进 2s
    act(() => vi.advanceTimersByTime(2000));

    // result 阶段——显示标题
    expect(screen.getByText("图书馆三楼的灯")).toBeInTheDocument();
    // 显示正文片段
    expect(screen.getByText(/六点半之前到达图书馆三楼/)).toBeInTheDocument();
    // 显示字数
    expect(screen.getByText(/字/)).toBeInTheDocument();
    // 显示重新生成按钮
    expect(screen.getByRole("button", { name: /重新生成/ })).toBeInTheDocument();
  });

  it("supports reset back to setup from result", () => {
    render(<NarrativeFactory />);

    fireEvent.click(screen.getByRole("button", { name: /小明/ }));
    fireEvent.click(screen.getByRole("button", { name: /生成叙事/ }));
    act(() => vi.advanceTimersByTime(2000));

    // 点击返回
    fireEvent.click(screen.getByRole("button", { name: /返回配置/ }));
    expect(screen.getByText("M5 叙事工厂")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /生成叙事/ })).toBeInTheDocument();
  });

  it("regenerates narrative when clicking regenerate button", () => {
    render(<NarrativeFactory />);

    fireEvent.click(screen.getByRole("button", { name: /小红/ }));
    // 切到 diary 风格
    fireEvent.click(screen.getByRole("button", { name: /Agent 日记/ }));
    fireEvent.click(screen.getByRole("button", { name: /生成叙事/ }));
    act(() => vi.advanceTimersByTime(2000));

    // 应显示小红的日记
    expect(screen.getByText(/2026 年 7 月 19 日/)).toBeInTheDocument();
    expect(screen.getByText(/淋雨的感觉其实挺好/)).toBeInTheDocument();

    // 重新生成
    fireEvent.click(screen.getByRole("button", { name: /重新生成/ }));
    expect(screen.getByText(/正在生成/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText(/淋雨的感觉其实挺好/)).toBeInTheDocument();
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

  it("NARRATIVE_STYLES has 4 available + 3 placeholder entries", () => {
    const available = NARRATIVE_STYLES.filter((s) => s.available);
    const placeholders = NARRATIVE_STYLES.filter((s) => !s.available);
    expect(available).toHaveLength(4);
    expect(placeholders).toHaveLength(3);
    expect(available.map((s) => s.key)).toEqual([
      "story",
      "diary",
      "letter",
      "podcast",
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
