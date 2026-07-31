import { beforeEach, describe, expect, it, vi } from "vitest";

const playbackMocks = vi.hoisted(() => ({
  clear: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
}));

vi.mock("phaser", () => {
  class Circle {
    static Contains = vi.fn();
  }
  return {
    default: {
      Scene: class {},
      Geom: { Circle },
      Math: { Between: vi.fn(() => 0) },
    },
  };
});

vi.mock("../sprites/AgentSprite", () => ({
  AgentSprite: class {},
}));

vi.mock("../AutonomousMover", () => ({
  AutonomousMover: class {},
}));

vi.mock("../emotion/EmotionEngine", () => ({
  emotionEngine: {
    onEmotionChange: vi.fn(),
    onRandomEvent: vi.fn(),
    setScene: vi.fn(),
    stop: vi.fn(),
    start: vi.fn(),
    registerAgent: vi.fn(),
  },
  RANDOM_EVENTS: [],
}));

vi.mock("../audio/DialoguePlaybackQueue", () => ({
  playbackQueue: {
    clear: playbackMocks.clear,
    enqueue: vi.fn(),
    pause: playbackMocks.pause,
    resume: playbackMocks.resume,
  },
}));

import { MapScene } from "./MapScene";

describe("MapScene dialogue lifecycle", () => {
  beforeEach(() => {
    playbackMocks.clear.mockReset();
    playbackMocks.pause.mockReset();
    playbackMocks.resume.mockReset();
  });

  it("starts a fresh dialogue scanner after a map finishes building", () => {
    const scanner = { destroy: vi.fn() };
    const layer = { destroy: vi.fn() };
    const tilemap = {
      addTilesetImage: vi.fn(() => ({})),
      createLayer: vi.fn(() => layer),
    };
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      mapData: {
        id: "library",
        name: "图书馆",
        width: 1,
        height: 1,
        ground: [[0]],
        items: [],
        spawns: [],
        foregrounds: [],
      },
      groundLayer: null,
      pendingAgents: [],
      fgImages: [],
      dialogueTimer: null,
      textures: { exists: vi.fn(() => false) },
      make: { tilemap: vi.fn(() => tilemap) },
      time: { addEvent: vi.fn(() => scanner) },
      buildLayerData: vi.fn(() => [[0]]),
      placeItems: vi.fn(),
      placeDecors: vi.fn(),
    });

    scene.buildScene();

    expect(scene.time.addEvent).toHaveBeenCalledWith(expect.objectContaining({
      delay: 3000,
      loop: true,
      callback: expect.any(Function),
    }));
    expect(scene.dialogueTimer).toBe(scanner);
  });

  it("clears stale dialogue state before rebuilding another map", () => {
    const scanner = { destroy: vi.fn() };
    const sessionTimer = { destroy: vi.fn() };
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      dialogueTimer: scanner,
      dialogueCooldowns: new Map([["a|b", Date.now()]]),
      activeSessions: new Map([["a|b", { timer: sessionTimer }]]),
      busyAgents: new Set(["a", "b"]),
      pendingWhispers: new Map([["a", "测试耳语"]]),
    });

    scene.resetDialogueRuntime();

    expect(scanner.destroy).toHaveBeenCalledOnce();
    expect(sessionTimer.destroy).toHaveBeenCalledOnce();
    expect(scene.dialogueTimer).toBeNull();
    expect(scene.dialogueCooldowns.size).toBe(0);
    expect(scene.activeSessions.size).toBe(0);
    expect(scene.busyAgents.size).toBe(0);
    expect(playbackMocks.clear).toHaveBeenCalledOnce();
  });

  it("forces existing sprites back to checkpoint coordinates while paused", () => {
    const sprite = {
      setTile: vi.fn(),
      setData: vi.fn(),
      setAction: vi.fn(),
    };
    const mover = { stop: vi.fn(), start: vi.fn() };
    const snapshot = [{
      agentId: "agent-a",
      name: "苏敏",
      emoji: "苏",
      color: "#fff",
      tileX: 2,
      tileY: 3,
      action: "idle",
      emotion: "neutral",
    }];
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      paused: true,
      movers: new Map([["agent-a", mover]]),
      agentSprites: new Map([["agent-a", sprite]]),
      tweens: { killTweensOf: vi.fn() },
      dialogueCooldowns: new Map(),
      activeSessions: new Map(),
      busyAgents: new Set(),
      pendingWhispers: new Map(),
      setAgents: vi.fn(),
    });

    scene.restoreAgents(snapshot);

    expect(mover.stop).toHaveBeenCalledOnce();
    expect(scene.setAgents).toHaveBeenCalledWith(snapshot);
    expect(sprite.setTile).toHaveBeenCalledWith(2, 3);
    expect(sprite.setData).toHaveBeenCalledWith("startTileX", 2);
    expect(sprite.setData).toHaveBeenCalledWith("startTileY", 3);
    expect(sprite.setAction).toHaveBeenCalledWith("idle");
    expect(mover.start).not.toHaveBeenCalled();
    expect(playbackMocks.clear).toHaveBeenCalledOnce();
  });

  it("stores a local whisper and gives immediate receipt feedback", () => {
    const sprite = {
      agentId: "agent-a",
      tileX: 1,
      tileY: 1,
      getData: vi.fn(() => "苏敏"),
    };
    const target = {
      agentId: "agent-b",
      tileX: 8,
      tileY: 8,
      getData: vi.fn(() => "陈墨"),
    };
    const mover = { pushCommand: vi.fn() };
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      agentSprites: new Map([
        ["agent-a", sprite],
        ["agent-b", target],
      ]),
      movers: new Map([["agent-a", mover]]),
      pendingWhispers: new Map(),
      showAgentBubble: vi.fn(),
      isWalkable: vi.fn(() => true),
      isOccupiedByOther: vi.fn(() => false),
    });

    expect(scene.receiveWhisper("agent-a", "  去和陈墨说话  ")).toBe(true);
    expect(scene.pendingWhispers.get("agent-a")).toEqual({
      message: "去和陈墨说话",
      targetAgentId: "agent-b",
      targetName: "陈墨",
    });
    expect(mover.pushCommand).toHaveBeenCalled();
    expect(scene.showAgentBubble).toHaveBeenCalledWith(
      "agent-a",
      "已收到，正前往 陈墨",
    );
    expect(scene.receiveWhisper("missing", "测试")).toBe(false);
  });

  it("routes Brain SSE dialogue through the serialized playback queue", () => {
    const speaker = { emotion: "happy" };
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      agentSprites: new Map([["agent-a", speaker]]),
      queueDialogue: vi.fn(),
    });
    const event = {
      fromId: "agent-a",
      fromName: "苏敏",
      message: "我们一起复习吧。",
      targetIds: ["agent-b"],
    };

    expect(scene.receiveSseDialogue(event)).toBe(true);
    expect(scene.queueDialogue).toHaveBeenCalledWith(
      "agent-a",
      "我们一起复习吧。",
      "happy",
    );
    expect(scene.receiveSseDialogue({ ...event, fromId: "missing" })).toBe(false);
  });

  it("blocks late SSE movement and stops every active sprite while paused", () => {
    const mover = {
      stop: vi.fn(),
      setSseDriven: vi.fn(),
      pushCommand: vi.fn(),
    };
    const walking = { action: "walk", setAction: vi.fn() };
    const talking = { action: "talk", setAction: vi.fn() };
    const killTweensOf = vi.fn();
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      paused: false,
      movers: new Map([["agent-a", mover]]),
      agentSprites: new Map([
        ["agent-a", walking],
        ["agent-b", talking],
      ]),
      dialogueTimer: { paused: false },
      tweens: { killTweensOf },
    });

    scene.pauseSimulation();
    scene.onSseMoveTo("agent-a", 4, 5);

    expect(mover.stop).toHaveBeenCalledOnce();
    expect(killTweensOf).toHaveBeenCalledWith(walking);
    expect(killTweensOf).toHaveBeenCalledWith(talking);
    expect(walking.setAction).toHaveBeenCalledWith("idle");
    expect(talking.setAction).not.toHaveBeenCalled();
    expect(playbackMocks.pause).toHaveBeenCalledOnce();
    expect(mover.pushCommand).not.toHaveBeenCalled();
  });

  it("unregisters all game event handlers during shutdown", () => {
    const off = vi.fn();
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      game: { events: { off } },
      destroyScene: vi.fn(),
    });

    scene.shutdown();

    for (const [eventName, handlerName] of [
      ["agent-whisper", "onAgentWhisper"],
      ["agent-whisper-feedback", "onAgentWhisperFeedback"],
      ["sse-move-to", "onSseMoveTo"],
      ["sse-dialogue", "onSseDialogue"],
      ["sse-emotion", "onSseEmotion"],
      ["brain-toggle", "onBrainToggle"],
    ]) {
      expect(off).toHaveBeenCalledWith(
        eventName,
        scene[handlerName],
        scene,
      );
    }
    expect(scene.destroyScene).toHaveBeenCalledOnce();
  });
});
