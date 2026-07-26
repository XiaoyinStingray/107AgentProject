import type { PlanStep } from "../../types/team";
import Card from "../../components/shared/Card";

interface Props {
  steps: PlanStep[];
  agentNames: Record<string, string>;
  coordinatorMsg: string | null;
}

const COLUMNS = [
  { key: "pending", label: "TODO", bg: "bg-bg-secondary/60", dot: "bg-text-secondary/40" },
  { key: "active", label: "DOING", bg: "bg-accent-orange/5", dot: "bg-accent-orange animate-pulse" },
  { key: "done", label: "DONE", bg: "bg-accent-green/5", dot: "bg-accent-green" },
] as const;

export default function TaskKanban({ steps, agentNames, coordinatorMsg }: Props) {
  return (
    <div className="flex flex-col h-full">
      {coordinatorMsg && (
        <div className="mb-2 px-3 py-1.5 rounded border border-accent-orange/40 bg-accent-orange/5 text-xs font-mono text-accent-orange animate-fade-in">
          {coordinatorMsg}
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 flex-1 min-h-0">
        {COLUMNS.map((col) => {
          const items = steps.filter((s) => s.status === col.key);
          return (
            <div key={col.key} className={`rounded-lg p-3 ${col.bg} border border-border overflow-y-auto`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className="text-xs font-mono text-text-secondary">{col.label}</span>
                <span className="text-xs font-mono text-text-secondary/50 ml-auto">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((step) => (
                  <StepCard key={step.id} step={step} agentNames={agentNames} />
                ))}
                {items.length === 0 && (
                  <p className="text-xs font-mono text-text-secondary/40 text-center py-6">暂无</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepCard({ step, agentNames }: { step: PlanStep; agentNames: Record<string, string> }) {
  const name = step.assignee ? (agentNames[step.assignee] ?? step.assignee.slice(0, 8)) : "全员";
  return (
    <Card className="p-3">
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-mono text-text-primary leading-relaxed">{step.title}</span>
        {step.status === "active" && (
          <span className="text-xs font-mono text-accent-orange">{Math.round((step.progress || 0) * 100)}%</span>
        )}
        {step.status === "done" && <span className="text-xs font-mono text-accent-green">✓</span>}
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="w-4 h-4 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-[10px] shrink-0">
          {name.charAt(0)}
        </span>
        <span className="text-[11px] font-mono text-text-secondary/60 truncate">{name}</span>
      </div>
    </Card>
  );
}
