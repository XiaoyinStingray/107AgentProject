import { useState } from "react";
import type { AgentResponse } from "../../types/agent";
import type { WorldResponse } from "../../types/world";
import { useScenarios, useDeleteScenario } from "../../api/scenarios";
import ScenarioEditor from "./ScenarioEditor";

interface SandboxSetupProps {
  agents: AgentResponse[];
  worlds: WorldResponse[];
  selectedAgentIds: string[];
  selectedScenario: string;
  isLoading?: boolean;
  error?: string | null;
  onToggleAgent: (agentId: string) => void;
  onSelectScenario: (scenario: string) => void;
  onStart: () => void;
  onResumeWorld: (worldId: string) => void;
  onDeleteWorld: (worldId: string) => void;
}

/** 群体沙盒投放前的 Agent 与场景选择区，含已有 World 列表。 */
export default function SandboxSetup({
  agents,
  worlds,
  selectedAgentIds,
  selectedScenario,
  isLoading = false,
  error = null,
  onToggleAgent,
  onSelectScenario,
  onStart,
  onResumeWorld,
  onDeleteWorld,
}: SandboxSetupProps) {
  const { data: scenarios = [] } = useScenarios();
  const deleteScenario = useDeleteScenario();
  const [showEditor, setShowEditor] = useState(false);
  return (
    <div className="min-h-full p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-mono text-accent-green mb-2">M3 / SANDBOX</p>
        <h1 className="text-2xl font-mono text-text-primary">群体投放</h1>
        <p className="text-sm text-text-secondary mt-2">
          选择多个 Agent 和一个场景，观察他们在同一世界中的互动。
        </p>
      </div>

      {/* ── 已有 World 列表 ── */}
      {worlds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-mono text-text-secondary">
            已有的实验 · {worlds.length} 个
          </h2>
          <div className="space-y-2">
            {worlds.map((world) => {
              const statusIcon =
                world.status === "running"
                  ? "🟢"
                  : world.status === "paused"
                    ? "⏸️"
                    : "⏹️";
              const canResume =
                world.status === "running" || world.status === "paused";
              return (
                <div
                  key={world.id}
                  className="flex items-center gap-3 rounded border border-border bg-bg-card px-4 py-3"
                >
                  <span className="text-sm select-none">{statusIcon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="font-mono text-sm text-text-primary">
                      {world.name}
                    </span>
                    <span className="ml-3 text-xs font-mono text-text-secondary/60">
                      Tick {world.current_tick} · {world.agent_ids.length} Agent
                      {world.agent_ids.length > 1 ? "s" : ""}
                    </span>
                  </div>
                  {canResume && (
                    <button
                      type="button"
                      onClick={() => onResumeWorld(world.id)}
                      className="text-xs font-mono text-accent-green hover:text-accent-green/80 transition-colors"
                    >
                      继续
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteWorld(world.id)}
                    className="text-xs font-mono text-accent-red/60 hover:text-accent-red transition-colors"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── 分隔 ── */}
      {worlds.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-border" />
          <span className="text-xs font-mono text-text-secondary/50">
            新建实验
          </span>
          <div className="flex-1 border-t border-border" />
        </div>
      )}

      {/* ── 新建表单 ── */}
      <AgentSelection
        agents={agents}
        selectedAgentIds={selectedAgentIds}
        onToggleAgent={onToggleAgent}
      />
      {error && (
        <p role="alert" className="text-sm text-accent-red font-mono">
          {error}
        </p>
      )}
      <ScenarioSelection
        scenarios={scenarios}
        selectedScenario={selectedScenario}
        onSelectScenario={onSelectScenario}
        onDeleteScenario={(id) => deleteScenario.mutate(id)}
        onNewScenario={() => setShowEditor(true)}
      />
      <button
        type="button"
        disabled={selectedAgentIds.length < 2 || isLoading}
        onClick={onStart}
        className="w-full rounded border border-accent-green/50 bg-accent-green/10 py-3 text-sm font-mono text-accent-green hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
      >
        {isLoading
          ? "正在加载 Agent..."
          : `开始群体模拟 · ${selectedAgentIds.length} Agents`}
      </button>

      {showEditor && <ScenarioEditor onClose={() => setShowEditor(false)} />}
    </div>
  );
}

function AgentSelection({
  agents,
  selectedAgentIds,
  onToggleAgent,
}: Pick<SandboxSetupProps, "agents" | "selectedAgentIds" | "onToggleAgent">) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-mono text-text-secondary">选择 Agent</h2>
      <div className="grid grid-cols-3 gap-3">
        {agents.length === 0 && (
          <p className="col-span-3 text-sm text-text-secondary">
            暂无可用 Agent，请先在铸造厂创建至少两个 Agent。
          </p>
        )}
        {agents.map((agent) => {
          const selected = selectedAgentIds.includes(agent.id);
          return (
            <button
              key={agent.id}
              type="button"
              onClick={() => onToggleAgent(agent.id)}
              className={`text-left rounded border p-3 transition-colors ${
                selected
                  ? "border-accent-green/60 bg-accent-green/10"
                  : "border-border bg-bg-card hover:border-accent-green/30"
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-lg select-none shrink-0">
                  {agent.name.charAt(0)}
                </div>
                <span className="font-mono text-sm text-text-primary">
                  {agent.name}
                </span>
                <span className="ml-auto text-xs text-text-secondary">
                  {selected ? "已选" : "未选"}
                </span>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                {agent.persona.mbti}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ScenarioSelection({
  scenarios,
  selectedScenario,
  onSelectScenario,
  onDeleteScenario,
  onNewScenario,
}: {
  scenarios: { id?: string | null; name?: string; description?: string; time_range?: string }[];
  selectedScenario: string;
  onSelectScenario: (name: string) => void;
  onDeleteScenario: (id: string) => void;
  onNewScenario: () => void;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-mono text-text-secondary">选择场景</h2>
        <button
          type="button"
          onClick={onNewScenario}
          className="text-xs font-mono text-accent-green hover:text-accent-green/80 transition-colors"
        >
          ＋ 新建场景
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {scenarios.map((scenario) => {
          const name = scenario.name ?? "未命名场景";
          const isCustom = !!scenario.id;
          return (
            <div key={name} className="relative">
              <button
                type="button"
                onClick={() => onSelectScenario(name)}
                className={`w-full text-left rounded border p-4 transition-colors ${
                  selectedScenario === name
                    ? "border-accent-blue/60 bg-accent-blue/10"
                    : "border-border bg-bg-card hover:border-accent-blue/30"
                }`}
              >
                <p className="font-mono text-sm text-text-primary pr-5">
                  {name}
                </p>
                <p className="text-xs text-text-secondary mt-2">
                  {scenario.description}
                </p>
                <p className="text-xs text-accent-blue/70 font-mono mt-3">
                  Tick {scenario.time_range}
                </p>
              </button>
              {isCustom && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteScenario(scenario.id!);
                  }}
                  className="absolute top-2 right-2 text-xs font-mono text-accent-red/50 hover:text-accent-red transition-colors"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
