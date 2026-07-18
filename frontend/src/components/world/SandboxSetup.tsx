import type { AgentResponse } from "../../types/agent";
import type { Scenario } from "../../types/world";

interface SandboxSetupProps {
  agents: AgentResponse[];
  scenarios: Scenario[];
  selectedAgentIds: string[];
  selectedScenario: string;
  onToggleAgent: (agentId: string) => void;
  onSelectScenario: (scenario: string) => void;
  onStart: () => void;
}

/** 群体沙盒投放前的 Agent 与场景选择区。 */
export default function SandboxSetup({
  agents,
  scenarios,
  selectedAgentIds,
  selectedScenario,
  onToggleAgent,
  onSelectScenario,
  onStart,
}: SandboxSetupProps) {
  return (
    <div className="min-h-full p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <p className="text-xs font-mono text-accent-green mb-2">M3 / SANDBOX</p>
        <h1 className="text-2xl font-mono text-text-primary">群体投放</h1>
        <p className="text-sm text-text-secondary mt-2">
          选择多个 Agent 和一个场景，观察他们在同一世界中的互动。
        </p>
      </div>
      <AgentSelection
        agents={agents}
        selectedAgentIds={selectedAgentIds}
        onToggleAgent={onToggleAgent}
      />
      <ScenarioSelection
        scenarios={scenarios}
        selectedScenario={selectedScenario}
        onSelectScenario={onSelectScenario}
      />
      <button
        type="button"
        disabled={selectedAgentIds.length === 0}
        onClick={onStart}
        className="w-full rounded border border-accent-green/50 bg-accent-green/10 py-3 text-sm font-mono text-accent-green hover:bg-accent-green/20 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
      >
        开始群体模拟 · {selectedAgentIds.length} Agents
      </button>
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
}: Pick<SandboxSetupProps, "scenarios" | "selectedScenario" | "onSelectScenario">) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-mono text-text-secondary">选择场景</h2>
      <div className="grid grid-cols-3 gap-3">
        {scenarios.map((scenario) => {
          const name = scenario.name ?? "未命名场景";
          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelectScenario(name)}
              className={`text-left rounded border p-4 transition-colors ${
                selectedScenario === name
                  ? "border-accent-blue/60 bg-accent-blue/10"
                  : "border-border bg-bg-card hover:border-accent-blue/30"
              }`}
            >
              <p className="font-mono text-sm text-text-primary">{name}</p>
              <p className="text-xs text-text-secondary mt-2">
                {scenario.description}
              </p>
              <p className="text-xs text-accent-blue/70 font-mono mt-3">
                Tick {scenario.time_range}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
