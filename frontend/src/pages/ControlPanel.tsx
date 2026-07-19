import { useMemo, useState } from "react";
import type { AgentResponse } from "../types/agent";
import type { SSEEvent } from "../types/events";
import type { ControlTab } from "../types/control";
import { MOCK_AGENTS } from "../mocks/agents";
import { MOCK_SANDBOX_EVENTS } from "../mocks/sandbox";
import { CONTROL_TABS } from "../mocks/control";
import { useAgentStore } from "../stores/useAgentStore";
import Badge from "../components/shared/Badge";
import EmptyState from "../components/shared/EmptyState";
import AgentDashboard from "../components/control/AgentDashboard";
import EventHeatmap from "../components/control/EventHeatmap";
import AgentSearch from "../components/control/AgentSearch";
import DecisionPatterns from "../components/control/DecisionPatterns";

/* ================================================================
   Step 24 — M6 控制台
   多 Agent 仪表盘 + 事件热力图 + Agent 搜索 + 决策模式识别。
   数据源：MOCK_AGENTS + MOCK_SANDBOX_EVENTS（与 GroupSandbox 同源）。
   ================================================================ */

export default function ControlPanel() {
  const agents = useAvailableAgents();
  const events: SSEEvent[] = MOCK_SANDBOX_EVENTS;
  const [activeTab, setActiveTab] = useState<ControlTab>("dashboard");

  const activeMeta = CONTROL_TABS.find((t) => t.key === activeTab);

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      {/* 标题 */}
      <h1 className="text-2xl font-mono text-accent-green mb-1">M6 控制台</h1>
      <p className="text-sm text-text-secondary font-mono mb-6">
        多 Agent 仪表盘 · 事件热力图 · Agent 搜索 · 决策模式识别
      </p>

      {/* Tab 栏 */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CONTROL_TABS.map((tab) => {
          const isActive = tab.available && tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              disabled={!tab.available}
              onClick={() => tab.available && setActiveTab(tab.key)}
              aria-pressed={isActive}
              className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-mono
                transition-colors duration-200
                ${!tab.available
                  ? "border-border bg-bg-secondary/40 text-text-secondary/40 cursor-not-allowed"
                  : isActive
                    ? "border-accent-green/60 bg-accent-green/10 text-accent-green"
                    : "border-border bg-bg-card text-text-secondary hover:border-text-secondary/40"
                }
              `.trim()}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              <Badge label={tab.priority} variant={tab.priority} />
            </button>
          );
        })}
      </div>

      {/* 当前 Tab 描述 */}
      {activeMeta && (
        <p className="text-xs text-text-secondary/60 font-mono mb-4">
          {activeMeta.description}
        </p>
      )}

      {/* Tab 内容 */}
      <div className="animate-fade-in">
        {activeTab === "dashboard" && (
          <AgentDashboard agents={agents} events={events} />
        )}
        {activeTab === "heatmap" && (
          <EventHeatmap agents={agents} events={events} />
        )}
        {activeTab === "search" && <AgentSearch agents={agents} />}
        {activeTab === "patterns" && <DecisionPatterns agents={agents} />}
        {(activeTab === "anomaly" ||
          activeTab === "tracking" ||
          activeTab === "strategy") && (
          <EmptyState
            title={`${activeMeta?.emoji ?? "🚧"} ${activeMeta?.label ?? "建设中"}`}
            description={activeMeta?.description ?? "此功能尚未实现"}
            tier="P3"
          />
        )}
      </div>
    </div>
  );
}

/* —— 工具函数 —— */

function useAvailableAgents(): AgentResponse[] {
  const createdAgents = useAgentStore((s) => s.agents);
  return useMemo(() => {
    const byId = new Map<string, AgentResponse>();
    [...MOCK_AGENTS, ...createdAgents].forEach((a) => byId.set(a.id, a));
    return [...byId.values()];
  }, [createdAgents]);
}
