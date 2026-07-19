import type { AgentResponse } from "../../types/agent";
import type { ArenaMode, ArenaModeOption } from "../../types/arena";
import Badge from "../shared/Badge";
import Card from "../shared/Card";
import ArenaTopicPicker from "./ArenaTopicPicker";

interface ArenaSetupProps {
  agents: AgentResponse[];
  selectedAgentAId: string;
  selectedAgentBId: string;
  selectedMode: ArenaMode;
  topic: string;
  modeOptions: ArenaModeOption[];
  topicPresets: string[];
  canStart: boolean;
  onSelectAgentA: (agentId: string) => void;
  onSelectAgentB: (agentId: string) => void;
  onSelectMode: (mode: ArenaMode) => void;
  onChangeTopic: (topic: string) => void;
  onStart: () => void;
}

/** 1v1 竞技开始前的 Agent、模式与主题设置骨架。 */
export default function ArenaSetup({
  agents,
  selectedAgentAId,
  selectedAgentBId,
  selectedMode,
  topic,
  modeOptions,
  topicPresets,
  canStart,
  onSelectAgentA,
  onSelectAgentB,
  onSelectMode,
  onChangeTopic,
  onStart,
}: ArenaSetupProps) {
  const selectedAgentA = agents.find((agent) => agent.id === selectedAgentAId);
  const selectedAgentB = agents.find((agent) => agent.id === selectedAgentBId);

  return (
    <div className="min-h-full max-w-5xl mx-auto p-6 space-y-6 animate-fade-in motion-reduce:animate-none">
      <header>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs font-mono text-accent-orange">M4 / ARENA</p>
          <Badge label="P1" variant="P1" />
        </div>
        <h1 className="text-2xl font-mono text-text-primary">1v1 Agent 对抗</h1>
        <p className="text-sm text-text-secondary mt-2">
          让两个 Agent 在同一竞技场景中交锋，并由裁判给出结构化评分。
        </p>
      </header>

      <section aria-labelledby="arena-agent-heading" className="space-y-3">
        <h2 id="arena-agent-heading" className="text-sm font-mono text-text-secondary">
          选择参赛 Agent
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AgentSlot
            label="AGENT A"
            agents={agents}
            selectedAgentId={selectedAgentAId}
            disabledAgentId={selectedAgentBId}
            selectedAgent={selectedAgentA}
            accentClass="text-accent-blue"
            onSelect={onSelectAgentA}
          />
          <AgentSlot
            label="AGENT B"
            agents={agents}
            selectedAgentId={selectedAgentBId}
            disabledAgentId={selectedAgentAId}
            selectedAgent={selectedAgentB}
            accentClass="text-accent-purple"
            onSelect={onSelectAgentB}
          />
        </div>
      </section>

      <section aria-labelledby="arena-mode-heading" className="space-y-3">
        <h2 id="arena-mode-heading" className="text-sm font-mono text-text-secondary">
          选择竞技模式
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {modeOptions.map((option) => {
            const selected = option.value === selectedMode;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onSelectMode(option.value)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  selected
                    ? "border-accent-orange/60 bg-accent-orange/10"
                    : "border-border bg-bg-card hover:border-accent-orange/30"
                }`}
              >
                <span className="block text-sm font-mono text-text-primary">
                  {option.label}
                </span>
                <span className="block text-xs text-text-secondary mt-2">
                  {option.description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <ArenaTopicPicker
        mode={selectedMode}
        topic={topic}
        presets={topicPresets}
        onChange={onChangeTopic}
      />

      <button
        type="button"
        disabled={!canStart}
        onClick={onStart}
        className="w-full rounded border border-accent-orange/50 bg-accent-orange/10 py-3 text-sm font-mono text-accent-orange hover:bg-accent-orange/20 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
      >
        开始 1v1 竞技
      </button>
    </div>
  );
}

interface AgentSlotProps {
  label: string;
  agents: AgentResponse[];
  selectedAgentId: string;
  disabledAgentId: string;
  selectedAgent?: AgentResponse;
  accentClass: string;
  onSelect: (agentId: string) => void;
}

function AgentSlot({
  label,
  agents,
  selectedAgentId,
  disabledAgentId,
  selectedAgent,
  accentClass,
  onSelect,
}: AgentSlotProps) {
  return (
    <Card>
      <label className={`block text-xs font-mono mb-3 ${accentClass}`}>
        {label}
      </label>
      <select
        aria-label={label}
        value={selectedAgentId}
        onChange={(event) => onSelect(event.target.value)}
        className="w-full rounded border border-border bg-bg-secondary px-3 py-2 text-sm text-text-primary font-mono focus:border-accent-blue focus:outline-none"
      >
        {agents.map((agent) => (
          <option
            key={agent.id}
            value={agent.id}
            disabled={agent.id === disabledAgentId}
          >
            {agent.name} · {agent.persona.mbti}
          </option>
        ))}
      </select>
      <div className="mt-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full border border-border bg-bg-secondary flex items-center justify-center text-text-primary font-mono">
          {selectedAgent?.name.charAt(0) ?? "?"}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-mono text-text-primary">
            {selectedAgent?.name ?? "未选择"}
          </p>
          <p className="text-xs text-text-secondary mt-1">
            {selectedAgent?.persona.mbti ?? "等待 Agent"}
          </p>
        </div>
      </div>
    </Card>
  );
}
