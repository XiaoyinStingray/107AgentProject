import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import DirectorIntervention from "../../pages/DirectorIntervention";
import {
  INJECTION_TYPES,
  INTERVENTION_PLACEHOLDERS,
  MOCK_INTERVENTION_HISTORY,
  createInjectionRecord,
  getInjectionTypeMeta,
  formatInjectionTime,
  generateInjectionId,
} from "../../mocks/intervention";
import { MOCK_AGENTS } from "../../mocks/agents";
import type { InjectionEventType } from "../../types/intervention";

/* ================================================================
   Step 34c — M7 导演干预台组件测试（适配真实注入 API 路径）
   ================================================================ */

const { mockAgents } = vi.hoisted(() => ({
  mockAgents: [
    { id: "mock-1", name: "小明", persona: { mbti: "INTJ-T", narrative: "..." } },
    { id: "mock-2", name: "小红", persona: { mbti: "ENFP-A", narrative: "..." } },
    { id: "mock-3", name: "小刚", persona: { mbti: "ESTJ-A", narrative: "..." } },
  ],
}));

vi.mock("../../api/agents", () => ({
  useAgents: () => ({ data: mockAgents, isLoading: false, error: null }),
}));

// This component suite isolates intervention behavior; hash navigation is
// covered separately by useFeatureAnchor and Sidebar integration tests.
vi.mock("../../hooks/useFeatureAnchor", () => ({
  useFeatureAnchor: () => undefined,
}));

// 共享可变数组——模拟乐观更新：inject 后立即插入头部
const _interventionsByWorld = vi.hoisted(() => ({} as Record<string, any[]>));

vi.mock("../../api/worlds", () => ({
  useWorlds: () => ({
    data: [
      {
        id: "world-running",
        name: "运行中的 World",
        scenario: { name: "期末周" },
        agent_ids: ["mock-1", "mock-2"],
        current_tick: 5,
        status: "running",
      },
      {
        id: "world-idle",
        name: "空闲 World",
        scenario: { name: "新生报到" },
        agent_ids: ["mock-1"],
        current_tick: 0,
        status: "idle",
      },
    ],
  }),
  useInjectEvent: () => ({
    mutateAsync: ({
      worldId,
      type,
      description,
    }: {
      worldId: string;
      type?: string;
      targetAgentId?: string | null;
      description: string;
    }) => {
      // 模拟乐观更新：插入到共享数组头部
      const entry = {
        id: `inj-${Date.now()}`,
        world_id: worldId,
        type: type ?? "world_event",
        target_agent_id: null,
        target_agent_name: null,
        description,
        created_at: new Date().toISOString(),
      };
      if (!_interventionsByWorld[worldId]) {
        _interventionsByWorld[worldId] = MOCK_INTERVENTION_HISTORY.map((r) => ({
          id: r.id,
          world_id: worldId,
          type: r.type,
          target_agent_id: r.targetAgentId,
          target_agent_name: r.targetName,
          description: r.description,
          created_at: r.timestamp,
        }));
      }
      _interventionsByWorld[worldId].unshift(entry);
      return Promise.resolve({ status: "injected", intervention: entry });
    },
    isPending: false,
  }),
  useWorldInterventions: (_worldId: string | null) => {
    if (!_worldId) return { data: [] };
    if (!_interventionsByWorld[_worldId]) {
      _interventionsByWorld[_worldId] = MOCK_INTERVENTION_HISTORY.map((r) => ({
        id: r.id,
        world_id: _worldId,
        type: r.type,
        target_agent_id: r.targetAgentId,
        target_agent_name: r.targetName,
        description: r.description,
        created_at: r.timestamp,
      }));
    }
    return { data: _interventionsByWorld[_worldId] };
  },
}));

function selectRunningWorld() {
  fireEvent.click(screen.getByRole("button", { name: /运行中的 World/ }));
}

// 重置共享干预存储（避免测试间污染）
beforeEach(() => {
  for (const key of Object.keys(_interventionsByWorld)) {
    delete _interventionsByWorld[key];
  }
});

/* ---------- Layer 1: 组件渲染 + 交互 ---------- */

describe("Step 24 DirectorIntervention — 渲染与基础交互", () => {
  it("renders title and injection form", () => {
    render(<DirectorIntervention />);

    expect(screen.getByText("M7 导演干预台")).toBeInTheDocument();
    expect(screen.getByText("事件注入")).toBeInTheDocument();
  });

  it("renders 4 injection type buttons", () => {
    render(<DirectorIntervention />);

    expect(screen.getByRole("button", { name: /世界事件/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agent 消息/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Agent 行动/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /关系变化/ })).toBeInTheDocument();
  });

  it("renders description textarea with placeholder", () => {
    render(<DirectorIntervention />);

    expect(screen.getByPlaceholderText(/暴雨/)).toBeInTheDocument();
  });

  it("renders inject button", () => {
    render(<DirectorIntervention />);

    expect(screen.getByRole("button", { name: /注入事件/ })).toBeInTheDocument();
  });

  it("hides target agent selector for world_event (default)", () => {
    render(<DirectorIntervention />);

    // 默认 world_event——不应显示"目标 Agent"标签
    expect(screen.queryByText("目标 Agent")).not.toBeInTheDocument();
  });

  it("shows target agent selector when switching to agent_message", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    // 切到 agent_message
    fireEvent.click(screen.getByRole("button", { name: /Agent 消息/ }));

    expect(screen.getByText("目标 Agent")).toBeInTheDocument();
  });

  it("shows target agent selector for agent_action", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    fireEvent.click(screen.getByRole("button", { name: /Agent 行动/ }));
    expect(screen.getByText("目标 Agent")).toBeInTheDocument();
  });

  it("shows target agent selector for relationship_change", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    fireEvent.click(screen.getByRole("button", { name: /关系变化/ }));
    expect(screen.getByText("源 Agent（发起方）")).toBeInTheDocument();
  });

  it("renders available agents as target candidates", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    fireEvent.click(screen.getByRole("button", { name: /Agent 消息/ }));

    // 选中 World 的 agent_ids 为 ["mock-1", "mock-2"]，仅这两个 Agent 应显示为可选按钮
    // Agent 按钮中包含名字 + MBTI，如“小明 INTJ-T”
    expect(screen.getAllByText("小明").length).toBeGreaterThan(0);
    expect(screen.getAllByText("小红").length).toBeGreaterThan(0);
    // mock-3（小刚）不在选中 World 中，不应作为可选 Agent 按钮出现
    // 注意：小刚可能出现在干预历史中，但不应出现在 Agent 选择按钮中
    const gangButtons = screen.queryAllByRole("button", { name: /小刚/ });
    expect(gangButtons).toHaveLength(0);
  });
});

describe("Step 44 DirectorIntervention — 效果预览", () => {
  it("shows effect preview when description is filled", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    // 未填描述时无预览
    expect(screen.queryByText("效果预览")).not.toBeInTheDocument();

    // 填写描述后预览出现
    const textarea = screen.getByPlaceholderText(/暴雨/);
    fireEvent.change(textarea, { target: { value: "测试预览事件" } });

    expect(screen.getByText("效果预览")).toBeInTheDocument();
    // 文本同时存在于 textarea 和预览卡片中，用 getAllByText
    expect(screen.getAllByText("测试预览事件").length).toBeGreaterThanOrEqual(2);
  });

  it("shows no-world-selected hint in history when worldId is empty", () => {
    render(<DirectorIntervention />);

    expect(
      screen.getByText("请先选择一个 World 查看干预历史"),
    ).toBeInTheDocument();
  });
});

describe("Step 34c DirectorIntervention — 注入流程", () => {

  it("disables inject button when description is empty (world_event)", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    const injectBtn = screen.getByRole("button", { name: /注入事件/ });
    expect(injectBtn).toBeDisabled();
  });

  it("enables inject button when description is filled (world_event)", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    const textarea = screen.getByPlaceholderText(/暴雨/);
    fireEvent.change(textarea, { target: { value: "测试事件描述" } });

    const injectBtn = screen.getByRole("button", { name: /注入事件/ });
    expect(injectBtn).toBeEnabled();
  });

  it("disables inject button when needsTarget but no target selected", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    fireEvent.click(screen.getByRole("button", { name: /Agent 消息/ }));
    const textarea = screen.getByPlaceholderText(/班主任/);
    fireEvent.change(textarea, { target: { value: "测试消息" } });

    const injectBtn = screen.getByRole("button", { name: /注入事件/ });
    expect(injectBtn).toBeDisabled();
  });

  it("shows warning when needsTarget but no target selected", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    fireEvent.click(screen.getByRole("button", { name: /Agent 消息/ }));
    const textarea = screen.getByPlaceholderText(/班主任/);
    fireEvent.change(textarea, { target: { value: "测试消息" } });

    expect(screen.getByText("请选择目标 Agent")).toBeInTheDocument();
  });

  it("enables inject button when target selected and description filled", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    fireEvent.click(screen.getByRole("button", { name: /Agent 消息/ }));
    const textarea = screen.getByPlaceholderText(/班主任/);
    fireEvent.change(textarea, { target: { value: "测试消息" } });

    // 选第一个 Agent——用 button role 精确定位，避免历史记录中的同名匹配
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(MOCK_AGENTS[0].name) }),
    );

    const injectBtn = screen.getByRole("button", { name: /注入事件/ });
    expect(injectBtn).toBeEnabled();
  });

  it("injects world_event and adds to history", async () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    // 填写描述
    const textarea = screen.getByPlaceholderText(/暴雨/);
    fireEvent.change(textarea, { target: { value: "突然地震" } });

    // 点击注入（触发 API 调用）
    fireEvent.click(screen.getByRole("button", { name: /注入事件/ }));

    // 成功提示应出现（mocked API 立即返回）
    expect(await screen.findByText(/已注入/)).toBeInTheDocument();
  });

  it("injects agent_message with target and adds to history", async () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    // 切到 agent_message
    fireEvent.click(screen.getByRole("button", { name: /Agent 消息/ }));

    // 选目标 Agent——用 button role 精确定位
    fireEvent.click(
      screen.getByRole("button", { name: new RegExp(MOCK_AGENTS[0].name) }),
    );

    // 填描述
    const textarea = screen.getByPlaceholderText(/班主任/);
    fireEvent.change(textarea, { target: { value: "测试替 Agent 发消息" } });

    // 注入
    fireEvent.click(screen.getByRole("button", { name: /注入事件/ }));

    expect(await screen.findByText(/已注入/)).toBeInTheDocument();
  });

  it("clears description after injection", async () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    const textarea = screen.getByPlaceholderText(/暴雨/) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "测试事件" } });
    fireEvent.click(screen.getByRole("button", { name: /注入事件/ }));

    // 等待 API 调用完成
    await screen.findByText(/已注入/);
    expect(textarea.value).toBe("");
  });
});

describe("Step 24 DirectorIntervention — 干预历史", () => {
  it("renders initial mock history records", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    // 干预历史标题
    expect(screen.getByText("干预历史")).toBeInTheDocument();

    // 初始有 3 条 mock 历史
    expect(screen.getByText("3 条记录")).toBeInTheDocument();

    // mock 历史中的描述应出现
    expect(screen.getByText(/突然下起暴雨/)).toBeInTheDocument();
  });

  it("shows record count in history panel", () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    expect(screen.getByText(/条记录/)).toBeInTheDocument();
  });

  it("adds new injection to top of history (optimistic update)", async () => {
    render(<DirectorIntervention />);
    selectRunningWorld();

    // 初始 3 条
    expect(screen.getByText("3 条记录")).toBeInTheDocument();

    // 注入新事件
    const textarea = screen.getByPlaceholderText(/暴雨/);
    fireEvent.change(textarea, { target: { value: "新注入的测试事件" } });
    fireEvent.click(screen.getByRole("button", { name: /注入事件/ }));

    // 等待 API 调用完成
    await screen.findByText(/已注入/);
    // Step 44: 乐观更新——新记录直接插入缓存头部，立即显示 4 条
    expect(screen.getByText("4 条记录")).toBeInTheDocument();
  });
});

describe("Step 24 DirectorIntervention — P3 占位面板", () => {
  it("renders 5 P3 placeholder panels", () => {
    render(<DirectorIntervention />);

    // 5 个 P3 占位面板的标签
    expect(screen.getByText("上帝之声")).toBeInTheDocument();
    expect(screen.getByText("时间回溯")).toBeInTheDocument();
    expect(screen.getByText("分支探索")).toBeInTheDocument();
    expect(screen.getByText("人格篡改")).toBeInTheDocument();
    expect(screen.getByText("剧本模式")).toBeInTheDocument();
  });

  it("renders construction hint for placeholders", () => {
    render(<DirectorIntervention />);

    const hints = screen.getAllByText(/演示后可继续开发/);
    expect(hints).toHaveLength(INTERVENTION_PLACEHOLDERS.length);
  });
});

/* ---------- Layer 2: Mock 工具函数 ---------- */

describe("Step 24 — intervention mocks utilities", () => {
  it("INJECTION_TYPES has 4 entries", () => {
    expect(INJECTION_TYPES).toHaveLength(4);
    expect(INJECTION_TYPES.map((t) => t.key)).toEqual([
      "world_event",
      "agent_message",
      "agent_action",
      "relationship_change",
    ]);
  });

  it("INJECTION_TYPES world_event has needsTarget=false", () => {
    const worldEvent = INJECTION_TYPES.find((t) => t.key === "world_event");
    expect(worldEvent).toBeDefined();
    expect(worldEvent?.needsTarget).toBe(false);
  });

  it("INJECTION_TYPES agent_message/action/relationship have needsTarget=true", () => {
    const targeted = INJECTION_TYPES.filter((t) => t.key !== "world_event");
    for (const t of targeted) {
      expect(t.needsTarget).toBe(true);
    }
  });

  it("INTERVENTION_PLACEHOLDERS has 5 P3 entries", () => {
    expect(INTERVENTION_PLACEHOLDERS).toHaveLength(5);
    for (const p of INTERVENTION_PLACEHOLDERS) {
      expect(p.priority).toBe("P3");
      expect(p.available).toBe(false);
    }
  });

  it("MOCK_INTERVENTION_HISTORY has 3 entries", () => {
    expect(MOCK_INTERVENTION_HISTORY).toHaveLength(3);
  });

  it("MOCK_INTERVENTION_HISTORY entries have valid structure", () => {
    for (const record of MOCK_INTERVENTION_HISTORY) {
      expect(record.id).toBeDefined();
      expect(record.type).toBeDefined();
      expect(record.targetName).toBeDefined();
      expect(record.description).toBeDefined();
      expect(record.timestamp).toBeDefined();
      expect(record.status).toBe("applied");
    }
  });

  it("createInjectionRecord creates correct record", () => {
    const record = createInjectionRecord(
      "world_event",
      null,
      "世界",
      "测试描述",
    );

    expect(record.id).toMatch(/^inj-/);
    expect(record.type).toBe("world_event");
    expect(record.targetAgentId).toBeNull();
    expect(record.targetName).toBe("世界");
    expect(record.description).toBe("测试描述");
    expect(record.status).toBe("applied");
    expect(record.timestamp).toBeDefined();
  });

  it("createInjectionRecord creates unique ids", () => {
    const r1 = createInjectionRecord("world_event", null, "世界", "a");
    const r2 = createInjectionRecord("world_event", null, "世界", "b");
    expect(r1.id).not.toBe(r2.id);
  });

  it("getInjectionTypeMeta returns correct meta for known key", () => {
    const meta = getInjectionTypeMeta("world_event");
    expect(meta).toBeDefined();
    expect(meta?.key).toBe("world_event");
    expect(meta?.label).toBe("世界事件");
    expect(meta?.needsTarget).toBe(false);
  });

  it("getInjectionTypeMeta returns undefined for unknown key", () => {
    const meta = getInjectionTypeMeta("unknown" as InjectionEventType);
    expect(meta).toBeUndefined();
  });

  it("formatInjectionTime formats ISO to YYYY-MM-DD HH:MM", () => {
    const formatted = formatInjectionTime("2026-07-19T14:30:00Z");
    // 格式应为 YYYY-MM-DD HH:MM（时区取决于本地）
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });

  it("formatInjectionTime handles valid date", () => {
    const formatted = formatInjectionTime("2026-01-15T08:05:00Z");
    expect(formatted.length).toBe(16); // "YYYY-MM-DD HH:MM"
  });

  it("generateInjectionId returns unique ids with inj- prefix", () => {
    const id1 = generateInjectionId();
    const id2 = generateInjectionId();
    expect(id1).toMatch(/^inj-/);
    expect(id2).toMatch(/^inj-/);
    // 注意：理论上可能相同（极小概率），但实际应不同
    expect(id1).not.toBe(id2);
  });
});
