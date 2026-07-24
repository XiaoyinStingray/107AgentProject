import type { AgentResponse } from "../../types/agent";
import type { RemixResponse } from "../../types/remix";
import Card from "../../components/shared/Card";
import PersonaRadar from "../../components/agent/PersonaRadar";

interface RemixPreviewProps {
  source: AgentResponse;
  preview: RemixResponse;
  pending: boolean;
  onCreate: () => void;
}

export default function RemixPreview({
  source,
  preview,
  pending,
  onCreate,
}: RemixPreviewProps) {
  return (
    <div className="space-y-4 animate-slide-in">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <p className="text-xs font-mono text-text-secondary mb-1">原角色</p>
          <h3 className="font-mono text-accent-blue">{source.name}</h3>
          <p className="text-sm text-text-secondary mt-2 line-clamp-4">
            {source.persona.narrative}
          </p>
          <PersonaRadar bigFive={source.persona.big_five} />
        </Card>
        <Card className="border-accent-green/30">
          <p className="text-xs font-mono text-accent-green mb-1">Remix 预览</p>
          <h3 className="font-mono text-accent-green">
            {preview.draft.persona.name}
          </h3>
          <p className="text-sm text-text-primary mt-2 line-clamp-4">
            {preview.draft.persona.narrative}
          </p>
          <PersonaRadar bigFive={preview.draft.persona.big_five} />
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-mono text-text-secondary mb-2">
          修改摘要
        </h3>
        {preview.summary && (
          <p className="text-sm text-text-primary mb-3">{preview.summary}</p>
        )}
        <ul className="space-y-2 max-h-56 overflow-auto">
          {preview.changes.map((change) => (
            <li key={change.field} className="text-xs border-l border-border pl-3">
              <p className="font-mono text-accent-purple">{change.field}</p>
              <p className="text-text-secondary truncate">
                {change.before} → {change.after}
              </p>
            </li>
          ))}
        </ul>
      </Card>

      <button
        type="button"
        onClick={onCreate}
        disabled={pending}
        className="w-full py-2 rounded font-mono text-sm bg-accent-green text-bg-primary hover:bg-accent-green/90 disabled:opacity-40 transition-colors"
      >
        {pending ? "正在创建副本…" : "确认创建 Remix 副本"}
      </button>
    </div>
  );
}
