import type { DecisionPatternsProps } from "../../types/control";
import {
  computeDecisionPatterns,
  DECISION_DIMENSION_LABELS,
  DECISION_OPTION_LABELS,
} from "../../mocks/control";
import Card from "../shared/Card";

/* ================================================================
   M6 控制台 — 决策模式识别 (P2)
   展示 Agent 群体在 4 个决策维度上的风格分布。
   ================================================================ */

const DIMENSION_COLORS: Record<string, string> = {
  info_processing: "bg-accent-blue",
  risk_preference: "bg-accent-orange",
  social_tendency: "bg-accent-purple",
  stress_response: "bg-accent-green",
};

export default function DecisionPatterns({
  agents,
  className = "",
}: DecisionPatternsProps) {
  if (agents.length === 0) {
    return (
      <Card className={className}>
        <p className="text-sm text-text-secondary font-mono text-center py-6">
          暂无 Agent 数据——无法分析决策模式
        </p>
      </Card>
    );
  }

  const pattern = computeDecisionPatterns(agents);
  const dimensions = Object.keys(pattern) as (keyof typeof pattern)[];

  return (
    <div className={`space-y-4 ${className}`}>
      {/* 概览 */}
      <Card>
        <div className="flex items-center gap-3">
          <span className="text-2xl select-none">🧠</span>
          <div>
            <h2 className="text-sm font-mono text-text-primary">
              决策风格分布
            </h2>
            <p className="text-xs font-mono text-text-secondary/70 mt-0.5">
              基于 {agents.length} 个 Agent 的人格参数聚合
            </p>
          </div>
        </div>
      </Card>

      {/* 4 维决策风格柱状图 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {dimensions.map((dim) => (
          <DimensionChart
            key={dim}
            dimension={dim}
            distribution={pattern[dim]}
            total={agents.length}
          />
        ))}
      </div>

      {/* Agent 决策快照 */}
      <Card>
        <h2 className="text-sm font-mono text-text-primary mb-3">
          📋 Agent 决策快照
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="text-text-secondary/70 border-b border-border">
                <th className="text-left py-2 px-2">Agent</th>
                <th className="text-left py-2 px-2">信息处理</th>
                <th className="text-left py-2 px-2">风险偏好</th>
                <th className="text-left py-2 px-2">社交倾向</th>
                <th className="text-left py-2 px-2">压力应对</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => {
                const ds = agent.persona.decision_style;
                return (
                  <tr
                    key={agent.id}
                    className="border-b border-border/50 hover:bg-bg-secondary/40 transition-colors"
                  >
                    <td className="py-2 px-2 text-text-primary">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-xs shrink-0">
                          {agent.name.charAt(0)}
                        </span>
                        {agent.name}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-accent-blue/80">
                      {DECISION_OPTION_LABELS[ds.info_processing] ?? ds.info_processing}
                    </td>
                    <td className="py-2 px-2 text-accent-orange/80">
                      {DECISION_OPTION_LABELS[ds.risk_preference] ?? ds.risk_preference}
                    </td>
                    <td className="py-2 px-2 text-accent-purple/80">
                      {DECISION_OPTION_LABELS[ds.social_tendency] ?? ds.social_tendency}
                    </td>
                    <td className="py-2 px-2 text-accent-green/80">
                      {DECISION_OPTION_LABELS[ds.stress_response] ?? ds.stress_response}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function DimensionChart({
  dimension,
  distribution,
  total,
}: {
  dimension: keyof typeof DECISION_DIMENSION_LABELS;
  distribution: Record<string, number>;
  total: number;
}) {
  const meta = DECISION_DIMENSION_LABELS[dimension];
  const color = DIMENSION_COLORS[dimension] ?? "bg-accent-blue";
  const entries = Object.entries(distribution).sort(([, a], [, b]) => b - a);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg select-none">{meta.emoji}</span>
        <h3 className="text-sm font-mono text-text-primary">{meta.label}</h3>
      </div>
      <div className="space-y-2">
        {entries.map(([option, count]) => {
          const pct = total > 0 ? (count / total) * 100 : 0;
          const label = DECISION_OPTION_LABELS[option] ?? option;
          return (
            <div key={option}>
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-text-secondary">{label}</span>
                <span className="text-text-primary">
                  {count} / {total}
                </span>
              </div>
              <div className="h-2 bg-bg-primary rounded-full overflow-hidden">
                <div
                  className={`h-full ${color} rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
