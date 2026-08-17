import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AudioControls from "./AudioControls";
import CheckpointPanel from "./CheckpointPanel";

const queueMocks = vi.hoisted(() => ({
  setEnabled: vi.fn(),
  setMuted: vi.fn(),
  setVolume: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
}));

vi.mock("../../game/audio/DialoguePlaybackQueue", () => ({
  playbackQueue: queueMocks,
}));

describe("CheckpointPanel", () => {
  it("only allows save, load and delete while paused", () => {
    const onSave = vi.fn();
    const onLoad = vi.fn();
    const onDelete = vi.fn();
    const onTogglePause = vi.fn();
    const checkpoint = {
      id: "checkpoint-1",
      name: "课间状态",
      created_at: "2026-07-30T12:00:00Z",
    };

    const { rerender } = render(
      <CheckpointPanel
        checkpoints={[checkpoint]}
        count={1}
        max={30}
        paused={false}
        onSave={onSave}
        onLoad={onLoad}
        onDelete={onDelete}
        onTogglePause={onTogglePause}
      />,
    );

    expect(screen.queryByPlaceholderText("存档名称…")).toBeNull();
    expect(screen.queryByRole("button", { name: "加载" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "⏸ 暂停场景" }));
    expect(onTogglePause).toHaveBeenCalledOnce();

    rerender(
      <CheckpointPanel
        checkpoints={[checkpoint]}
        count={1}
        max={30}
        paused
        onSave={onSave}
        onLoad={onLoad}
        onDelete={onDelete}
        onTogglePause={onTogglePause}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("存档名称…"), {
      target: { value: "  手动存档  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存 (1/30)" }));
    fireEvent.click(screen.getByRole("button", { name: "加载" }));
    fireEvent.click(screen.getByRole("button", { name: "删" }));

    expect(onSave).toHaveBeenCalledWith("手动存档");
    expect(onLoad).toHaveBeenCalledWith("checkpoint-1");
    expect(onDelete).toHaveBeenCalledWith("checkpoint-1");
  });

  it("disables saving at the per-scene limit", () => {
    render(
      <CheckpointPanel
        checkpoints={[]}
        count={30}
        max={30}
        paused
        onSave={vi.fn()}
        onLoad={vi.fn()}
        onDelete={vi.fn()}
        onTogglePause={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole("button", { name: "保存 (30/30)" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("AudioControls", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.values(queueMocks).forEach((mock) => mock.mockReset());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("restores persisted mute and volume settings", async () => {
    localStorage.setItem("m11_audio_muted", "true");
    localStorage.setItem("m11_audio_volume", "0.4");

    render(<AudioControls />);

    await waitFor(() => {
      expect(queueMocks.setMuted).toHaveBeenCalledWith(true);
      expect(queueMocks.setVolume).toHaveBeenCalledWith(0.4);
    });
  });

  it("enables Web Audio only after an explicit user action", () => {
    const context = { state: "running" };
    const AudioContextMock = vi.fn(() => context);
    vi.stubGlobal("AudioContext", AudioContextMock);

    render(<AudioControls />);
    expect(queueMocks.setEnabled).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "🔊 启用声音" }));

    expect(AudioContextMock).toHaveBeenCalledOnce();
    expect(queueMocks.setEnabled).toHaveBeenCalledWith(true, context);
    expect(localStorage.getItem("m11_audio_enabled")).toBe("true");
  });

  it("removes its visibility listener when unmounted", () => {
    const context = { state: "running", close: vi.fn() };
    vi.stubGlobal("AudioContext", vi.fn(() => context));
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const view = render(<AudioControls />);

    fireEvent.click(screen.getByRole("button", { name: "🔊 启用声音" }));
    const visibilityRegistration = addSpy.mock.calls.find(
      ([eventName]) => eventName === "visibilitychange",
    );
    expect(visibilityRegistration).toBeDefined();

    view.unmount();

    expect(removeSpy).toHaveBeenCalledWith(
      "visibilitychange",
      visibilityRegistration?.[1],
    );
    expect(queueMocks.setEnabled).toHaveBeenLastCalledWith(false, null);
    expect(context.close).toHaveBeenCalledOnce();
  });
});
