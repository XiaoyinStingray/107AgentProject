/**
 * State 8: TeamHistory — 历史 Team 执行记录列表。
 */
import { useTeamHistory } from "../../api/teams";
import Card from "../shared/Card";
import Badge from "../shared/Badge";
import EmptyState from "../shared/EmptyState";
import { teamOutcomeLabel, teamOutcomeVariant } from "../../utils/teamOutcome";

interface Props {
  teamId: string;
}

export default function TeamHistory({ teamId }: Props) {
  const { data: plans = [], isLoading } = useTeamHistory(teamId);

  if (isLoading) {
    return <div className="text-xs font-mono text-text-secondary/60">加载历史记录…</div>;
  }

  if (plans.length === 0) {
    return <EmptyState title="暂无历史记录" description="执行 Team 任务后，记录会显示在这里" />;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-mono text-text-secondary mb-2">📚 历史执行 ({plans.length})</div>
      {plans.map((plan) => {
        const steps = plan.steps ?? [];
        const done = steps.filter((s: any) => s.status === "done").length;
        return (
          <Card key={plan.id} className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono text-text-primary truncate">{plan.task}</div>
                <div className="text-xs text-text-secondary/60 mt-0.5">
                  {done}/{steps.length} 步骤 · {plan.created_at?.slice(0, 10)}
                </div>
              </div>
              <Badge
                label={plan.status === "finished" ? teamOutcomeLabel(plan.outcome, plan.failed_steps ?? 0) : plan.status}
                variant={plan.status === "finished" ? teamOutcomeVariant(plan.outcome) : "P1"}
              />
            </div>
            {plan.report && (
              <div className="mt-2 text-xs text-text-secondary/70 line-clamp-2">
                {(plan.report as any).content?.slice(0, 200)}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
