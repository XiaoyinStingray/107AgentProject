import type { Scenario } from "../types/world";
import type { SSEEvent } from "../types/events";
import { MOCK_SSE_EVENTS } from "./sse";

/** Step 20 群体沙盒可独立运行的三个内置场景。 */
export const MOCK_SANDBOX_SCENARIOS: Scenario[] = [
  {
    name: "新生报到",
    description: "大学开学第一天，几个新生在宿舍相遇。",
    time_range: "1-20",
  },
  {
    name: "期末周",
    description: "图书馆座位紧张，三个 Agent 面临时间与资源竞争。",
    time_range: "1-30",
  },
  {
    name: "毕业选择",
    description: "保研、考研、工作与出国选择同时摆在 Agent 面前。",
    time_range: "1-25",
  },
];

/** Step 20 专用关系变化事件，用于验证 Timeline 和 EventFeed。 */
export const MOCK_SANDBOX_RELATIONSHIP_EVENTS: SSEEvent[] = [
  {
    type: "relationship_change",
    tick: 2,
    agent_id: "mock-2",
    agent_name: "小红",
    description: "小红拒绝小明的邀请，但保留了继续合作的可能。",
    data: {
      agent_a: "mock-2",
      agent_b: "mock-1",
      change: -0.05,
      score: 0.1,
      interaction: "cautious",
    },
  },
  {
    type: "relationship_change",
    tick: 4,
    agent_id: "mock-1",
    agent_name: "小明",
    description: "小明主动共享自习室信息，小红对他的信任上升。",
    data: {
      agent_a: "mock-1",
      agent_b: "mock-2",
      change: 0.15,
      score: 0.25,
      interaction: "friendly",
    },
  },
  {
    type: "relationship_change",
    tick: 5,
    agent_id: "mock-3",
    agent_name: "小刚",
    description: "小刚将小明的合作行为判断为竞争策略，双方关系转为紧张。",
    data: {
      agent_a: "mock-3",
      agent_b: "mock-1",
      change: -0.1,
      score: -0.1,
      interaction: "competitive",
    },
  },
];

/** 基础 SSE Mock 与 Step 20 关系事件合并后的有序事件流。 */
export const MOCK_SANDBOX_EVENTS: SSEEvent[] = [
  ...MOCK_SSE_EVENTS,
  ...MOCK_SANDBOX_RELATIONSHIP_EVENTS,
].sort((a, b) => a.tick - b.tick);
