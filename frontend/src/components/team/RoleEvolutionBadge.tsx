/**
 * State 8: RoleEvolutionBadge — 角色演化通知浮层。
 */
import { useTeamStore } from "../../stores/useTeamStore";

export default function RoleEvolutionBadge() {
  const evolutions = useTeamStore((s) => s.evolutions);

  if (evolutions.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="text-xs font-mono text-text-secondary mb-1">🔄 角色演化</div>
      {evolutions.map((ev, i) => (
        <div
          key={`${ev.agent_id}-${i}`}
          className="rounded border border-accent-orange/30 bg-accent-orange/5 px-3 py-2 text-xs"
        >
          <span className="font-mono text-accent-orange">
            {(ev.agent_name || ev.name || ev.agent_id.slice(0, 8))}
          </span>
          <span className="text-text-secondary ml-1">
            {ev.old_role} → <span className="text-text-primary">{ev.new_role}</span>
          </span>
          <div className="text-text-secondary/50 mt-0.5">{ev.reason}</div>
        </div>
      ))}
    </div>
  );
}
