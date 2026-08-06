import { beforeEach, describe, expect, it, vi } from "vitest";

const dialogueMocks = vi.hoisted(() => ({
  fetchDialogue: vi.fn(),
}));

const playbackMocks = vi.hoisted(() => ({
  clear: vi.fn(),
}));

const emotionMocks = vi.hoisted(() => ({
  onDialogue: vi.fn(),
}));

vi.mock("phaser", () => ({
  default: {
    Scene: class {},
    Geom: { Circle: class { static Contains = vi.fn(); } },
    Math: { Between: vi.fn(() => 0) },
  },
}));

vi.mock("../dialogue", () => ({
  fetchDialogue: dialogueMocks.fetchDialogue,
  getDialogue: vi.fn(),
}));

vi.mock("../sprites/AgentSprite", () => ({ AgentSprite: class {} }));
vi.mock("../AutonomousMover", () => ({ AutonomousMover: class {} }));
vi.mock("../emotion/EmotionEngine", () => ({
  emotionEngine: {
    onDialogue: emotionMocks.onDialogue,
    onEmotionChange: vi.fn(),
    onRandomEvent: vi.fn(),
    setScene: vi.fn(),
    stop: vi.fn(),
    start: vi.fn(),
    registerAgent: vi.fn(),
    onProximityCheck: vi.fn(),
  },
  RANDOM_EVENTS: [],
}));
vi.mock("../audio/DialoguePlaybackQueue", () => ({
  playbackQueue: {
    clear: playbackMocks.clear,
    enqueue: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
  },
}));

import { MapScene } from "./MapScene";

function makeAgent(agentId: string, name: string, tileX: number, tileY: number) {
  return {
    agentId,
    tileX,
    tileY,
    emotion: "neutral",
    getData: vi.fn((key: string) => key === "name" ? name : undefined),
    setAction: vi.fn(),
    setTile: vi.fn(),
  };
}

function makeBaseScene() {
  const actor = makeAgent("agent-a", "苏敏", 1, 1);
  const target = makeAgent("agent-b", "林毅", 5, 5);
  const scene = Object.create(MapScene.prototype) as any;
  Object.assign(scene, {
    _brainEnabled: false,
    paused: false,
    mapData: { id: "library" },
    agentSprites: new Map([
      [actor.agentId, actor],
      [target.agentId, target],
    ]),
    movers: new Map(),
    pendingWhispers: new Map(),
    activeSessions: new Map(),
    busyAgents: new Set(),
    dialogueCooldowns: new Map(),
    movementReservations: new Map(),
    localCommandTimers: new Map(),
    activeBubbles: new Set(),
    activeUserMessageBubbles: new Set(),
    userMessageGeneration: 0,
    showAgentBubble: vi.fn(),
    scene: { isActive: vi.fn(() => true) },
  });
  return { scene, actor, target };
}

describe("MapScene structured BRAIN OFF commands", () => {
  beforeEach(() => {
    dialogueMocks.fetchDialogue.mockReset();
    playbackMocks.clear.mockReset();
    emotionMocks.onDialogue.mockReset();
  });

  it("rejects structured commands while BRAIN is ON", () => {
    const { scene } = makeBaseScene();
    scene._brainEnabled = true;

    expect(scene.executeLocalCommand({
      type: "observe",
      actorAgentId: "agent-a",
    })).toBe(false);
    expect(scene.showAgentBubble).toHaveBeenCalledWith(
      "agent-a",
      "请先关闭 AI 驱动",
    );
  });

  it("rejects direct local messages while BRAIN is ON", async () => {
    const { scene } = makeBaseScene();
    scene._brainEnabled = true;
    scene.showUserMessageBubble = vi.fn();

    await expect(
      scene.receiveUserMessage("agent-a", "你好"),
    ).resolves.toBe(false);
    expect(scene.showUserMessageBubble).not.toHaveBeenCalled();
  });

  it("does not enqueue an OFF reply after switching BRAIN ON", async () => {
    const { scene } = makeBaseScene();
    scene.clearQueuedAgentCommand = vi.fn();
    scene.cancelLocalConversationSessions = vi.fn();
    scene.queueDialogue = vi.fn();
    let finishUserBubble = () => {};
    scene.showUserMessageBubble = vi.fn(
      (_agentId: string, _message: string, onComplete: () => void) => {
        finishUserBubble = onComplete;
      },
    );

    await scene.receiveUserMessage("agent-a", "你今天心情怎么样？");
    scene.onBrainToggle(true);
    finishUserBubble();

    expect(scene._brainEnabled).toBe(true);
    expect(scene.userMessageGeneration).toBe(1);
    expect(scene.queueDialogue).not.toHaveBeenCalled();
  });

  it("starts talk in place with the exact user-authored opening line", () => {
    const { scene, actor, target } = makeBaseScene();
    scene.clearQueuedAgentCommand = vi.fn();
    scene.cancelLocalConversationSessions = vi.fn();
    scene.startConversationSession = vi.fn();
    scene.moveAgentNear = vi.fn();

    expect(scene.executeLocalCommand({
      type: "talk",
      actorAgentId: "agent-a",
      targetAgentId: "agent-b",
      message: "  你好，今天过得怎么样？  ",
    })).toBe(true);

    expect(scene.moveAgentNear).not.toHaveBeenCalled();
    expect(scene.startConversationSession).toHaveBeenCalledWith(
      actor,
      target,
      8,
      [],
      { speakerId: "agent-a", targetName: "林毅" },
      "你好，今天过得怎么样？",
    );
  });

  it("queues move-then-talk until the actor reaches an adjacent tile", () => {
    const { scene } = makeBaseScene();
    scene.clearQueuedAgentCommand = vi.fn();
    scene.cancelLocalConversationSessions = vi.fn();
    scene.moveAgentNear = vi.fn(() => true);

    expect(scene.executeLocalCommand({
      type: "move_then_talk",
      actorAgentId: "agent-a",
      targetAgentId: "agent-b",
      message: "  我们去图书馆吧。  ",
    })).toBe(true);

    expect(scene.pendingWhispers.get("agent-a")).toEqual(expect.objectContaining({
      targetAgentId: "agent-b",
      openingLine: "我们去图书馆吧。",
      requiresAdjacency: true,
    }));
    expect(scene.moveAgentNear).toHaveBeenCalledWith("agent-a", "agent-b");
  });

  it("shows a silent user bubble before one local Agent reply", async () => {
    const { scene } = makeBaseScene();
    scene.clearQueuedAgentCommand = vi.fn();
    scene.cancelLocalConversationSessions = vi.fn();
    let finishUserBubble = () => {};
    scene.showUserMessageBubble = vi.fn(
      (_agentId: string, _message: string, onComplete: () => void) => {
        finishUserBubble = onComplete;
      },
    );
    scene.queueDialogue = vi.fn();

    await expect(
      scene.receiveUserMessage("agent-a", "你今天心情怎么样？"),
    ).resolves.toBe(true);
    expect(scene.showUserMessageBubble).toHaveBeenCalledWith(
      "agent-a",
      "你今天心情怎么样？",
      expect.any(Function),
    );
    expect(dialogueMocks.fetchDialogue).not.toHaveBeenCalled();
    expect(scene.queueDialogue).not.toHaveBeenCalled();

    finishUserBubble();
    expect(scene.queueDialogue).toHaveBeenCalledWith(
      "agent-a",
      "我现在挺平静的，正在慢慢适应这里。",
      "neutral",
    );
  });

  it("does not force an Agent reply when no local intent matches", async () => {
    const { scene } = makeBaseScene();
    scene.clearQueuedAgentCommand = vi.fn();
    scene.cancelLocalConversationSessions = vi.fn();
    scene.showUserMessageBubble = vi.fn(
      (_agentId: string, _message: string, onComplete: () => void) => onComplete(),
    );
    scene.queueDialogue = vi.fn();

    await expect(
      scene.receiveUserMessage("agent-a", "量子纠缠为什么不能传递信息？"),
    ).resolves.toBe(true);
    expect(scene.showUserMessageBubble).toHaveBeenCalledOnce();
    expect(dialogueMocks.fetchDialogue).not.toHaveBeenCalled();
    expect(scene.queueDialogue).not.toHaveBeenCalled();
  });

  it("stops an Agent for ten seconds and then resumes movement", () => {
    const { scene, actor } = makeBaseScene();
    const mover = { stop: vi.fn(), start: vi.fn() };
    const timer = { destroy: vi.fn() };
    let finishWait = () => {};
    scene.movers.set("agent-a", mover);
    scene.time = {
      delayedCall: vi.fn((_delay: number, callback: () => void) => {
        finishWait = callback;
        return timer;
      }),
    };
    scene.clearQueuedAgentCommand = vi.fn();
    scene.cancelLocalConversationSessions = vi.fn();

    expect(scene.executeLocalCommand({ type: "wait", actorAgentId: "agent-a" })).toBe(true);
    expect(mover.stop).toHaveBeenCalledOnce();
    expect(actor.setAction).toHaveBeenCalledWith("idle");
    expect(scene.time.delayedCall).toHaveBeenCalledWith(10_000, expect.any(Function));
    expect(scene.localCommandTimers.get("agent-a")).toBe(timer);

    finishWait();
    expect(mover.start).toHaveBeenCalledOnce();
    expect(scene.localCommandTimers.has("agent-a")).toBe(false);
  });

  it("ends an active dialogue and clears its playback", () => {
    const { scene, actor, target } = makeBaseScene();
    scene.activeSessions.set("agent-a|agent-b", { a: actor, b: target });
    scene.cancelLocalConversationSessions = vi.fn();

    expect(scene.executeLocalCommand({
      type: "end_dialogue",
      actorAgentId: "agent-a",
    })).toBe(true);
    expect(scene.cancelLocalConversationSessions).toHaveBeenCalledWith(false);
    expect(playbackMocks.clear).toHaveBeenCalledOnce();
  });

  it("cancels pending movement, timers, and local dialogue state", () => {
    const { scene, actor } = makeBaseScene();
    const timer = { destroy: vi.fn() };
    const mover = { stop: vi.fn(), start: vi.fn() };
    scene.pendingWhispers.set("agent-a", { targetAgentId: "agent-b" });
    scene.localCommandTimers.set("agent-a", timer);
    scene.movers.set("agent-a", mover);
    scene.movementReservations.set("agent-a", "5,5");
    scene.cancelLocalConversationSessions = vi.fn();
    scene.tweens = { killTweensOf: vi.fn() };

    expect(scene.executeLocalCommand({ type: "cancel", actorAgentId: "agent-a" })).toBe(true);
    expect(timer.destroy).toHaveBeenCalledOnce();
    expect(scene.pendingWhispers.has("agent-a")).toBe(false);
    expect(scene.localCommandTimers.has("agent-a")).toBe(false);
    expect(scene.movementReservations.has("agent-a")).toBe(false);
    expect(scene.tweens.killTweensOf).toHaveBeenCalledWith(actor);
    expect(mover.stop).toHaveBeenCalledOnce();
    expect(mover.start).toHaveBeenCalledOnce();
  });

  it("removes a legacy whisper marker after its first generated turn", async () => {
    const { scene, actor, target } = makeBaseScene();
    const context = ["【用户只对你说的耳语指令】向林毅打招呼"];
    scene.activeSessions.set("agent-a|agent-b", {
      a: actor,
      b: target,
      nameA: "苏敏",
      nameB: "林毅",
      totalRounds: 2,
      currentRound: 0,
      context,
      timer: null,
      whisper: { speakerId: "agent-a", targetName: "林毅" },
    });
    scene.queueDialogue = vi.fn();
    dialogueMocks.fetchDialogue.mockResolvedValue({
      message: "你好。",
      emotion: null,
      source: "mock",
    });

    scene.advanceConversation("agent-a|agent-b");
    await Promise.resolve();

    expect(context).toEqual(["你好。"]);
    expect(scene.queueDialogue).toHaveBeenCalledWith(
      "agent-a",
      "你好。",
      "neutral",
      expect.any(Function),
    );
  });
});
