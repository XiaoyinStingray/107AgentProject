import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentResponse } from "../../types/agent";
import type { SSEEvent } from "../../types/events";
import Card from "../shared/Card";

/* ================================================================
   Step 21 — 关系网络图
   SVG 圆形布局 + 边颜色编码（绿/红/灰）+ 线宽动态变化 + 高亮动画。
   消费 relationship_change 类型 SSE 事件，展示 Agent 间双向量化关系。
   ================================================================ */

/** 从 SSE 事件流中聚合出的关系边数据。 */
export interface RelationshipEdge {
  agentAId: string;
  agentBId: string;
  score: number;
  lastInteraction: string;
  lastChange: number;
}

interface RelationshipGraphProps {
  agents: AgentResponse[];
  events: SSEEvent[];
  className?: string;
}

/** 节点圆形布局的计算坐标。 */
interface NodePosition {
  agent: AgentResponse;
  cx: number;
  cy: number;
}

// SVG 画板尺寸
const SVG_SIZE = 360;
const CENTER = SVG_SIZE / 2;
const RADIUS = 120;
const NODE_RADIUS = 24;

// 边颜色映射
function edgeColor(score: number): string {
  if (score > 0.05) return "#00ff88";
  if (score < -0.05) return "#ff4466";
  return "#8888aa";
}

function edgeLabel(score: number): string {
  if (score > 0.05) return "友好";
  if (score < -0.05) return "敌对";
  return "中立";
}

/** 边宽随 |score| 线性增长，范围 1.5–5px。 */
function edgeWidth(score: number): number {
  return 1.5 + Math.abs(score) * 3.5;
}

/** 从 SSE 事件流中聚合关系边——取每对 Agent 的最新 score。 */
function aggregateEdges(events: SSEEvent[]): RelationshipEdge[] {
  const map = new Map<string, RelationshipEdge>();

  for (const event of events) {
    if (event.type !== "relationship_change" || !event.data) continue;
    const agentA = event.data.agent_a as string | undefined;
    const agentB = event.data.agent_b as string | undefined;
    if (!agentA || !agentB) continue;

    // 规范化 key，确保 A↔B 和 B↔A 合并
    const key = [agentA, agentB].sort().join("::");
    const score = (event.data.score as number) ?? 0;
    const change = (event.data.change as number) ?? 0;
    const interaction = (event.data.interaction as string) ?? "neutral";

    map.set(key, {
      agentAId: agentA < agentB ? agentA : agentB,
      agentBId: agentA < agentB ? agentB : agentA,
      score,
      lastInteraction: interaction,
      lastChange: change,
    });
  }

  return [...map.values()];
}

/** 圆形布局——Agent 等分排列在圆周上。 */
function computePositions(agents: AgentResponse[]): NodePosition[] {
  const count = agents.length;
  if (count === 0) return [];
  // 从正上方开始，顺时针排列
  const startAngle = -Math.PI / 2;
  return agents.map((agent, index) => {
    const angle = startAngle + (2 * Math.PI * index) / count;
    return {
      agent,
      cx: CENTER + RADIUS * Math.cos(angle),
      cy: CENTER + RADIUS * Math.sin(angle),
    };
  });
}

export default function RelationshipGraph({
  agents,
  events,
  className = "",
}: RelationshipGraphProps) {
  const edges = useMemo(() => aggregateEdges(events), [events]);
  const positions = useMemo(() => computePositions(agents), [agents]);

  // 最近一条关系变化事件触发的边高亮
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const relEvents = events.filter((e) => e.type === "relationship_change");
  const lastRelEvent = relEvents.length > 0 ? relEvents[relEvents.length - 1] : undefined;

  useEffect(() => {
    if (!lastRelEvent?.data) return;
    const a = lastRelEvent.data.agent_a as string | undefined;
    const b = lastRelEvent.data.agent_b as string | undefined;
    if (!a || !b) return;
    const key = [a, b].sort().join("::");
    setHighlightKey(key);

    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightKey(null), 1200);
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, [lastRelEvent]);

  // 构建位置查找表
  const posMap = useMemo(() => {
    const m = new Map<string, NodePosition>();
    for (const p of positions) m.set(p.agent.id, p);
    return m;
  }, [positions]);

  if (agents.length < 2) {
    return (
      <Card className={`flex items-center justify-center ${className}`}>
        <p className="text-sm text-text-secondary font-mono">
          需要至少 2 个 Agent 才能展示关系网络
        </p>
      </Card>
    );
  }

  return (
    <Card className={`flex flex-col ${className}`}>
      <div className="px-4 py-3 border-b border-border -mx-5 -mt-5 mb-3">
        <h2 className="font-mono text-sm text-text-primary">
          RELATIONSHIP MAP
        </h2>
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center">
        <svg
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          className="w-full max-w-[360px] h-auto"
          role="img"
          aria-label="关系网络图"
        >
          {/* 边 */}
          {edges.map((edge) => {
            const posA = posMap.get(edge.agentAId);
            const posB = posMap.get(edge.agentBId);
            if (!posA || !posB) return null;

            const key = [edge.agentAId, edge.agentBId].sort().join("::");
            const isHighlighted = key === highlightKey;
            const color = edgeColor(edge.score);

            return (
              <g key={key}>
                <line
                  x1={posA.cx}
                  y1={posA.cy}
                  x2={posB.cx}
                  y2={posB.cy}
                  stroke={color}
                  strokeWidth={edgeWidth(edge.score)}
                  strokeOpacity={isHighlighted ? 1 : 0.6}
                  className={isHighlighted ? "animate-pulse" : ""}
                />
                {/* 分数标签 */}
                <text
                  x={(posA.cx + posB.cx) / 2}
                  y={(posA.cy + posB.cy) / 2 - 6}
                  textAnchor="middle"
                  fill={color}
                  fontSize={11}
                  fontFamily="monospace"
                >
                  {edge.score > 0 ? "+" : ""}
                  {edge.score.toFixed(2)}
                </text>
              </g>
            );
          })}

          {/* 节点 */}
          {positions.map(({ agent, cx, cy }) => (
            <g key={agent.id}>
              <circle
                cx={cx}
                cy={cy}
                r={NODE_RADIUS}
                fill="#1a1a26"
                stroke="#2a2a3a"
                strokeWidth={2}
              />
              <text
                x={cx}
                y={cy + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#e0e0e0"
                fontSize={14}
                fontFamily="monospace"
              >
                {agent.name.charAt(0)}
              </text>
              {/* 名字标签 */}
              <text
                x={cx}
                y={cy + NODE_RADIUS + 14}
                textAnchor="middle"
                fill="#8888aa"
                fontSize={11}
                fontFamily="monospace"
              >
                {agent.name}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* 图例 */}
      <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border">
        <LegendItem color="#00ff88" label="友好" />
        <LegendItem color="#8888aa" label="中立" />
        <LegendItem color="#ff4466" label="敌对" />
      </div>
    </Card>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-4 h-0.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs font-mono text-text-secondary">{label}</span>
    </div>
  );
}
