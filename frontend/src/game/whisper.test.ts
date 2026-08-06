import { describe, expect, it } from "vitest";
import {
  buildWhisperContext,
  chooseWhisperApproachTile,
  isWhisperMoveNearIntent,
  localCommandNeedsMessage,
  localCommandNeedsTarget,
  normalizeWhisper,
  resolveMentionedWhisperTarget,
  resolveWhisperMoveTarget,
  resolveWhisperTarget,
  type WhisperAgent,
} from "./whisper";

const agents: WhisperAgent[] = [
  { agentId: "a", name: "苏敏", tileX: 1, tileY: 1 },
  { agentId: "b", name: "陈墨", tileX: 8, tileY: 8 },
  { agentId: "c", name: "林思远", tileX: 2, tileY: 1 },
];

describe("whisper helpers", () => {
  it("prefers a deployed Agent explicitly mentioned by name", () => {
    expect(
      resolveWhisperTarget("请去和陈墨聊一聊", "a", agents)?.agentId,
    ).toBe("b");
  });

  it("falls back to the nearest other Agent", () => {
    expect(resolveWhisperTarget("找个人聊聊", "a", agents)?.agentId).toBe("c");
  });

  it("distinguishes an explicitly named Brain target from a local fallback", () => {
    expect(
      resolveMentionedWhisperTarget("请去和陈墨聊一聊", "a", agents)?.agentId,
    ).toBe("b");
    expect(
      resolveMentionedWhisperTarget("找个人聊聊", "a", agents),
    ).toBeNull();
  });

  it("recognizes an explicit move-near instruction without treating talk as movement", () => {
    expect(isWhisperMoveNearIntent("移动到陈墨旁边")).toBe(true);
    expect(isWhisperMoveNearIntent("去靠近陈墨")).toBe(true);
    expect(isWhisperMoveNearIntent("去和陈墨说话")).toBe(false);
    expect(isWhisperMoveNearIntent("不要移动到陈墨旁边")).toBe(false);
    expect(
      resolveWhisperMoveTarget("移位到陈墨身边", "a", agents)?.agentId,
    ).toBe("b");
    expect(
      resolveWhisperMoveTarget("移动到陌生人旁边", "a", agents),
    ).toBeNull();
  });

  it("does not invent a social target for an environment action", () => {
    expect(resolveWhisperTarget("请去弹钢琴", "a", agents)).toBeNull();
  });

  it("normalizes and labels user instructions for dialogue context", () => {
    expect(normalizeWhisper("  保持冷静  ")).toBe("保持冷静");
    expect(buildWhisperContext("  保持冷静  ")).toBe(
      "【用户只对你说的耳语指令】保持冷静",
    );
  });

  it("rejects an unknown speaker or an empty instruction", () => {
    expect(resolveWhisperTarget("随便聊聊", "missing", agents)).toBeNull();
    expect(normalizeWhisper("   ")).toBe("");
  });

  it("chooses the closest available tile beside the whisper target", () => {
    expect(
      chooseWhisperApproachTile(agents[0], agents[1], (x, y) => x === 7 && y === 8),
    ).toEqual({ tileX: 7, tileY: 8 });
    expect(
      chooseWhisperApproachTile(agents[0], agents[1], () => false),
    ).toBeNull();
  });

  it("declares fields required by each structured local command", () => {
    expect(localCommandNeedsTarget("talk")).toBe(true);
    expect(localCommandNeedsTarget("move")).toBe(true);
    expect(localCommandNeedsTarget("move_then_talk")).toBe(true);
    expect(localCommandNeedsTarget("observe")).toBe(false);
    expect(localCommandNeedsMessage("talk")).toBe(true);
    expect(localCommandNeedsMessage("move_then_talk")).toBe(true);
    expect(localCommandNeedsMessage("move")).toBe(false);
    expect(localCommandNeedsMessage("cancel")).toBe(false);
  });
});
