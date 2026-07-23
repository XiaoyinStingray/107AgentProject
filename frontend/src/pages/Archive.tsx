import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Card from "../components/shared/Card";
import Badge from "../components/shared/Badge";
import EmptyState from "../components/shared/EmptyState";
import { useAgents } from "../api/agents";
import { useWorlds } from "../api/worlds";
import {
  ARCHIVE_TABS,
  MOCK_REPLAYS,
  MOCK_TEMPLATES,
  MOCK_ACHIEVEMENTS,
  MOCK_ACHIEVEMENT_SUMMARY,
  formatReplayStatus,
  replayStatusColor,
  formatArchiveTime,
  generateMockReport,
  downloadAsFile,
} from "../mocks/archive";
import type { ArchiveTab } from "../types/archive";

/* ================================================================
   Step 25 — 档案馆页面 (M8)
   Agent 市场 · 精彩回放 · 实验模板 · 成就系统 · 报告导出
   前端 Mock 模式——后端 API 尚未实现。
   ================================================================ */

export default function Archive() {
  const [activeTab, setActiveTab] = useState<ArchiveTab>("highlights");

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
      {activeTab === "market" && (
        <EmptyState title="📦 Agent 市场" description="分享/下载社区创建的 Agent" tier="P3" />
      )}
      {activeTab === "dashboard" && (
        <EmptyState title="📊 社区数据大屏" description="全局统计数据与趋势分析" tier="P3" />
      )}
      {activeTab === "api" && (
        <EmptyState title="🔌 API 开放" description="通过 API 控制 Agent 与模拟" tier="P3" />
      )}
    </div>
  );
}

/* ================================================================
   精彩回放面板
   ================================================================ */

function HighlightsPanel() {
  const replays = MOCK_REPLAYS;
  const navigate = useNavigate();

  if (replays.length === 0) {
    return <EmptyState title="暂无回放" description="完成一次模拟后，回放记录将出现在这里" />;
  }

  return (
    <div>
      <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
        🎬 模拟回放记录 ({replays.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {replays.map((r) => (
          <Card key={r.id} hover className="group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-lg font-mono text-text-primary">{r.scenarioName}</span>
              <span className={`text-xs font-mono ${replayStatusColor(r.status)}`}>
                {formatReplayStatus(r.status)}
              </span>
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {r.agents.map((a) => (
                <span
                  key={a.id}
                  className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent-purple/10 text-accent-purple/70 border border-accent-purple/20"
                >
                  {a.name}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-xs font-mono text-text-secondary">
              <span>⏱ {r.totalTicks} Tick</span>
              <span>📋 {r.eventCount} 事件</span>
              <span className="ml-auto">{formatArchiveTime(r.createdAt)}</span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/sandbox", { state: { scenario: r.scenarioName } })}
              className="mt-3 w-full py-1.5 rounded-lg text-xs font-mono bg-accent-blue/10 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20 transition-colors"
            >
              🔄 查看回放
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   实验模板面板
   ================================================================ */

function TemplatesPanel() {
  const templates = MOCK_TEMPLATES;
  const navigate = useNavigate();

  return (
    <div>
      <h2 className="text-sm font-mono text-text-secondary uppercase tracking-wider mb-3">
        🧪 内置实验模板 ({templates.length})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {templates.map((tpl) => (
          <Card key={tpl.id} hover className="flex flex-col">
            <h3 className="text-base font-mono text-text-primary mb-1">{tpl.name}</h3>
            <p className="text-sm text-text-secondary mb-3 flex-1">{tpl.description}</p>
            <div className="flex flex-wrap gap-1 mb-3">
              {tpl.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent-blue/10 text-accent-blue/70 border border-accent-blue/20"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="flex items-center justify-between text-xs font-mono text-text-secondary mb-3">
              <span>👥 {tpl.suggestedAgents} Agent</span>
              <span>⏱ {tpl.estimatedTicks} Tick</span>
            </div>
            <button
              type="button"
              onClick={() => navigate("/sandbox", { state: { scenario: tpl.name } })}
              className="w-full py-2 rounded-lg text-sm font-mono bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/20 transition-colors"
            >
              使用模板
            </button>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ================================================================
   成就系统面板
   ================================================================ */

function AchievementsPanel() {
  const achievements = MOCK_ACHIEVEMENTS;
  const summary = MOCK_ACHIEVEMENT_SUMMARY;
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

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
        🎖️ 成就 ({unlockedCount}/{achievements.length})
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {achievements.map((ach) => (
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
                style={{ width: `${ach.progress * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono text-text-secondary mt-1">
              {ach.unlocked ? "✅ 已解锁" : `${Math.round(ach.progress * 100)}%`}
            </span>
          </Card>
        ))}
      </div>
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
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const selectedWorld = worlds.find((w) => w.id === selectedWorldId);

  const handleApiExport = useCallback(async () => {
    if (!selectedWorldId) return;
    setExporting(true);
    setError(null);
    try {
      const ext = format === "markdown" ? "" : "/json";
      const url = `/api/export/report/${selectedWorldId}${ext}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        const detail = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(detail.detail || "导出失败");
      }
      const blob = await resp.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `report-${selectedWorldId}.${format === "markdown" ? "md" : "json"}`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExported(true);
      setTimeout(() => setExported(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(false);
    }
  }, [selectedWorldId, format, selectedWorld]);

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
            disabled={mode === "api" ? (!selectedWorld || exporting) : !selectedAgent}
            onClick={mode === "api" ? handleApiExport : handleMockExport}
            className={`
              px-6 py-2 rounded-lg text-sm font-mono transition-all
              ${(mode === "api" ? selectedWorld && !exporting : selectedAgent)
                ? "bg-accent-green text-bg-primary hover:bg-accent-green/90"
                : "bg-bg-secondary border border-border text-text-secondary/40 cursor-not-allowed"
              }
            `.trim()}
          >
            {exporting ? "⏳ 导出中..." : "📥 导出报告"}
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

