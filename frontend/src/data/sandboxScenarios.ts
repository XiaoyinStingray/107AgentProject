import type { Scenario } from "../types/world";

/** Built-in scenario choices accepted by the World API. */
export const SANDBOX_SCENARIOS: Scenario[] = [
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
