import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AgentSpriteData } from "../../game/sprites/AgentSprite";
import AgentInteractionControls from "./AgentInteractionControls";

const agents: AgentSpriteData[] = [
  {
    agentId: "agent-a",
    name: "苏敏",
    emoji: "苏",
    color: "#fff",
    tileX: 1,
    tileY: 1,
    action: "idle",
    emotion: "neutral",
  },
  {
    agentId: "agent-b",
    name: "林毅",
    emoji: "林",
    color: "#ccc",
    tileX: 5,
    tileY: 5,
    action: "idle",
    emotion: "neutral",
  },
];

describe("AgentInteractionControls", () => {
  it("keeps direct user speech separate from local commands", () => {
    const onTalk = vi.fn();
    render(
      <AgentInteractionControls
        agent={agents[0]}
        availableAgents={agents}
        brainEnabled={false}
        onTalk={onTalk}
        onLocalCommand={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("对 苏敏 说…"), {
      target: { value: "  你今天心情怎么样？  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送给 Agent" }));

    expect(onTalk).toHaveBeenCalledWith("你今天心情怎么样？");
    expect(screen.queryByText("你：你今天心情怎么样？")).toBeNull();
  });

  it("submits an exact structured dialogue command", () => {
    const onLocalCommand = vi.fn();
    render(
      <AgentInteractionControls
        agent={agents[0]}
        availableAgents={agents}
        brainEnabled={false}
        onTalk={vi.fn()}
        onLocalCommand={onLocalCommand}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "给 TA 指令" }));
    fireEvent.change(screen.getByLabelText("说话内容"), {
      target: { value: "你好，今天过得怎么样？" },
    });
    fireEvent.click(screen.getByRole("button", { name: "执行指令" }));

    expect(onLocalCommand).toHaveBeenCalledWith({
      type: "talk",
      actorAgentId: "agent-a",
      targetAgentId: "agent-b",
      message: "你好，今天过得怎么样？",
    });
  });

  it("only shows fields required by the selected command", () => {
    const onLocalCommand = vi.fn();
    render(
      <AgentInteractionControls
        agent={agents[0]}
        availableAgents={agents}
        brainEnabled={false}
        onLocalCommand={onLocalCommand}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "给 TA 指令" }));
    fireEvent.change(screen.getByLabelText("指令类型"), {
      target: { value: "observe" },
    });

    expect(screen.queryByLabelText("目标 Agent")).toBeNull();
    expect(screen.queryByLabelText("说话内容")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "执行指令" }));
    expect(onLocalCommand).toHaveBeenCalledWith({
      type: "observe",
      actorAgentId: "agent-a",
    });
  });

  it("preserves the Brain ON free-form instruction path", () => {
    const onWhisper = vi.fn();
    render(
      <AgentInteractionControls
        agent={agents[0]}
        availableAgents={agents}
        brainEnabled
        onWhisper={onWhisper}
      />,
    );

    expect(screen.queryByRole("button", { name: "给 TA 指令" })).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("告诉 苏敏 要做什么…"), {
      target: { value: "去找林毅聊聊" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送 AI 指令" }));
    expect(onWhisper).toHaveBeenCalledWith("去找林毅聊聊");
  });

  it("disables interaction while the Brain connection is starting", () => {
    const onTalk = vi.fn();
    const onWhisper = vi.fn();
    render(
      <AgentInteractionControls
        agent={agents[0]}
        availableAgents={agents}
        brainEnabled={false}
        brainPending
        onTalk={onTalk}
        onWhisper={onWhisper}
      />,
    );

    expect(screen.getByText("正在连接 AI 世界")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "发送 AI 指令" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "给 TA 指令" })).toBeNull();
    expect(onTalk).not.toHaveBeenCalled();
    expect(onWhisper).not.toHaveBeenCalled();
  });
});
