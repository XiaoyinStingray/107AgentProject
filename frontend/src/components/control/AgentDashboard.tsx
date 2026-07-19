import type { AgentDashboardProps } from "../../types/control";
import {
  computeAllAgentStats,
  computeSummary,
} from "../../mocks/control";
import Card from "../shared/Card";
import StatusDot from "../shared/StatusDot";

/* ================================================================
   M6 控制台 — 多 Agent 仪表盘 (P1)
   展示所有 Agent 的实时聚合状态：精力、情绪、行动计数。
   ================================================================ */

export default function AgentDashboard({
  agents,
  events,
  className = "",
}: AgentDashboardProps) {
  const summary = computeSummary(agents, events);
  const stats = computeAllAgentStats(agents, events);

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 顶部汇总 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Agent 数" value={summary.agentCount} emoji="👥" />
        <SummaryCard label="总事件数" value={summary.totalEvents} emoji="📡" />
        <SummaryCard label="总 Tick" value={summary.totalTicks} emoji="⏱️" />
        <SummaryCard
          label="行动/消息/思考"
          value={`${summary.totalActions}/${summary.totalMessages}/${summary.totalThoughts}`}
          emoji="⚡"
        />
      </div>

      {/* Agent 卡片网格 */}
      {stats.length === 0 ? (
        <Card>
          <p className="text-sm text-text-secondary font-mono text-center py-6">
            暂无 Agent 数据
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {stats.map((stat) => (
            <AgentStatCard key={stat.agentId} stat={stat} />
          ))}
        </div>
      )}
    </div>
  );
}

/* —— 子组件 —— */

function SummaryCard({
  label,
  value,
  emoji,
}: {
  label: string;
  value: string | number;
  emoji: string;
}) {
  return (
    <Card className="flex items-center gap-3">
      <span className="text-2xl select-none">{emoji}</span>
      <div>
        <p className="text-xs font-mono text-text-secondary">{label}</p>
        <p className="text-lg font-mono text-text-primary">{value}</p>
      </div>
    </Card>
  );
}

interface AgentStatCardProps {
  stat: ReturnType<typeof computeAllAgentStats>[number];
}

function AgentStatCard({ stat }: AgentStatCardProps) {
  const energyColor =
    stat.energy > 60
      ? "bg-accent-green"
      : stat.energy > 30
        ? "bg-accent-orange"
        : "bg-accent-red";

  return (
    <Card hover className="space-y-3">
      {/* 头部 */}
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-lg select-none shrink-0">
          {stat.agentName.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-sm text-text-primary truncate">
              {stat.agentName}
            </h3>
            <StatusDot
              status={stat.lastActiveTick > 0 ? "active" : "idle"}
              label=""
            />
          </div>
          <span className="text-xs font-mono text-accent-purple/70 bg-accent-purple/10 px-1.5 py-0.5 rounded">
            {stat.mbti}
          </span>
        </div>
      </div>

      {/* 精力条 */}
      <div>
        <div className="flex justify-between text-xs font-mono text-text-secondary mb-1">
          <span>⚡ 精力</span>
          <span>{stat.energy}%</span>
        </div>
        <div className="h-1.5 bg-bg-primary rounded-full overflow-hidden">
          <div
            className={`h-full ${energyColor} rounded-full transition-all duration-500`}
            style={{ width: `${stat.energy}%` }}
          />
        </div>
      </div>

      {/* 情绪 */}
      <p className="text-xs font-mono text-text-secondary">
        情绪: <span className="text-text-primary">{stat.emotionLabel}</span>
      </p>

      {/* 行动计数 */}
      <div className="grid grid-cols-4 gap-1 text-center">
        <CountCell label="行动" value={stat.actionCount} color="text-accent-orange" />
        <CountCell label="消息" value={stat.messageCount} color="text-accent-green" />
        <CountCell label="思考" value={stat.thoughtCount} color="text-accent-blue" />
        <CountCell label="关系" value={stat.relationCount} color="text-accent-purple" />
      </div>

      {/* 最后活跃 */}
      <p className="text-xs font-mono text-text-secondary/60">
        最后活跃: Tick #{stat.lastActiveTick}
      </p>
    </Card>
  );
}

function CountCell({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-bg-secondary/60 rounded py-1.5">
      <p className={`text-base font-mono ${color}`}>{value}</p>
      <p className="text-xs text-text-secondary/70">{label}</p>
    </div>
  );
}
