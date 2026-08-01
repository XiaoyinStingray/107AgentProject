import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrainDisconnectWatchdog,
  BrainWhisperTracker,
  getBrainButtonState,
} from "./sceneBrain";

describe("scene Brain helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("explains each disabled Brain state", () => {
    expect(getBrainButtonState(0, false, false)).toEqual({
      disabled: true,
      label: "OFF",
      title: "请先向当前场景投放至少一个 Agent",
    });
    expect(getBrainButtonState(2, true, false)).toEqual({
      disabled: true,
      label: "⏳",
      title: "正在连接 AI 世界",
    });
    expect(getBrainButtonState(2, false, true).disabled).toBe(false);
  });

  it("reports a connection that stays unavailable", () => {
    vi.useFakeTimers();
    const disconnected = vi.fn();
    const watchdog = new BrainDisconnectWatchdog(disconnected, 100);

    watchdog.reportError({ readyState: 0 });
    vi.advanceTimersByTime(100);

    expect(disconnected).toHaveBeenCalledOnce();
  });

  it("cancels stale disconnect work after reconnect or disposal", () => {
    vi.useFakeTimers();
    const disconnected = vi.fn();
    const watchdog = new BrainDisconnectWatchdog(disconnected, 100);

    watchdog.reportError({ readyState: 2 });
    watchdog.markOpen();
    vi.advanceTimersByTime(100);
    watchdog.reportError({ readyState: 2 });
    watchdog.dispose();
    vi.advanceTimersByTime(100);

    expect(disconnected).not.toHaveBeenCalled();
  });

  it("tracks an instructed actor followed by the named target", () => {
    vi.useFakeTimers();
    const feedback = vi.fn();
    const tracker = new BrainWhisperTracker(feedback, 100);

    tracker.start({
      actorId: "a",
      actorName: "苏敏",
      targetId: "b",
      targetName: "陈墨",
    });
    expect(feedback).toHaveBeenLastCalledWith(
      "a",
      "耳语执行中：等待 苏敏 发言",
    );

    expect(tracker.recordSpeaker("c")).toBe(false);
    expect(tracker.recordSpeaker("a")).toBe(true);
    expect(feedback).toHaveBeenLastCalledWith(
      "a",
      "耳语已执行：苏敏 已发言，等待 陈墨 回应",
    );

    expect(tracker.recordSpeaker("b")).toBe(true);
    expect(feedback).toHaveBeenLastCalledWith(
      "a",
      "耳语执行完成：陈墨 已回应",
    );
    vi.advanceTimersByTime(100);
    expect(feedback).toHaveBeenCalledTimes(3);
  });

  it("pauses its deadline and reports a visible timeout after resume", () => {
    vi.useFakeTimers();
    const feedback = vi.fn();
    const tracker = new BrainWhisperTracker(feedback, 100);

    tracker.start({ actorId: "a", actorName: "苏敏" }, true);
    vi.advanceTimersByTime(200);
    expect(feedback).toHaveBeenCalledOnce();

    tracker.setPaused(false);
    vi.advanceTimersByTime(100);
    expect(feedback).toHaveBeenLastCalledWith(
      "a",
      "耳语执行超时：苏敏 未产生可见发言",
    );
  });
});
