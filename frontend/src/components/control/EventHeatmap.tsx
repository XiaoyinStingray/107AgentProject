import type { EventHeatmapProps } from "../../types/control";
import { buildHeatmap, heatmapCellColor } from "../../mocks/control";
import Card from "../shared/Card";

/* ================================================================
   M6 控制台 — 事件热力图 (P2)
   Agent (行) × Tick (列) 矩阵，单元格颜色深度 = 事件数。
   ================================================================ */

export default function EventHeatmap({
  agents,
  events,
  className = "",
}: EventHeatmapProps) {
  const { cells, ticks } = buildHeatmap(agents, events);

  if (agents.length === 0 || ticks.length === 0) {
    return (
      <Card className={className}>
        <p className="text-sm text-text-secondary font-mono text-center py-6">
          暂无事件数据——无法生成热力图
        </p>
      </Card>
    );
  }

  // 构建查找表：agentId + tick → count
  const cellMap = new Map<string, number>();
  for (const cell of cells) {
    cellMap.set(`${cell.agentId}:${cell.tick}`, cell.count);
  }

  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-mono text-text-primary">
          🗺️ 事件密度矩阵
        </h2>
        <span className="text-xs font-mono text-text-secondary/60">
          {agents.length} Agents × {ticks.length} Ticks
        </span>
      </div>

      {/* 热力图矩阵——横向滚动 */}
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-bg-card px-2 py-1 text-xs font-mono text-text-secondary text-left">
                Agent
              </th>
              {ticks.map((tick) => (
                <th
                  key={tick}
                  className="px-2 py-1 text-xs font-mono text-text-secondary/70"
                >
                  #{tick}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td className="sticky left-0 z-10 bg-bg-card px-2 py-1.5 text-xs font-mono text-text-primary whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-accent-green/10 border border-accent-green/30 flex items-center justify-center text-xs shrink-0">
                      {agent.name.charAt(0)}
                    </span>
                    <span>{agent.name}</span>
                  </div>
                </td>
                {ticks.map((tick) => {
                  const count = cellMap.get(`${agent.id}:${tick}`) ?? 0;
                  return (
                    <td key={tick} className="p-0">
                      <div
                        role="gridcell"
                        aria-label={`${agent.name} Tick ${tick}: ${count} 事件`}
                        title={`${agent.name} · Tick #${tick} · ${count} 事件`}
                        className={`
                          w-10 h-10 rounded ${heatmapCellColor(count)}
                          flex items-center justify-center
                          text-xs font-mono transition-colors
                          ${count > 0 ? "text-text-primary" : "text-text-secondary/40"}
                        `.trim()}
                      >
                        {count}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 图例 */}
      <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-border">
        <span className="text-xs font-mono text-text-secondary/60">密度:</span>
        <LegendCell color="bg-bg-secondary/40" label="0" />
        <LegendCell color="bg-accent-blue/20" label="1" />
        <LegendCell color="bg-accent-blue/40" label="2" />
        <LegendCell color="bg-accent-blue/60" label="3" />
        <LegendCell color="bg-accent-blue/80" label="4+" />
      </div>
    </Card>
  );
}

function LegendCell({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`w-4 h-4 rounded ${color}`} />
      <span className="text-xs font-mono text-text-secondary/70">{label}</span>
    </div>
  );
}
