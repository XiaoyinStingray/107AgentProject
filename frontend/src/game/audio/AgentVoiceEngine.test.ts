import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentVoiceEngine } from "./AgentVoiceEngine";

describe("AgentVoiceEngine silent playback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("reconstructs long text exactly after punctuation-aware pagination", async () => {
    const engine = new AgentVoiceEngine("agent-a");
    const original =
      "第一段需要完整显示，而且不能丢失标点。第二段继续测试分页，最后一段也要保留。";
    const pages: string[] = [];
    const onComplete = vi.fn();

    void engine.speak(original, "happy", 0, {
      onPageText: (text) => pages.push(text),
      onComplete,
    });
    await vi.runAllTimersAsync();

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join("")).toBe(original);
    expect(pages.every((page) => page.length <= 18)).toBe(true);
    expect(onComplete).toHaveBeenCalledOnce();
  });

  it("does not complete an aborted silent message", async () => {
    const engine = new AgentVoiceEngine("agent-a");
    const onComplete = vi.fn();
    const pages: string[] = [];

    void engine.speak(
      "这是一条需要分页的很长消息，用于确认中断后不会继续播放下一页。",
      "neutral",
      0,
      {
        onPageText: (text) => pages.push(text),
        onComplete,
      },
    );
    expect(pages).toHaveLength(1);

    engine.abort();
    await vi.runAllTimersAsync();

    expect(onComplete).not.toHaveBeenCalled();
    expect(pages).toHaveLength(1);
  });

  it("keeps the speak promise pending until silent playback completes", async () => {
    const engine = new AgentVoiceEngine("agent-a");
    let settled = false;

    const playback = engine
      .speak("一条需要等待显示时间的消息。", "neutral", 0, {
        onPageText: vi.fn(),
        onComplete: vi.fn(),
      })
      .then(() => {
        settled = true;
      });

    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.runAllTimersAsync();
    await playback;
    expect(settled).toBe(true);
  });
});
