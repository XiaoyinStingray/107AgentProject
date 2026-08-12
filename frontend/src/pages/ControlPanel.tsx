import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import type { ControlTab } from "../types/control";
import { convertSimEventsToSSE } from "../types/control";
import { CONTROL_TABS } from "../mocks/control";
import { useAgents } from "../api/agents";
import { useWorlds, useWorldEvents } from "../api/worlds";
import Badge from "../components/shared/Badge";
import AgentDashboard from "../components/control/AgentDashboard";
import EventHeatmap from "../components/control/EventHeatmap";
import AgentSearch from "../components/control/AgentSearch";
import DecisionPatterns from "../components/control/DecisionPatterns";
import GroupDynamics from "../components/control/GroupDynamics";

/* ================================================================
   Step 24 → 36 → 43 → M6-fix — M6 控制台
   多 Agent 仪表盘 + 事件热力图 + Agent 搜索 + 决策模式识别。
   Agent 数据源：useAgents()（React Query 真实 API），按 World 过滤。
   Events 数据源：useWorldEvents()（Step 43 切真实数据）。
   ================================================================ */

/** 不需要 World 选择器的 Tab（自身有选择器或与 World 无关） */
const TABS_WITHOUT_WORLD_SELECTOR: ControlTab[] = ["search", "patterns", "dynamics"];

export default function ControlPanel() {
  const location = useLocation();
  const { data: agents = [] } = useAgents();
  const { data: worlds = [] } = useWorlds();
  const [activeTab, setActiveTab] = useState<ControlTab>("dashboard");

  // 72: hash → tab 映射
  useEffect(() => {
    const h = location.hash?.replace("#", "");
    const MAP: Record<string, ControlTab> = {
      dashboard: "dashboard", heatmap: "heatmap", search: "search",
      dynamics: "dynamics", decisions: "patterns",
      "item-21": "dynamics", // 旧格式兼容
    };
    if (MAP[h]) setActiveTab(MAP[h]);
  }, [location.hash]);
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(
    worlds[0]?.id ?? null,
  );

  // 选中 World 变化时同步 selectedWorldId
  const effectiveWorldId = selectedWorldId ?? worlds[0]?.id ?? null;
  const { data: simEvents = [] } = useWorldEvents(effectiveWorldId);
  const events = useMemo(() => convertSimEventsToSSE(simEvents), [simEvents]);

  // World 列表变化时自动选中第一个
  const worldIdForSelect = effectiveWorldId ?? "";

  // 按 World 过滤 Agent（只显示该 World 中包含的 Agent）
  const selectedWorld = worlds.find((w) => w.id === effectiveWorldId);
  const filteredAgents = useMemo(() => {
    if (!selectedWorld?.agent_ids || selectedWorld.agent_ids.length === 0) {
      return agents;
    }
    return agents.filter((a) => selectedWorld.agent_ids!.includes(a.id));
  }, [agents, selectedWorld]);

  const activeMeta = CONTROL_TABS.find((t) => t.key === activeTab);
  const showWorldSelector = !TABS_WITHOUT_WORLD_SELECTOR.includes(activeTab);

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      {/* 标题 */}
      <h1 className="text-2xl font-mono text-accent-green mb-1">M6 控制台</h1>
      <p className="text-sm text-text-secondary font-mono mb-6">
        多 Agent 仪表盘 · 事件热力图 · Agent 搜索 · 决策模式识别
      </p>

      {/* Tab 栏 */}
      <div className="flex flex-wrap gap-2 mb-4">
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

      {/* World 选择器（仅 dashboard / heatmap 显示） */}
      {showWorldSelector && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <label className="text-xs font-mono text-text-secondary">World:</label>
          <select
            value={worldIdForSelect}
            onChange={(e) => setSelectedWorldId(e.target.value || null)}
            className="bg-bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-accent-green"
          >
            {worlds.length === 0 && <option value="">暂无 World</option>}
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.status} · tick {w.current_tick})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 当前 Tab 描述 */}
      {activeMeta && (
        <p className="text-xs text-text-secondary/60 font-mono mb-4">
          {activeMeta.description}
        </p>
      )}

      {/* Tab 内容 */}
      <div className="animate-fade-in">
        {activeTab === "dashboard" && (
          <AgentDashboard agents={filteredAgents} events={events} />
        )}
        {activeTab === "heatmap" && (
          <EventHeatmap agents={filteredAgents} events={events} />
        )}
        {activeTab === "search" && <AgentSearch agents={agents} />}
        {activeTab === "patterns" && <DecisionPatterns agents={agents} />}
        {activeTab === "dynamics" && <GroupDynamics />}
      </div>
    </div>
  );
}

