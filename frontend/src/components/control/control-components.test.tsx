import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import ControlPanel from "../../pages/ControlPanel";
import AgentDashboard from "./AgentDashboard";
import EventHeatmap from "./EventHeatmap";
import AgentSearch from "./AgentSearch";
import DecisionPatterns from "./DecisionPatterns";
import {
  CONTROL_TABS,
  computeAgentStats,
  computeAllAgentStats,
  computeSummary,
  computeDecisionPatterns,
  buildHeatmap,
  heatmapCellColor,
  searchAgents,
  highlightMatch,
  DECISION_DIMENSION_LABELS,
  DECISION_OPTION_LABELS,
} from "../../mocks/control";
import { MOCK_AGENTS } from "../../mocks/agents";
import { MOCK_SANDBOX_EVENTS } from "../../mocks/sandbox";
import type { AgentResponse } from "../../types/agent";
import type { SSEEvent } from "../../types/events";

/* ================================================================
   Step 24 — M6 控制台组件测试
   Layer 1: 组件渲染 + 关键交互
   Layer 2: Mock 工具函数
   ================================================================ */

/* ---------- 工具函数 ---------- */

const AGENTS: AgentResponse[] = MOCK_AGENTS;
const EVENTS: SSEEvent[] = MOCK_SANDBOX_EVENTS;

/* ---------- Layer 1: 组件渲染 + 交互 ---------- */

describe("Step 24 ControlPanel — Tab 栏与切换", () => {
  it("renders title and all 7 tabs (4 available + 3 P3)", () => {
    render(<ControlPanel />);

    // 标题
    expect(screen.getByText("M6 控制台")).toBeInTheDocument();

    // 4 个可用 Tab
    expect(screen.getByRole("button", { name: /多 Agent 仪表盘/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /事件热力图/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agent 搜索/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /决策模式识别/ })).toBeInTheDocument();

    // 3 个 P3 占位 Tab
    expect(screen.getByRole("button", { name: /异常检测/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /长期追踪/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /策略提取/ })).toBeInTheDocument();
  });

  it("disables P3 placeholder tabs", () => {
    render(<ControlPanel />);

    expect(screen.getByRole("button", { name: /异常检测/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /长期追踪/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /策略提取/ })).toBeDisabled();
  });

  it("renders dashboard tab by default", () => {
    render(<ControlPanel />);

    // 仪表盘的顶部汇总标签——Agent 数
    expect(screen.getByText("Agent 数")).toBeInTheDocument();
    expect(screen.getByText("总事件数")).toBeInTheDocument();
  });

  it("switches to heatmap tab on click", () => {
    render(<ControlPanel />);

    fireEvent.click(screen.getByRole("button", { name: /事件热力图/ }));
    expect(screen.getByText("🗺️ 事件密度矩阵")).toBeInTheDocument();
  });

  it("switches to search tab on click", () => {
    render(<ControlPanel />);

    fireEvent.click(screen.getByRole("button", { name: /Agent 搜索/ }));
    expect(
      screen.getByPlaceholderText(/搜索 Agent/),
    ).toBeInTheDocument();
  });

  it("switches to patterns tab on click", () => {
    render(<ControlPanel />);

    fireEvent.click(screen.getByRole("button", { name: /决策模式识别/ }));
    // emoji 与文本在不同元素中，只查文本部分
    expect(screen.getByText("决策风格分布")).toBeInTheDocument();
  });

  it("shows EmptyState for P3 tabs (disabled, cannot click)", () => {
    render(<ControlPanel />);

    // P3 Tab 是 disabled，无法点击——验证其 disabled 属性
    const anomalyTab = screen.getByRole("button", { name: /异常检测/ });
    expect(anomalyTab).toBeDisabled();
  });
});

describe("Step 24 — AgentDashboard 组件", () => {
  it("renders 4 summary cards", () => {
    render(<AgentDashboard agents={AGENTS} events={EVENTS} />);

    expect(screen.getByText("Agent 数")).toBeInTheDocument();
    expect(screen.getByText("总事件数")).toBeInTheDocument();
    expect(screen.getByText("总 Tick")).toBeInTheDocument();
    expect(screen.getByText("行动/消息/思考")).toBeInTheDocument();
  });

  it("renders agent stat cards for each agent", () => {
    render(<AgentDashboard agents={AGENTS} events={EVENTS} />);

    // 每个 Agent 名字应该出现
    for (const agent of AGENTS) {
      expect(screen.getByText(agent.name)).toBeInTheDocument();
    }
  });

  it("renders empty state when no agents", () => {
    render(<AgentDashboard agents={[]} events={EVENTS} />);

    expect(screen.getByText("暂无 Agent 数据")).toBeInTheDocument();
  });

  it("summary shows correct agent count", () => {
    render(<AgentDashboard agents={AGENTS} events={EVENTS} />);

    // Agent 数 = AGENTS.length
    const summaryCards = screen.getAllByText(String(AGENTS.length));
    expect(summaryCards.length).toBeGreaterThan(0);
  });
});

describe("Step 24 — EventHeatmap 组件", () => {
  it("renders heatmap matrix with agents and ticks", () => {
    render(<EventHeatmap agents={AGENTS} events={EVENTS} />);

    expect(screen.getByText("🗺️ 事件密度矩阵")).toBeInTheDocument();

    // 每个 Agent 名字应作为行标题
    for (const agent of AGENTS) {
      expect(screen.getByText(agent.name)).toBeInTheDocument();
    }
  });

  it("renders gridcell aria labels", () => {
    render(<EventHeatmap agents={AGENTS} events={EVENTS} />);

    // 至少有一个 gridcell
    const cells = screen.getAllByRole("gridcell");
    expect(cells.length).toBeGreaterThan(0);
  });

  it("renders empty state when no data", () => {
    render(<EventHeatmap agents={[]} events={EVENTS} />);

    expect(screen.getByText(/暂无事件数据/)).toBeInTheDocument();
  });

  it("renders legend", () => {
    render(<EventHeatmap agents={AGENTS} events={EVENTS} />);

    expect(screen.getByText("密度:")).toBeInTheDocument();
  });
});

describe("Step 24 — AgentSearch 组件", () => {
  it("renders search input with placeholder", () => {
    render(<AgentSearch agents={AGENTS} />);

    expect(
      screen.getByPlaceholderText(/搜索 Agent/),
    ).toBeInTheDocument();
  });

  it("shows all agents initially with count hint", () => {
    render(<AgentSearch agents={AGENTS} />);

    expect(
      screen.getByText(new RegExp(`共 ${AGENTS.length} 个 Agent`)),
    ).toBeInTheDocument();
  });

  it("filters agents by name query", () => {
    render(<AgentSearch agents={AGENTS} />);

    const input = screen.getByPlaceholderText(/搜索 Agent/);
    fireEvent.change(input, { target: { value: "小明" } });

    // 应显示匹配计数
    expect(screen.getByText(/匹配/)).toBeInTheDocument();
    // 小明应出现在结果中（name 和 narrative 高亮会产生多个匹配）
    expect(screen.getAllByText("小明").length).toBeGreaterThan(0);
  });

  it("shows no results message for unmatched query", () => {
    render(<AgentSearch agents={AGENTS} />);

    const input = screen.getByPlaceholderText(/搜索 Agent/);
    fireEvent.change(input, { target: { value: "不存在的名字XYZ" } });

    expect(screen.getByText(/没有匹配/)).toBeInTheDocument();
  });

  it("clears query on clear button click", () => {
    render(<AgentSearch agents={AGENTS} />);

    const input = screen.getByPlaceholderText(/搜索 Agent/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "小明" } });
    expect(input.value).toBe("小明");

    fireEvent.click(screen.getByRole("button", { name: /清除/ }));
    expect(input.value).toBe("");
  });

  it("renders mark tags for matched fragments", () => {
    render(<AgentSearch agents={AGENTS} />);

    const input = screen.getByPlaceholderText(/搜索 Agent/);
    // 用 Agent 名字的一部分搜索以产生高亮
    const firstName = AGENTS[0].name;
    fireEvent.change(input, { target: { value: firstName } });

    // 应有 <mark> 元素高亮匹配片段
    const marks = document.querySelectorAll("mark");
    expect(marks.length).toBeGreaterThan(0);
  });
});

describe("Step 24 — DecisionPatterns 组件", () => {
  it("renders overview card with agent count", () => {
    render(<DecisionPatterns agents={AGENTS} />);

    // emoji 与文本在不同元素中，只查文本部分
    expect(screen.getByText("决策风格分布")).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`基于 ${AGENTS.length} 个 Agent`)),
    ).toBeInTheDocument();
  });

  it("renders 4 dimension charts", () => {
    render(<DecisionPatterns agents={AGENTS} />);

    // DimensionChart 标题 (h3) 与表格表头 (th) 都包含这些文本，用 getAllByText
    expect(screen.getAllByText("信息处理").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("风险偏好").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("社交倾向").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("压力应对").length).toBeGreaterThanOrEqual(1);
  });

  it("renders agent decision snapshot table", () => {
    render(<DecisionPatterns agents={AGENTS} />);

    // emoji 与文本可能在不同节点，用正则匹配
    expect(screen.getByText(/Agent 决策快照/)).toBeInTheDocument();

    // 表头——Agent、信息处理等可能出现在多处（图表标题 + 表头），用 getAllByText
    expect(screen.getAllByText("Agent").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("信息处理").length).toBeGreaterThanOrEqual(1);

    // 每个 Agent 名字应出现在表格中
    for (const agent of AGENTS) {
      expect(screen.getAllByText(agent.name).length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders empty state when no agents", () => {
    render(<DecisionPatterns agents={[]} />);

    expect(screen.getByText(/暂无 Agent 数据/)).toBeInTheDocument();
  });
});

/* ---------- Layer 2: Mock 工具函数 ---------- */

describe("Step 24 — control mocks utilities", () => {
  it("CONTROL_TABS has 4 available + 3 placeholders", () => {
    const available = CONTROL_TABS.filter((t) => t.available);
    const placeholders = CONTROL_TABS.filter((t) => !t.available);
    expect(available).toHaveLength(4);
    expect(placeholders).toHaveLength(3);
    expect(available.map((t) => t.key)).toEqual([
      "dashboard",
      "heatmap",
      "search",
      "patterns",
    ]);
    expect(placeholders.map((t) => t.key)).toEqual([
      "anomaly",
      "tracking",
      "strategy",
    ]);
  });

  it("computeAgentStats aggregates single agent correctly", () => {
    const agent = AGENTS[0];
    const stats = computeAgentStats(agent, EVENTS);

    expect(stats.agentId).toBe(agent.id);
    expect(stats.agentName).toBe(agent.name);
    expect(stats.mbti).toBe(agent.persona.mbti);
    expect(stats.energy).toBe(agent.energy);

    // 计数应为非负数
    expect(stats.actionCount).toBeGreaterThanOrEqual(0);
    expect(stats.messageCount).toBeGreaterThanOrEqual(0);
    expect(stats.thoughtCount).toBeGreaterThanOrEqual(0);
    expect(stats.relationCount).toBeGreaterThanOrEqual(0);
  });

  it("computeAllAgentStats returns stats for all agents", () => {
    const stats = computeAllAgentStats(AGENTS, EVENTS);
    expect(stats).toHaveLength(AGENTS.length);
    expect(stats.map((s) => s.agentId)).toEqual(AGENTS.map((a) => a.id));
  });

  it("computeSummary aggregates correctly", () => {
    const summary = computeSummary(AGENTS, EVENTS);
    expect(summary.agentCount).toBe(AGENTS.length);
    expect(summary.totalEvents).toBe(EVENTS.length);
    expect(summary.totalTicks).toBeGreaterThanOrEqual(0);
    expect(summary.totalActions).toBeGreaterThanOrEqual(0);
    expect(summary.totalMessages).toBeGreaterThanOrEqual(0);
    expect(summary.totalThoughts).toBeGreaterThanOrEqual(0);
  });

  it("computeSummary handles empty data", () => {
    const summary = computeSummary([], []);
    expect(summary.agentCount).toBe(0);
    expect(summary.totalEvents).toBe(0);
    expect(summary.totalTicks).toBe(0);
  });

  it("buildHeatmap builds correct matrix structure", () => {
    const { cells, ticks } = buildHeatmap(AGENTS, EVENTS);

    if (EVENTS.length > 0) {
      // 应为 agents.length × ticks.length
      expect(ticks.length).toBeGreaterThan(0);
      expect(cells).toHaveLength(AGENTS.length * ticks.length);

      // 每个 cell 都应有 agentId/tick/count
      for (const cell of cells) {
        expect(cell.agentId).toBeDefined();
        expect(cell.agentName).toBeDefined();
        expect(typeof cell.tick).toBe("number");
        expect(typeof cell.count).toBe("number");
      }
    }
  });

  it("buildHeatmap returns empty for empty input", () => {
    const { cells, ticks } = buildHeatmap([], EVENTS);
    expect(cells).toEqual([]);
    expect(ticks).toEqual([]);
  });

  it("heatmapCellColor returns correct classes", () => {
    expect(heatmapCellColor(0)).toBe("bg-bg-secondary/40");
    expect(heatmapCellColor(1)).toBe("bg-accent-blue/20");
    expect(heatmapCellColor(2)).toBe("bg-accent-blue/40");
    expect(heatmapCellColor(3)).toBe("bg-accent-blue/60");
    expect(heatmapCellColor(4)).toBe("bg-accent-blue/80");
    expect(heatmapCellColor(99)).toBe("bg-accent-blue/80");
  });

  it("searchAgents returns all agents for empty query", () => {
    const results = searchAgents(AGENTS, "");
    expect(results).toHaveLength(AGENTS.length);
  });

  it("searchAgents filters by name", () => {
    const firstName = AGENTS[0].name;
    const results = searchAgents(AGENTS, firstName);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((a) => a.name === firstName)).toBe(true);
  });

  it("searchAgents is case-insensitive", () => {
    const results = searchAgents(AGENTS, AGENTS[0].name.toLowerCase());
    expect(results.some((a) => a.id === AGENTS[0].id)).toBe(true);
  });

  it("searchAgents returns empty for unmatched query", () => {
    const results = searchAgents(AGENTS, "不存在的名字XYZ123");
    expect(results).toEqual([]);
  });

  it("highlightMatch returns single unmatched part for empty query", () => {
    const parts = highlightMatch("hello", "");
    expect(parts).toEqual([{ text: "hello", matched: false }]);
  });

  it("highlightMatch highlights matched fragments", () => {
    const parts = highlightMatch("Hello World", "world");
    expect(parts.length).toBe(2);
    expect(parts[0].matched).toBe(false);
    expect(parts[1].matched).toBe(true);
    expect(parts[1].text.toLowerCase()).toBe("world");
  });

  it("highlightMatch is case-insensitive", () => {
    const parts = highlightMatch("Hello World", "WORLD");
    expect(parts.some((p) => p.matched)).toBe(true);
  });

  it("highlightMatch handles multiple matches", () => {
    const parts = highlightMatch("ab ab ab", "ab");
    const matchedCount = parts.filter((p) => p.matched).length;
    expect(matchedCount).toBe(3);
  });

  it("computeDecisionPatterns aggregates correctly", () => {
    const pattern = computeDecisionPatterns(AGENTS);

    // 应有 4 个维度
    expect(Object.keys(pattern)).toEqual([
      "info_processing",
      "risk_preference",
      "social_tendency",
      "stress_response",
    ]);

    // 每个维度的计数总和应等于 AGENTS.length
    for (const dim of Object.keys(pattern)) {
      const total = Object.values(pattern[dim as keyof typeof pattern]).reduce(
        (a, b) => a + b,
        0,
      );
      expect(total).toBe(AGENTS.length);
    }
  });

  it("computeDecisionPatterns returns empty objects for empty input", () => {
    const pattern = computeDecisionPatterns([]);
    expect(pattern.info_processing).toEqual({});
    expect(pattern.risk_preference).toEqual({});
    expect(pattern.social_tendency).toEqual({});
    expect(pattern.stress_response).toEqual({});
  });

  it("DECISION_DIMENSION_LABELS has 4 entries with emoji", () => {
    expect(Object.keys(DECISION_DIMENSION_LABELS)).toHaveLength(4);
    for (const key of Object.keys(DECISION_DIMENSION_LABELS)) {
      const meta = DECISION_DIMENSION_LABELS[key as keyof typeof DECISION_DIMENSION_LABELS];
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.emoji.length).toBeGreaterThan(0);
    }
  });

  it("DECISION_OPTION_LABELS has entries for all dimensions", () => {
    // info_processing
    expect(DECISION_OPTION_LABELS.intuitive).toBeDefined();
    expect(DECISION_OPTION_LABELS.analytical).toBeDefined();
    expect(DECISION_OPTION_LABELS.balanced).toBeDefined();
    // risk_preference
    expect(DECISION_OPTION_LABELS.averse).toBeDefined();
    expect(DECISION_OPTION_LABELS.moderate).toBeDefined();
    expect(DECISION_OPTION_LABELS.seeking).toBeDefined();
    // social_tendency
    expect(DECISION_OPTION_LABELS.competitive).toBeDefined();
    expect(DECISION_OPTION_LABELS.cooperative).toBeDefined();
    expect(DECISION_OPTION_LABELS.independent).toBeDefined();
    // stress_response
    expect(DECISION_OPTION_LABELS.avoidant).toBeDefined();
    expect(DECISION_OPTION_LABELS.reactive).toBeDefined();
    expect(DECISION_OPTION_LABELS.adaptive).toBeDefined();
    expect(DECISION_OPTION_LABELS.resilient).toBeDefined();
  });
});
