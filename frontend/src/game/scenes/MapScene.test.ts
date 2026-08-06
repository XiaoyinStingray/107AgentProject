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
    const first = { agentId: "a", setAction: vi.fn() };
    const second = { agentId: "b", setAction: vi.fn() };
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      dialogueTimer: scanner,
      dialogueCooldowns: new Map([["a|b", Date.now()]]),
      activeSessions: new Map([[
        "a|b",
        { a: first, b: second, timer: sessionTimer },
      ]]),
      busyAgents: new Set(["a", "b"]),
      movementReservations: new Map([["a", "1,1"]]),
      pendingWhispers: new Map([["a", "测试耳语"]]),
    });

    scene.resetDialogueRuntime();

    expect(scanner.destroy).toHaveBeenCalledOnce();
    expect(sessionTimer.destroy).toHaveBeenCalledOnce();
    expect(scene.dialogueTimer).toBeNull();
    expect(scene.dialogueCooldowns.size).toBe(0);
    expect(scene.activeSessions.size).toBe(0);
    expect(scene.busyAgents.size).toBe(0);
    expect(scene.movementReservations.size).toBe(0);
    expect(first.setAction).toHaveBeenCalledWith("idle");
    expect(second.setAction).toHaveBeenCalledWith("idle");
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
      wallMap: [],
      movers: new Map([["agent-a", mover]]),
      agentSprites: new Map([["agent-a", sprite]]),
      tweens: { killTweensOf: vi.fn() },
      dialogueCooldowns: new Map(),
      activeSessions: new Map(),
      busyAgents: new Set(),
      movementReservations: new Map(),
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
      activeSessions: new Map(),
      busyAgents: new Set(),
      pendingWhispers: new Map(),
      showAgentBubble: vi.fn(),
      isWalkable: vi.fn(() => true),
      isOccupiedByOther: vi.fn(() => false),
    });

    expect(scene.receiveWhisper("agent-a", "  去和陈墨说话  ")).toBe(true);
    expect(scene.pendingWhispers.get("agent-a")).toEqual(
      expect.objectContaining({
        message: "去和陈墨说话",
        targetAgentId: "agent-b",
        targetName: "陈墨",
        expiresAt: expect.any(Number),
      }),
    );
    expect(mover.pushCommand).toHaveBeenCalled();
    expect(scene.showAgentBubble).toHaveBeenCalledWith(
      "agent-a",
      "已收到，正前往 陈墨",
    );
    expect(scene.receiveWhisper("missing", "测试")).toBe(false);
  });

  it("interrupts an ambient session before queuing a direct whisper", () => {
    const speaker = {
      agentId: "agent-a",
      tileX: 1,
      tileY: 1,
      getData: vi.fn(() => "苏敏"),
      setAction: vi.fn(),
    };
    const listener = {
      agentId: "agent-b",
      tileX: 2,
      tileY: 1,
      getData: vi.fn(() => "林毅"),
      setAction: vi.fn(),
    };
    const moverA = { pushCommand: vi.fn(), start: vi.fn() };
    const moverB = { start: vi.fn() };
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      paused: false,
      agentSprites: new Map([
        ["agent-a", speaker],
        ["agent-b", listener],
      ]),
      movers: new Map([
        ["agent-a", moverA],
        ["agent-b", moverB],
      ]),
      activeSessions: new Map([[
        "agent-a|agent-b",
        { a: speaker, b: listener, timer: { destroy: vi.fn() } },
      ]]),
      busyAgents: new Set(["agent-a", "agent-b"]),
      pendingWhispers: new Map(),
      showAgentBubble: vi.fn(),
      isWalkable: vi.fn(() => true),
      isOccupiedByOther: vi.fn(() => false),
    });

    expect(scene.receiveWhisper("agent-a", "对林毅说：你好")).toBe(true);

    expect(scene.activeSessions.size).toBe(0);
    expect(scene.busyAgents.size).toBe(0);
    expect(speaker.setAction).toHaveBeenCalledWith("idle");
    expect(listener.setAction).toHaveBeenCalledWith("idle");
    expect(moverA.start).toHaveBeenCalledOnce();
    expect(moverB.start).toHaveBeenCalledOnce();
    expect(scene.pendingWhispers.get("agent-a")).toEqual(
      expect.objectContaining({ targetAgentId: "agent-b" }),
    );
    expect(playbackMocks.clear).toHaveBeenCalledOnce();
  });

  it("starts a pending whisper before ambient dialogue and bypasses cooldown", () => {
    const now = Date.now();
    const speaker = { agentId: "agent-a", tileX: 1, tileY: 1 };
    const listener = { agentId: "agent-b", tileX: 2, tileY: 1 };
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      _brainEnabled: false,
      _allFrozen: false,
      scene: { isActive: vi.fn(() => true) },
      agentSprites: new Map([
        ["agent-a", speaker],
        ["agent-b", listener],
      ]),
      activeSessions: new Map(),
      busyAgents: new Set(),
      pendingWhispers: new Map([[
        "agent-a",
        {
          message: "对林毅说：你好",
          targetAgentId: "agent-b",
          targetName: "林毅",
          expiresAt: now + 10_000,
        },
      ]]),
      dialogueCooldowns: new Map([["agent-a|agent-b", now]]),
      showAgentBubble: vi.fn(),
      startConversationSession: vi.fn(),
      checkItemProximity: vi.fn(),
    });

    scene.scanAndDialogue();

    expect(scene.pendingWhispers.size).toBe(0);
    expect(scene.startConversationSession).toHaveBeenCalledWith(
      speaker,
      listener,
      1,
      ["【用户只对你说的耳语指令】对林毅说：你好"],
      { speakerId: "agent-a", targetName: "林毅" },
      undefined,
    );
    expect(scene.showAgentBubble).toHaveBeenCalledWith(
      "agent-a",
      "正在执行耳语：与 林毅 对话",
    );
  });

  it("expires a pending whisper with visible feedback", () => {
    const now = Date.now();
    const speaker = { agentId: "agent-a", tileX: 1, tileY: 1 };
    const listener = { agentId: "agent-b", tileX: 2, tileY: 1 };
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      _brainEnabled: false,
      _allFrozen: false,
      scene: { isActive: vi.fn(() => true) },
      agentSprites: new Map([
        ["agent-a", speaker],
        ["agent-b", listener],
      ]),
      activeSessions: new Map(),
      busyAgents: new Set(),
      pendingWhispers: new Map([[
        "agent-a",
        {
          message: "对林毅说：你好",
          targetAgentId: "agent-b",
          targetName: "林毅",
          expiresAt: now - 1,
        },
      ]]),
      dialogueCooldowns: new Map([["agent-a|agent-b", now]]),
      showAgentBubble: vi.fn(),
      startConversationSession: vi.fn(),
      checkItemProximity: vi.fn(),
    });

    scene.scanAndDialogue();

    expect(scene.pendingWhispers.size).toBe(0);
    expect(scene.startConversationSession).not.toHaveBeenCalled();
    expect(scene.showAgentBubble).toHaveBeenCalledWith(
      "agent-a",
      "耳语执行超时，请重新发送",
    );
  });

  it("executes a move-near whisper without creating a dialogue request", () => {
    const speaker = {
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
      paused: false,
      mapData: { width: 16, height: 12 },
      agentSprites: new Map([
        ["agent-a", speaker],
        ["agent-b", target],
      ]),
      movers: new Map([["agent-a", mover]]),
      pendingWhispers: new Map(),
      showAgentBubble: vi.fn(),
      isWalkable: vi.fn(() => true),
      isOccupiedByOther: vi.fn(() => false),
    });

    expect(scene.receiveWhisper("agent-a", "移动到陈墨旁边")).toBe(true);
    expect(mover.pushCommand).toHaveBeenCalledWith(7, 8);
    expect(scene.pendingWhispers.size).toBe(0);
    expect(scene.showAgentBubble).toHaveBeenCalledWith(
      "agent-a",
      "已收到，正前往 陈墨 身边",
    );
  });

  it("reports move-near boundary states instead of silently doing nothing", () => {
    const speaker = {
      agentId: "agent-a",
      tileX: 7,
      tileY: 8,
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
      paused: false,
      mapData: { width: 16, height: 12 },
      agentSprites: new Map([
        ["agent-a", speaker],
        ["agent-b", target],
      ]),
      movers: new Map([["agent-a", mover]]),
      showAgentBubble: vi.fn(),
      isWalkable: vi.fn(() => true),
      isOccupiedByOther: vi.fn(() => false),
    });

    expect(scene.moveAgentNear("agent-a", "agent-b")).toBe(true);
    expect(mover.pushCommand).not.toHaveBeenCalled();
    expect(scene.showAgentBubble).toHaveBeenLastCalledWith(
      "agent-a",
      "已经在 陈墨 旁边",
    );

    speaker.tileX = 1;
    speaker.tileY = 1;
    scene.paused = true;
    expect(scene.moveAgentNear("agent-a", "agent-b")).toBe(true);
    expect(mover.pushCommand).toHaveBeenCalledWith(7, 8);
    expect(scene.showAgentBubble).toHaveBeenLastCalledWith(
      "agent-a",
      "已收到，继续后前往 陈墨 身边",
    );
  });

  it("rejects a move-near whisper when every adjacent tile is blocked", () => {
    const speaker = {
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
      paused: false,
      mapData: { width: 16, height: 12 },
      agentSprites: new Map([
        ["agent-a", speaker],
        ["agent-b", target],
      ]),
      movers: new Map([["agent-a", mover]]),
      showAgentBubble: vi.fn(),
      isWalkable: vi.fn(() => true),
      isOccupiedByOther: vi.fn(() => true),
    });

    expect(scene.moveAgentNear("agent-a", "agent-b")).toBe(false);
    expect(mover.pushCommand).not.toHaveBeenCalled();
    expect(scene.showAgentBubble).toHaveBeenCalledWith(
      "agent-a",
      "陈墨 旁边暂时没有空位",
    );
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

  it("releases stale local sessions before a priority Brain whisper", () => {
    const first = { agentId: "agent-a", setAction: vi.fn() };
    const second = { agentId: "agent-b", setAction: vi.fn() };
    const moverA = { start: vi.fn() };
    const moverB = { start: vi.fn() };
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      paused: false,
      activeSessions: new Map([[
        "agent-a|agent-b",
        { a: first, b: second, timer: { destroy: vi.fn() } },
      ]]),
      busyAgents: new Set(["agent-a", "agent-b"]),
      pendingWhispers: new Map([["agent-a", { targetAgentId: "agent-b" }]]),
      activeBubbles: new Set(),
      activeUserMessageBubbles: new Set(),
      userMessageGeneration: 0,
      movers: new Map([
        ["agent-a", moverA],
        ["agent-b", moverB],
      ]),
    });

    scene.preparePriorityBrainDialogue();

    expect(scene.activeSessions.size).toBe(0);
    expect(scene.busyAgents.size).toBe(0);
    expect(scene.pendingWhispers.size).toBe(0);
    expect(first.setAction).toHaveBeenCalledWith("idle");
    expect(second.setAction).toHaveBeenCalledWith("idle");
    expect(moverA.start).toHaveBeenCalledOnce();
    expect(moverB.start).toHaveBeenCalledOnce();
    expect(playbackMocks.clear).toHaveBeenCalledOnce();
  });

  it("releases local sessions when Brain mode changes", () => {
    const first = { agentId: "agent-a", setAction: vi.fn() };
    const second = { agentId: "agent-b", setAction: vi.fn() };
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      _brainEnabled: false,
      paused: false,
      activeSessions: new Map([[
        "agent-a|agent-b",
        { a: first, b: second, timer: { destroy: vi.fn() } },
      ]]),
      busyAgents: new Set(["agent-a", "agent-b"]),
      pendingWhispers: new Map([["agent-a", { targetAgentId: "agent-b" }]]),
      activeBubbles: new Set(),
      activeUserMessageBubbles: new Set(),
      userMessageGeneration: 0,
      movers: new Map([
        ["agent-a", { start: vi.fn() }],
        ["agent-b", { start: vi.fn() }],
      ]),
    });

    scene.onBrainToggle(true);

    expect(scene._brainEnabled).toBe(true);
    expect(scene.activeSessions.size).toBe(0);
    expect(scene.busyAgents.size).toBe(0);
    expect(scene.pendingWhispers.size).toBe(0);
    expect(scene.userMessageGeneration).toBe(1);
    expect(playbackMocks.clear).toHaveBeenCalledOnce();
  });

  it("reserves different destinations for simultaneous movers", () => {
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      mapData: { width: 6, height: 6 },
      wallMap: [],
      agentSprites: new Map(),
      movementReservations: new Map(),
    });

    const first = scene.reserveMovementDestination("agent-a", 3, 3);
    const second = scene.reserveMovementDestination("agent-b", 3, 3);

    expect(first).toEqual({ tileX: 3, tileY: 3 });
    expect(second).not.toEqual(first);
    expect(scene.movementReservations.get("agent-a")).toBe("3,3");
    expect(scene.movementReservations.get("agent-b")).not.toBe("3,3");

    scene.releaseMovementDestination("agent-a");
    const third = scene.reserveMovementDestination("agent-c", 3, 3);
    expect(third).toEqual({ tileX: 3, tileY: 3 });
  });

  it("moves duplicate checkpoint coordinates to nearby free tiles", () => {
    const scene = Object.create(MapScene.prototype) as any;
    Object.assign(scene, {
      mapData: { width: 6, height: 6 },
      wallMap: [],
    });
    const agents = [
      { agentId: "agent-a", tileX: 2, tileY: 2 },
      { agentId: "agent-b", tileX: 2, tileY: 2 },
      { agentId: "agent-c", tileX: 2, tileY: 2 },
    ];

    const placements = scene.normalizeAgentPlacements(agents);
    const uniqueTiles = new Set(
      placements.map((agent: any) => `${agent.tileX},${agent.tileY}`),
    );

    expect(placements[0]).toMatchObject({ tileX: 2, tileY: 2 });
    expect(uniqueTiles.size).toBe(3);
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
