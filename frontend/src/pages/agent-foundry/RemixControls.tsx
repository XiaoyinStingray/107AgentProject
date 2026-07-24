import type { AgentResponse, BigFive } from "../../types/agent";
import type { BigFivePatch, RemixField } from "../../types/remix";
import Card from "../../components/shared/Card";
import { PRESERVE_OPTIONS, TRAIT_OPTIONS } from "./remixOptions";

interface RemixControlsProps {
  agents: AgentResponse[];
  selectedId: string;
  instruction: string;
  traitTargets: BigFivePatch;
  preserveFields: RemixField[];
  pending: boolean;
  onSelectAgent: (id: string) => void;
  onInstructionChange: (value: string) => void;
  onTraitChange: (key: keyof BigFive, value: number | null) => void;
  onTogglePreserve: (field: RemixField) => void;
  onPreview: () => void;
}

export default function RemixControls({
  agents,
  selectedId,
  instruction,
  traitTargets,
  preserveFields,
  pending,
  onSelectAgent,
  onInstructionChange,
  onTraitChange,
  onTogglePreserve,
  onPreview,
}: RemixControlsProps) {
  const source = agents.find((agent) => agent.id === selectedId) ?? agents[0];
  if (!source) return null;
  const bigFiveProtected = preserveFields.includes("big_five");
  const canPreview = Boolean(
    instruction.trim() || Object.keys(traitTargets).length > 0,
  );

  return (
    <Card className="space-y-5">
      <div>
        <label className="block text-sm font-mono text-text-secondary mb-2">
          原 Agent
        </label>
        <select
          aria-label="选择原 Agent"
          value={selectedId}
          onChange={(event) => onSelectAgent(event.target.value)}
          disabled={pending}
          className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary font-mono outline-none focus:border-accent-green/50"
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} · {agent.persona.mbti}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="remix-instruction" className="block text-sm font-mono text-text-secondary mb-2">
          修改要求
        </label>
        <textarea
          id="remix-instruction"
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder="例如：保留成长背景和目标，把性格改得更外向、更敢冒险"
          maxLength={500}
          rows={3}
          disabled={pending}
          className="w-full bg-bg-primary border border-border rounded px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary/50 resize-none outline-none focus:border-accent-green/50"
        />
        <p className="text-xs text-text-secondary/60 text-right">
          {instruction.length}/500
        </p>
      </div>

      <fieldset>
        <legend className="text-sm font-mono text-text-secondary mb-2">
          明确保留
        </legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESERVE_OPTIONS.map(([field, label]) => (
            <label key={field} className="flex items-center gap-2 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={preserveFields.includes(field)}
                onChange={() => onTogglePreserve(field)}
                disabled={pending}
                className="accent-accent-green"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={pending || bigFiveProtected}>
        <legend className="text-sm font-mono text-text-secondary mb-2">
          大五人格目标
        </legend>
        {bigFiveProtected && (
          <p className="text-xs text-accent-orange mb-2">
            已保护大五人格；取消保护后才能调整滑块。
          </p>
        )}
        <div className="space-y-3">
          {TRAIT_OPTIONS.map(([key, label]) => {
            const original = source.persona.big_five[key];
            const value = traitTargets[key] ?? original;
            const changed = traitTargets[key] !== undefined;
            return (
              <div key={key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className={changed ? "text-accent-green" : "text-text-secondary"}>
                    {label}
                  </span>
                  <span className="font-mono text-text-primary">
                    {value.toFixed(2)}
                    {changed && (
                      <button
                        type="button"
                        onClick={() => onTraitChange(key, null)}
                        className="ml-2 text-xs text-text-secondary hover:text-accent-red"
                      >
                        恢复
                      </button>
                    )}
                  </span>
                </div>
                <input
                  aria-label={`${label}目标值`}
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={value}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    onTraitChange(key, next === original ? null : next);
                  }}
                  className="w-full accent-accent-green"
                />
              </div>
            );
          })}
        </div>
      </fieldset>

      <button
        type="button"
        onClick={onPreview}
        disabled={!canPreview || pending}
        className="w-full py-2 rounded font-mono text-sm bg-accent-green/10 border border-accent-green/30 text-accent-green hover:bg-accent-green/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        {pending ? "正在生成预览…" : "生成 Remix 预览"}
      </button>
    </Card>
  );
}
