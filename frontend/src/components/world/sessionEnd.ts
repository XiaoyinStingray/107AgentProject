export interface SessionEndCopy {
  title: string;
  detail: string;
}

/** Turn backend session-end reasons into stable, user-facing copy. */
export function getSessionEndCopy(reason?: string): SessionEndCopy {
  switch (reason) {
    case "natural_completion":
      return {
        title: "对话已自然结束",
        detail: "参与者已经完成交流并自然收束。",
      };
    case "conversation_repeating":
      return {
        title: "对话已自动结束",
        detail: "系统检测到内容开始重复，已保留当前结果。",
      };
    case "conversation_stalled":
      return {
        title: "对话已自动结束",
        detail: "连续多轮没有产生有效互动，已保留当前结果。",
      };
    case "hard_limit":
      return {
        title: "实验已完成",
        detail: "已达到本次实验的轮数上限。",
      };
    default:
      return {
        title: "实验已结束",
        detail: "当前画面和事件记录已保留。",
      };
  }
}
