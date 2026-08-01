import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QueuedMessage } from "./DialoguePlaybackQueue";

const voiceMock = vi.hoisted(() => {
  interface Callbacks {
    onPageText: (text: string, isFirstPage: boolean) => void;
    onComplete: () => void;
  }

  class MockVoiceEngine {
    static instances: MockVoiceEngine[] = [];
    readonly speak = vi.fn();
    readonly pause = vi.fn();
    readonly resume = vi.fn();
    readonly abort = vi.fn();
    readonly setAudioContext = vi.fn();
    callbacks: Callbacks | null = null;

    constructor(readonly agentId: string) {
      MockVoiceEngine.instances.push(this);
      this.speak.mockImplementation(
        (
          _text: string,
          _emotion: string,
          _volume: number,
          callbacks: Callbacks,
        ) => {
          this.callbacks = callbacks;
          callbacks.onPageText(_text, true);
          return new Promise<void>(() => undefined);
        },
      );
    }
  }

  return { MockVoiceEngine };
});

vi.mock("./AgentVoiceEngine", () => ({
  AgentVoiceEngine: voiceMock.MockVoiceEngine,
}));

import { DialoguePlaybackQueue } from "./DialoguePlaybackQueue";

function message(agentId: string, text: string): QueuedMessage {
  return {
    agentId,
    name: agentId,
    text,
    emotion: "neutral",
    onBubble: vi.fn(),
    onDone: vi.fn(),
  };
}

describe("DialoguePlaybackQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    voiceMock.MockVoiceEngine.instances.length = 0;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("plays messages strictly in enqueue order", async () => {
    const queue = new DialoguePlaybackQueue();
    const first = message("agent-a", "第一条");
    const second = message("agent-b", "第二条");

    queue.enqueue(first);
    queue.enqueue(second);

    expect(voiceMock.MockVoiceEngine.instances).toHaveLength(1);
    expect(first.onBubble).toHaveBeenCalledWith("第一条", "agent-a", true);
    expect(second.onBubble).not.toHaveBeenCalled();

    voiceMock.MockVoiceEngine.instances[0].callbacks?.onComplete();
    await vi.advanceTimersByTimeAsync(100);

    expect(first.onDone).toHaveBeenCalledOnce();
    expect(voiceMock.MockVoiceEngine.instances).toHaveLength(2);
    expect(second.onBubble).toHaveBeenCalledWith("第二条", "agent-b", true);
  });

  it("does not start the next message merely because playback resumes", () => {
    const queue = new DialoguePlaybackQueue();
    const first = message("agent-a", "第一条");
    const second = message("agent-b", "第二条");

    queue.enqueue(first);
    queue.enqueue(second);
    queue.pause();
    queue.resume();

    expect(voiceMock.MockVoiceEngine.instances[0].pause).toHaveBeenCalledOnce();
    expect(voiceMock.MockVoiceEngine.instances[0].resume).toHaveBeenCalledOnce();
    expect(voiceMock.MockVoiceEngine.instances).toHaveLength(1);
    expect(second.onBubble).not.toHaveBeenCalled();
  });

  it("keeps a late message queued when pause happens while idle", () => {
    const queue = new DialoguePlaybackQueue();
    const late = message("agent-a", "暂停后返回的消息");

    queue.pause();
    queue.enqueue(late);

    expect(voiceMock.MockVoiceEngine.instances).toHaveLength(0);
    expect(late.onBubble).not.toHaveBeenCalled();

    queue.resume();

    expect(voiceMock.MockVoiceEngine.instances).toHaveLength(1);
    expect(late.onBubble).toHaveBeenCalledWith(
      "暂停后返回的消息",
      "agent-a",
      true,
    );
  });

  it("returns to idle when an empty paused queue resumes", () => {
    const queue = new DialoguePlaybackQueue();
    const later = message("agent-a", "恢复后加入");

    queue.pause();
    queue.resume();
    queue.enqueue(later);

    expect(later.onBubble).toHaveBeenCalledWith(
      "恢复后加入",
      "agent-a",
      true,
    );
  });

  it("clears pending messages and aborts the active engine", async () => {
    const queue = new DialoguePlaybackQueue();
    const first = message("agent-a", "第一条");
    const second = message("agent-b", "第二条");

    queue.enqueue(first);
    queue.enqueue(second);
    queue.clear();

    expect(voiceMock.MockVoiceEngine.instances[0].abort).toHaveBeenCalledOnce();
    voiceMock.MockVoiceEngine.instances[0].callbacks?.onComplete();
    await vi.advanceTimersByTimeAsync(200);
    expect(second.onBubble).not.toHaveBeenCalled();
  });

  it("clamps and persists user volume and mute settings", () => {
    const queue = new DialoguePlaybackQueue();

    queue.setVolume(2);
    queue.setMuted(true);

    expect(queue.getVolume()).toBe(1);
    expect(queue.isMuted()).toBe(true);
    expect(localStorage.getItem("m11_audio_volume")).toBe("1");
    expect(localStorage.getItem("m11_audio_muted")).toBe("true");
  });
});
