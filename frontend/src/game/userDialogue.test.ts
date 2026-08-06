import { describe, expect, it } from "vitest";
import { getLocalUserReply } from "./userDialogue";

const context = {
  agentName: "苏敏",
  emotion: "happy" as const,
  sceneId: "library",
};

describe("getLocalUserReply", () => {
  it.each([
    "你好",
    "你今天心情怎么样？",
    "你在干什么？",
    "谢谢你",
    "你真的很厉害",
    "这里怎么样？",
    "下次见",
  ])("responds to a supported high-confidence intent: %s", (message) => {
    expect(getLocalUserReply(message, context)).toEqual(expect.any(String));
  });

  it("uses the current emotion for mood replies", () => {
    expect(getLocalUserReply("你心情怎么样？", context)).toContain("心情很好");
    expect(getLocalUserReply("你心情怎么样？", {
      ...context,
      emotion: "tired",
    })).toContain("有一点累");
  });

  it("uses the current scene for activity replies", () => {
    expect(getLocalUserReply("你在干嘛？", context)).toContain("图书馆");
    expect(getLocalUserReply("你在干嘛？", {
      ...context,
      sceneId: "lab",
    })).toContain("实验室");
  });

  it.each([
    "今天的作业好多",
    "量子纠缠为什么不能超光速通信？",
    "去帮我拿一下桌上的书",
    "随便聊点什么吧",
    "",
  ])("does not force an unrelated fallback reply: %s", (message) => {
    expect(getLocalUserReply(message, context)).toBeNull();
  });

  it("returns no scene reply for an unknown scene", () => {
    expect(getLocalUserReply("这里怎么样？", {
      ...context,
      sceneId: "unknown",
    })).toBeNull();
  });
});
