import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import EmptyState from "../components/shared/EmptyState";
import LoadingSpinner from "../components/shared/LoadingSpinner";
import { useAgents } from "../api/agents";
import { useWorlds } from "../api/worlds";
import { useSimulations } from "../api/simulations";
import { useAchievements } from "../api/achievements";
import { useScenarios } from "../api/scenarios";
import { useExportReport } from "../api/export";
import { ACHIEVEMENTS, getUnlocked } from "../game/achievements";
import { convertSimEventsToSSE } from "../types/control";
import {
  ARCHIVE_TABS,
  formatReplayStatus,
  replayStatusColor,
  formatArchiveTime,
  generateMockReport,
  downloadAsFile,
} from "../mocks/archive";
import type { ArchiveTab } from "../types/archive";
import type { SSEEvent } from "../types/events";
import { client } from "../api/client";

/* ================================================================
   Step 45 — 档案馆页面 (M8)
   精彩回放 / 实验模板 / 成就系统 → 真实后端数据
   研究报告导出 — 保持已有真实 API
   ================================================================ */

export default function Archive() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<ArchiveTab>("highlights");

  // 72: hash → tab
  useEffect(() => {
    const h = location.hash?.replace("#", "");
    const MAP: Record<string, ArchiveTab> = { templates: "templates", achievements: "achievements", export: "export" };
    if (MAP[h]) setActiveTab(MAP[h]);
  }, [location.hash]);

  return (
    <div className="h-full overflow-y-auto p-6 animate-fade-in">
      <h1 className="text-2xl font-mono text-accent-green mb-1">
        M8 Agent 档案馆
      </h1>
      <p className="text-sm text-text-secondary font-mono mb-6">
        沉淀 · 分享 · 复用——模拟回放、实验模板、成就与报告导出
      </p>

      {/* Tab 栏 */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-3">
        {ARCHIVE_TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          return (
            <button
              key={tab.key}
              type="button"
              disabled={!tab.available}
              onClick={() => tab.available && setActiveTab(tab.key)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-mono transition-colors
                ${!tab.available
                  ? "text-text-secondary/40 cursor-not-allowed"
                  : isActive
                    ? "bg-accent-green/10 text-accent-green border border-accent-green/30"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-card border border-transparent"
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

      {/* 面板内容 */}
      {activeTab === "highlights" && <HighlightsPanel />}
      {activeTab === "templates" && <TemplatesPanel />}
      {activeTab === "achievements" && <AchievementsPanel />}
      {activeTab === "export" && <ExportPanel />}
    </div>
  );
}

/* ================================================================
   精彩回放面板 — Step 45: 使用真实 simulations API
   点击查看回放 → 展开卡片在线展示事件（不导航沙盒，不创建新内容）
   ================================================================ */

function HighlightsPanel() {
  const { data: simulations = [], isLoading } = useSimulations();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const lastTickRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 拉取 worldId 的事件（传 tickFrom 做增量刷新）。返回映射后的 SSEEvent[]。 */
  const fetchAndMapEvents = useCallback(async (worldId: string, tickFrom: number) => {
    const raw = await client.get<SSEEvent[]>(`/worlds/${worldId}/events?tick_from=${tickFrom}`);
    return raw.map((e) => {
      const r = e as unknown as Record<string, unknown>;
      const data = (r.data ?? {}) as Record<string, unknown>;
      const base: SSEEvent = {
        ...e,
        agent_id: (r.source_agent_id as string) ?? e.agent_id ?? "",
        agent_name: (data.agent_name as string) ?? e.agent_name ?? "",
        content: (r.description as string) ?? e.content ?? "",
        data,
      };
      if (e.type === "agent_message") {
        base.message = (data.message as string) ?? base.content;
        base.subtext = (data.subtext as string) ?? "";
        base.tone = (data.tone as string) ?? "neutral";
      } else if (e.type === "agent_action") {
        base.action = (data.action as string) ?? "";
        base.target = (data.target as string) ?? "";
      }
      return base;
    });
  }, []);

  /** 打开/关闭回放面板 */
  const handleToggleReplay = useCallback(async (worldId: string) => {
    if (expandedId === worldId) {
      setExpandedId(null);
      setEvents([]);
      lastTickRef.current = 0;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    setExpandedId(worldId);
    setEventsLoading(true);
    setEventsError(null);
    lastTickRef.current = 0;
    try {
      const mapped = await fetchAndMapEvents(worldId, 0);
      setEvents(mapped);
      if (mapped.length > 0) lastTickRef.current = mapped[mapped.length - 1].tick;
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : "加载事件失败");
    } finally {
      setEventsLoading(false);
    }
  }, [expandedId, fetchAndMapEvents]);

  /** 手动刷新（增量拉取新事件） */
  const handleRefresh = useCallback(async () => {
    if (!expandedId) return;
    setEventsError(null);
    try {
      const from = lastTickRef.current;
      const newEvents = await fetchAndMapEvents(expandedId, from);
      if (newEvents.length > 0) {
        setEvents((prev) => {
          // 按 id 去重合并
          const existingIds = new Set(prev.map((e) => e.id).filter(Boolean));
          const merged = [...prev, ...newEvents.filter((e) => !e.id || !existingIds.has(e.id))];
          return merged;
        });
        lastTickRef.current = newEvents[newEvents.length - 1].tick;
      }
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : "刷新失败");
    }
  }, [expandedId, fetchAndMapEvents]);

  // 展开中的模拟若还在运行 → 每 10s 自动拉增量事件
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (!expandedId) return;
    const sim = simulations.find((s) => s.world_id === expandedId);
    if (!sim || sim.status === "finished") return;
    pollRef.current = setInterval(() => { handleRefresh(); }, 10_000);
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [expandedId, simulations, handleRefresh]);

  if (isLoading) {
    return <LoadingSpinner title="加载模拟记录…" detail="从数据库读取中" />;
  }

  if (simulations.length === 0) {
    return <EmptyState title="暂无回放" description="完成一次模拟后，回放记录将出现在这里" />;
  }

  return (
    <div>
      <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
        🎬 模拟回放记录 ({simulations.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {simulations.map((sim) => {
          const status: "completed" | "paused" | "running" =
            sim.status === "finished" ? "completed" : sim.status === "paused" ? "paused" : "running";
          const isExpanded = expandedId === sim.world_id;
          return (
            <Card key={sim.id} hover className="group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg font-mono text-text-primary">
                  {sim.world_name || "未命名模拟"}
                </span>
                <span className={`text-xs font-mono ${replayStatusColor(status)}`}>
                  {formatReplayStatus(status)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mb-3">
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple/70 border border-accent-purple/20">
                  👥 {sim.agent_count} Agent
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs font-mono text-text-secondary">
                <span>⏱ {sim.total_ticks} Tick</span>
                <span>📋 {sim.event_count} 事件</span>
                <span className="ml-auto">{formatArchiveTime(sim.started_at)}</span>
              </div>
              <button
                type="button"
                onClick={() => handleToggleReplay(sim.world_id)}
                className="mt-3 w-full py-1.5 rounded-lg text-xs font-mono bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 transition-colors"
              >
                {isExpanded ? "🔼 收起回放" : "🔄 查看回放"}
              </button>

              {/* 展开的事件列表 */}
              {isExpanded && (
                <div className="mt-3 border-t border-border pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-text-secondary">
                      {eventsLoading ? "⏳ …" : `📋 ${events.length} 条事件`}
                    </span>
                    {sim.status !== "finished" && sim.status !== "paused" && (
                      <button
                        type="button"
                        onClick={handleRefresh}
                        className="text-xs font-mono px-2 py-0.5 rounded bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 transition-colors"
                      >
                        🔄 刷新
                      </button>
                    )}
                  </div>
                  {eventsError && (
                    <div className="text-xs font-mono text-accent-red py-2">{eventsError}</div>
                  )}
                  {!eventsLoading && events.length === 0 && !eventsError ? (
                    <div className="text-xs font-mono text-text-secondary py-4 text-center">
                      该模拟没有记录事件
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1.5">
                      {events
                        .filter((e) => e.type !== "tick_boundary" && e.type !== "connected" && e.type !== "paused")
                        .map((e, i) => (
                          <div
                            key={e.id ?? i}
                            className="text-xs font-mono p-1.5 rounded bg-bg-secondary/50 border border-border/50"
                          >
                            <span className="text-text-secondary/60">Tick {e.tick}</span>
                            {" · "}
                            <span className={
                              e.type === "agent_message" ? "text-accent-blue" :
                              e.type === "thought_stream" ? "text-accent-purple" :
                              e.type === "agent_action" ? "text-accent-orange" :
                              e.type === "world_event" ? "text-accent-green" :
                              "text-text-secondary"
                            }>
                              {e.type === "agent_message" ? "💬" :
                               e.type === "thought_stream" ? "💭" :
                               e.type === "agent_action" ? "🎬" :
                               e.type === "world_event" ? "🌍" : "📌"}
                              {" "}{e.agent_name ?? e.agent_id ?? ""}
                            </span>
                            <div className="text-text-secondary mt-0.5 line-clamp-2">
                              {e.content ?? e.message ?? e.action ?? e.description ?? ""}
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================
   实验模板面板 — Step 45: 使用真实 scenarios API
   ================================================================ */

function TemplatesPanel() {
  const { data: scenarios = [], isLoading } = useScenarios();
  const navigate = useNavigate();

  if (isLoading) {
    return <LoadingSpinner title="加载实验模板…" detail="从场景库读取中" />;
  }

  if (scenarios.length === 0) {
    return <EmptyState title="暂无模板" description="创建自定义场景后，模板将出现在这里" />;
  }

  return (
    <div>
      <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
        🧪 实验模板 ({scenarios.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {scenarios.map((sc, i) => {
          const tags = getScenarioTags(sc.name ?? "", sc.description ?? "");
          const agentEstimate = estimateAgentCount(sc);
          const tickEstimate = sc.time_range ?? "1-20";
          const isBuiltin = i < 3; // 前 3 个是内置场景
          return (
            <Card key={sc.id ?? `sc-${i}`} hover className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-mono text-text-primary">{sc.name ?? "未命名"}</h3>
                {isBuiltin && (
                  <span className="text-xs font-mono px-1 rounded bg-accent-green/10 text-accent-green/60 border border-accent-green/20">
                    内置
                  </span>
                )}
              </div>
              <p className="text-sm text-text-secondary mb-3 flex-1 line-clamp-2">
                {sc.description ?? ""}
              </p>
              <div className="flex flex-wrap gap-1 mb-3">
                {tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue/70 border border-accent-blue/20"
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs font-mono text-text-secondary mb-3">
                <span>👥 {agentEstimate} Agent</span>
                <span>⏱ {tickEstimate} Tick</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/theater", { state: { scenario: sc.name } })}
                  className="flex-1 py-2 rounded-lg text-sm font-mono bg-accent-purple/10 border border-accent-purple/30 text-accent-purple hover:bg-accent-purple/20 transition-colors"
                >
                  🎭 单人
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/sandbox", { state: { scenario: sc.name, agentCount: agentEstimate } })}
                  className="flex-1 py-2 rounded-lg text-sm font-mono bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/20 transition-colors"
                >
                  👥 多人
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================
   成就系统面板 — Step 45: 使用真实 achievements API
   ================================================================ */

function AchievementsPanel() {
  const { data, isLoading } = useAchievements();

  if (isLoading) {
    return <LoadingSpinner title="加载成就数据…" detail="从数据库统计中" />;
  }

  // 合并后端成就 + 前端 localStorage 成就
  const localUnlocked = getUnlocked();
  const backendAchievements = data?.achievements ?? [];
  const mergedAchievements = [
    ...backendAchievements,
    ...Object.values(ACHIEVEMENTS)
      .filter(a => !backendAchievements.some(b => b.id === a.id))
      .map(a => ({
        id: a.id,
        emoji: a.icon,
        title: a.title,
        description: a.desc,
        progress: localUnlocked.has(a.id) ? 1 : 0,
        unlocked: localUnlocked.has(a.id),
        unlockedAt: undefined as string | undefined,
      })),
  ];

  const summary = data?.summary ?? {
    totalAgents: 0,
    totalSimulations: 0,
    totalTicks: 0,
    totalNarratives: 0,
  };

  const unlockedCount = mergedAchievements.filter((a) => a.unlocked).length;

  return (
    <div>
      {/* 统计摘要 */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Agent 数", value: summary.totalAgents, emoji: "🎭" },
          { label: "模拟次数", value: summary.totalSimulations, emoji: "🏘️" },
          { label: "总 Tick", value: summary.totalTicks, emoji: "⏱" },
          { label: "叙事数", value: summary.totalNarratives, emoji: "📖" },
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <div className="text-2xl mb-1">{s.emoji}</div>
            <div className="text-xl font-mono text-accent-green">{s.value}</div>
            <div className="text-xs font-mono text-text-secondary">{s.label}</div>
          </Card>
        ))}
      </div>

      {/* 成就进度 */}
      <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
        🎖️ 成就 ({unlockedCount}/{mergedAchievements.length})
      </h2>
      {mergedAchievements.length === 0 ? (
        <EmptyState title="暂无成就" description="完成操作后将自动解锁成就" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {mergedAchievements.map((ach) => (
            <Card
              key={ach.id}
              className={`text-center ${ach.unlocked ? "" : "opacity-50"}`}
            >
              <div className={`text-3xl mb-2 ${ach.unlocked ? "" : "grayscale"}`}>
                {ach.emoji}
              </div>
              <h3 className="text-sm font-mono text-text-primary mb-1">{ach.title}</h3>
              <p className="text-xs text-text-secondary mb-2 line-clamp-2">{ach.description}</p>
              {/* 进度条 */}
              <div className="w-full h-1.5 rounded-full bg-bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${ach.unlocked ? "bg-accent-green" : "bg-accent-blue/50"}`}
                  style={{ width: `${Math.min(100, ach.progress * 100)}%` }}
                />
              </div>
              <span className="text-xs font-mono text-text-secondary mt-1">
                {ach.unlocked
                  ? "✅ 已解锁"
                  : `${Math.round(ach.progress * 100)}%`}
              </span>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   研究报告导出面板
   Step 27 更新：支持真实 API 导出（world-based）+ Mock 降级。
   ================================================================ */

function ExportPanel() {
  const { data: agents = [] } = useAgents();
  const { data: worlds = [] } = useWorlds();
  const [mode, setMode] = useState<"api" | "mock">(worlds.length > 0 ? "api" : "mock");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedWorldId, setSelectedWorldId] = useState("");
  const [format, setFormat] = useState<"markdown" | "json">("markdown");
  const [exported, setExported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const exportReport = useExportReport();

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const selectedWorld = worlds.find((w) => w.id === selectedWorldId);

  const handleApiExport = useCallback(async () => {
    if (!selectedWorldId) return;
    setError(null);
    try {
      const blob = await exportReport.mutateAsync({ worldId: selectedWorldId, format });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `report-${selectedWorldId}.${format === "markdown" ? "md" : "json"}`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    }
  }, [selectedWorldId, format, exportReport]);

  const handleMockExport = useCallback(() => {
    if (!selectedAgent) return;
    const content = format === "markdown"
      ? generateMockReport(selectedAgent.name)
      : JSON.stringify({ agent: selectedAgent.name, report: "mock" }, null, 2);
    const ext = format === "markdown" ? "md" : "json";
    const mime = format === "markdown" ? "text/markdown" : "application/json";
    downloadAsFile(content, `report-${selectedAgent.name}.${ext}`, mime);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  }, [selectedAgent, format]);

  return (
    <div>
      <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
        📄 导出研究报告
      </h2>

      <Card className="mb-6">
        {/* 数据源切换 */}
        <div className="mb-4">
          <label className="text-sm font-mono text-text-primary block mb-2">数据来源</label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={worlds.length === 0}
              onClick={() => setMode("api")}
              className={`
                px-4 py-2 rounded-lg text-sm font-mono transition-colors border
                ${mode === "api"
                  ? "border-accent-green/60 bg-accent-green/5 text-accent-green"
                  : "border-border text-text-secondary hover:border-text-secondary/40"
                }
                ${worlds.length === 0 ? "opacity-50 cursor-not-allowed" : ""}
              `.trim()}
            >
              🌐 模拟数据 ({worlds.length})
            </button>
            <button
              type="button"
              onClick={() => setMode("mock")}
              className={`
                px-4 py-2 rounded-lg text-sm font-mono transition-colors border
                ${mode === "mock"
                  ? "border-accent-green/60 bg-accent-green/5 text-accent-green"
                  : "border-border text-text-secondary hover:border-text-secondary/40"
                }
              `.trim()}
            >
              🎭 Agent 数据 (Mock)
            </button>
          </div>
          {worlds.length === 0 && (
            <p className="text-xs text-text-secondary/60 mt-1 font-mono">
              暂无运行中的模拟——使用 Mock 模式体验导出功能
            </p>
          )}
        </div>

        {/* 选择目标 */}
        {mode === "api" ? (
          <div className="mb-4">
            <label className="text-sm font-mono text-text-primary block mb-2">选择模拟世界</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {worlds.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setSelectedWorldId(w.id)}
                  className={`
                    text-left p-3 rounded-lg border transition-colors
                    ${w.id === selectedWorldId
                      ? "border-accent-green/60 bg-accent-green/5 ring-1 ring-accent-green/20"
                      : "border-border bg-bg-card hover:border-text-secondary/40"
                    }
                  `.trim()}
                >
                  <div className="font-mono text-sm text-text-primary">{w.name}</div>
                  <div className="text-xs text-text-secondary mt-1">
                    Tick {w.current_tick} · {w.status}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-4">
            <label className="text-sm font-mono text-text-primary block mb-2">选择 Agent</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedAgentId(agent.id)}
                  className={`
                    text-left p-3 rounded-lg border transition-colors
                    ${agent.id === selectedAgentId
                      ? "border-accent-green/60 bg-accent-green/5 ring-1 ring-accent-green/20"
                      : "border-border bg-bg-card hover:border-text-secondary/40"
                    }
                  `.trim()}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-xs select-none">
                      {agent.name.charAt(0)}
                    </div>
                    <span className="font-mono text-sm text-text-primary">{agent.name}</span>
                    <span className="ml-auto text-xs font-mono text-accent-purple/70">{agent.persona.mbti}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 格式选择 */}
        <div className="mb-4">
          <label className="text-sm font-mono text-text-primary block mb-2">导出格式</label>
          <div className="flex gap-2">
            {(["markdown", "json"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormat(f)}
                className={`
                  px-4 py-2 rounded-lg text-sm font-mono transition-colors border
                  ${format === f
                    ? "border-accent-green/60 bg-accent-green/5 text-accent-green"
                    : "border-border text-text-secondary hover:border-text-secondary/40"
                  }
                `.trim()}
              >
                {f === "markdown" ? "📝 Markdown" : "📋 JSON"}
              </button>
            ))}
          </div>
        </div>

        {/* 导出按钮 */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={mode === "api" ? (!selectedWorld || exportReport.isPending) : !selectedAgent}
            onClick={mode === "api" ? handleApiExport : handleMockExport}
            className={`
              px-6 py-2 rounded-lg text-sm font-mono transition-all
              ${(mode === "api" ? selectedWorld && !exportReport.isPending : selectedAgent)
                ? "bg-accent-green text-bg-primary hover:bg-accent-green/90"
                : "bg-bg-secondary border border-border text-text-secondary/40 cursor-not-allowed"
              }
            `.trim()}
          >
            {exportReport.isPending ? "⏳ 导出中..." : "📥 导出报告"}
          </button>
          {exported && (
            <span className="text-sm font-mono text-accent-green animate-fade-in">
              ✓ 报告已下载
            </span>
          )}
          {error && (
            <span className="text-sm font-mono text-accent-red animate-fade-in">
              ✗ {error}
            </span>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ================================================================
   工具函数
   ================================================================ */

/** 根据场景名和描述生成标签 */
function getScenarioTags(name: string, description: string): string[] {
  const tagMap: Record<string, string[]> = {
    "新生报到": ["社交", "初始关系", "低压"],
    "期末周": ["竞争", "压力", "资源争夺"],
    "毕业选择": ["人生转折", "多目标", "高压"],
  };
  if (tagMap[name]) return tagMap[name];
  // 从描述中提取关键词作为标签
  const keywords = ["社交", "竞争", "合作", "压力", "资源", "选择", "人生"];
  return keywords.filter((kw) => description.includes(kw)).slice(0, 3);
}

/** 估计场景建议的 Agent 数 */
function estimateAgentCount(sc: {
  name?: string;
  description?: string;
  initial_events?: string[];
  environment_params?: Record<string, unknown>;
}): number {
  const name = sc.name ?? "";
  if (name.includes("新生")) return 3;
  if (name.includes("期末")) return 2;
  if (name.includes("毕业")) return 4;
  // 有 initial_events 的场景默认 2-3 人
  if (sc.initial_events && sc.initial_events.length > 0) return 2;
  return 2;
}
