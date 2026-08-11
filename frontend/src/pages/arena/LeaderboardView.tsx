import { useMemo } from "react";
import { useAgents } from "../../api/agents";
import { useArenas } from "../../api/arenas";
import { ARENA_SCORE_LABELS } from "../../constants/arena";
import Badge from "../../components/shared/Badge";
import Card from "../../components/shared/Card";
import EmptyState from "../../components/shared/EmptyState";
import LoadingSpinner from "../../components/shared/LoadingSpinner";
import type { ArenaApiResult } from "../../types/arena";


interface AgentStats {
  agentId: string;
  agentName: string;
  matches: number;
  wins: number;
  winRate: number;
  avgScore: number;
  bestScore: number;
  totalScore: number;
}


/** #27 排行榜：聚合所有竞技历史，按 Agent 统计胜率与平均分。 */
export default function LeaderboardView() {
  const { data: agents = [] } = useAgents();
  const { data: arenas = [], isLoading, error } = useArenas();

  const stats = useMemo(() => computeStats(agents, arenas ?? []), [agents, arenas]);
  const sorted = useMemo(
    () => [...stats].sort((a, b) => b.avgScore - a.avgScore || b.winRate - a.winRate),
    [stats],
  );

  if (isLoading) {
    return <LoadingSpinner icon="" title="正在计算排行榜…" fullscreen />;
  }

  if (error) {
    return (
      <div className="h-full p-6">
        <EmptyState
          title="排行榜加载失败"
          description={error instanceof Error ? error.message : "请稍后重试。"}
          tier="P2"
        />
      </div>
    );
  }

  if (arenas.length === 0) {
    return (
      <div className="h-full p-6">
        <EmptyState
          title="暂无竞技记录"
          description="完成至少一场竞技后，排行榜将自动更新。"
          tier="P2"
        />
      </div>
    );
  }

  return (
    <div className="min-h-full max-w-5xl mx-auto p-6 space-y-5 animate-fade-in motion-reduce:animate-none">
      <header>
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs font-mono text-accent-orange">M4 / LEADERBOARD</p>
          <Badge label="P2" variant="P2" />
        </div>
        <h1 className="text-2xl font-mono text-text-primary">竞技场排行榜</h1>
        <p className="text-sm text-text-secondary mt-2">
          基于 {arenas.length} 场竞技记录，按平均得分排序。
        </p>
      </header>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-mono">
            <thead>
              <tr className="border-b border-border text-text-secondary">
                <th className="text-left py-3 px-2">#</th>
                <th className="text-left py-3 px-2">Agent</th>
                <th className="text-right py-3 px-2">参赛</th>
                <th className="text-right py-3 px-2">胜场</th>
                <th className="text-right py-3 px-2">胜率</th>
                <th className="text-right py-3 px-2">平均分</th>
                <th className="text-right py-3 px-2">最高分</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((stat, index) => (
                <tr
                  key={stat.agentId}
                  className="border-b border-border/50 hover:bg-bg-secondary/50 transition-colors"
                >
                  <td className="py-3 px-2">
                    <RankBadge rank={index + 1} />
                  </td>
                  <td className="py-3 px-2 text-text-primary">{stat.agentName}</td>
                  <td className="py-3 px-2 text-right text-text-secondary">{stat.matches}</td>
                  <td className="py-3 px-2 text-right text-accent-green">{stat.wins}</td>
                  <td className="py-3 px-2 text-right text-text-primary">
                    {stat.winRate.toFixed(0)}%
                  </td>
                  <td className="py-3 px-2 text-right text-accent-orange font-bold">
                    {stat.avgScore.toFixed(1)}
                  </td>
                  <td className="py-3 px-2 text-right text-text-secondary">
                    {stat.bestScore}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="text-xs font-mono text-text-secondary text-center">
        评分标准：argument_quality + expression + adaptability + character_consistency（满分 40）
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-accent-orange font-bold">🥇</span>;
  if (rank === 2) return <span className="text-text-secondary font-bold">🥈</span>;
  if (rank === 3) return <span className="text-amber-700 font-bold">🥉</span>;
  return <span className="text-text-secondary">{rank}</span>;
}

function computeStats(
  agents: { id: string; name: string }[],
  arenas: ArenaApiResult[],
): AgentStats[] {
  const agentMap = new Map(agents.map((a) => [a.id, a.name]));
  const statsMap = new Map<string, AgentStats>();

  for (const agent of agents) {
    statsMap.set(agent.id, {
      agentId: agent.id,
      agentName: agent.name,
      matches: 0,
      wins: 0,
      winRate: 0,
      avgScore: 0,
      bestScore: 0,
      totalScore: 0,
    });
  }

  for (const arena of arenas) {
    for (const participantId of arena.participant_ids) {
      const stat = statsMap.get(participantId);
      if (!stat) continue;
      const score = arena.scores[participantId] ?? 0;
      stat.matches += 1;
      stat.totalScore += score;
      if (score > stat.bestScore) stat.bestScore = score;
      if (arena.winner_id === participantId) stat.wins += 1;
    }
  }

  for (const stat of statsMap.values()) {
    if (stat.matches > 0) {
      stat.avgScore = stat.totalScore / stat.matches;
      stat.winRate = (stat.wins / stat.matches) * 100;
    }
  }

  return Array.from(statsMap.values()).filter((s) => s.matches > 0);
}
