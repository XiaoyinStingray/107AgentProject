import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BrainDisconnectWatchdog,
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
});
