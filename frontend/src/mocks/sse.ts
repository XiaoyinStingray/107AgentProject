import { useState, useRef, useCallback, useEffect } from "react";
import { useSSEStore } from "../stores/useSSEStore";
import type { SSEEvent } from "../types/events";

/* ================================================================
   Mock SSE 数据 + useMockSSE hook
   Step 18 测试用——定时器推预置事件，不连后端。
   Step 19 单人剧场完成后可移除此文件。
   ================================================================ */

export const MOCK_SSE_EVENTS: SSEEvent[] = [
  {
    type: "thought_stream",
    tick: 1,
    agent_id: "mock-1",
    agent_name: "小明",
    phase: "观察",
    content: "我注意到小红今天没来上课…她是不是在准备比赛？如果是的话，我需要调整策略。",
  },
  {
    type: "agent_action",
    tick: 1,
    agent_id: "mock-1",
    agent_name: "小明",
    action: "send_message",
    target: "小红",
    message: "周末一起复习高数吗？",
  },
  {
    type: "thought_stream",
    tick: 2,
    agent_id: "mock-2",
    agent_name: "小红",
    phase: "思考",
    content: "小明的消息…他想找我组队？但我已经答应小刚了…如果拒绝的话会不会很尴尬？",
  },
  {
    type: "agent_message",
    tick: 2,
    agent_id: "mock-2",
    agent_name: "小红",
    message: "抱歉小明，我已经和小刚约好了一起复习。",
    subtext: "其实有点不好意思，但答应的顺序不能乱",
    tone: "casual",
  },
  {
    type: "thought_stream",
    tick: 2,
    agent_id: "mock-3",
    agent_name: "小刚",
    phase: "决策",
    content: "小红选了我而不是小明。这个优势要保持。下次考试再压他一头，GPA 第一就稳了。",
  },
  {
    type: "tick_boundary",
    tick: 2,
    description: "Tick #2 结束",
  },
  {
    type: "world_event",
    tick: 3,
    description: "期末考试周开始，图书馆座位减少 80%，自习室开放预约制。",
  },
  {
    type: "thought_stream",
    tick: 3,
    agent_id: "mock-1",
    agent_name: "小明",
    phase: "思考",
    content:
      "图书馆没位子了…得去教学楼抢自习室。小红和小刚肯定也在抢——这变成了一场信息战。",
  },
  {
    type: "agent_action",
    tick: 3,
    agent_id: "mock-1",
    agent_name: "小明",
    action: "set_goal",
    target: "",
    message: "预定教学楼三楼的通宵自习室",
  },
  {
    type: "thought_stream",
    tick: 3,
    agent_id: "mock-3",
    agent_name: "小刚",
    phase: "思考",
    content: "教学楼的教室比图书馆宽敞——更重要的是，很多人不知道三楼那间可以通宵。先下手为强。",
  },
  {
    type: "agent_message",
    tick: 4,
    agent_id: "mock-1",
    agent_name: "小明",
    message: "大家怎么样了？我找到一间空的自习室，要不要一起来？",
    subtext: "与其敌对，不如合作。信息共享也许能换回一些关系分。",
    tone: "casual",
  },
  {
    type: "thought_stream",
    tick: 4,
    agent_id: "mock-2",
    agent_name: "小红",
    phase: "决策",
    content: "小明确实比小刚更会做人…小刚只会竞争，小明知道合作的价值。也许我选错了…不，现在下结论太早。先观察。",
  },
  {
    type: "tick_boundary",
    tick: 4,
    description: "Tick #4 结束",
  },
  {
    type: "thought_stream",
    tick: 5,
    agent_id: "mock-3",
    agent_name: "小刚",
    phase: "反思",
    content:
      "小明在收买人心。这不是合作——这是公关策略。但效果确实不差。我需要更硬的实力来对冲他的社交优势。",
  },
  {
    type: "agent_action",
    tick: 5,
    agent_id: "mock-3",
    agent_name: "小刚",
    action: "think_aloud",
    target: "",
    message: "我需要在成绩上建立不可动摇的领先——让小红自己就知道，选我才是最优解。",
  },
];

/** Step 18 测试用 hook——定时器推 Mock 事件 */
export function useMockSSE() {
  const { events, appendEvent, clear: storeClear, setConnected } = useSSEStore();
  const [running, setRunning] = useState(false);
  const indexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRunning(false);
    setConnected(false);
  }, [setConnected]);

  const start = useCallback(() => {
    storeClear();
    indexRef.current = 0;
    setConnected(true);
    setRunning(true);

    timerRef.current = setInterval(() => {
      if (indexRef.current >= MOCK_SSE_EVENTS.length) {
        stop();
        return;
      }
      appendEvent({ ...MOCK_SSE_EVENTS[indexRef.current] });
      indexRef.current++;
    }, 2000);
  }, [appendEvent, storeClear, setConnected, stop]);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return { events, connected: running, start, stop, clear: storeClear };
}
