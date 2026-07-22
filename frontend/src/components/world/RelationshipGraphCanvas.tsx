import { useMemo } from "react";
import type { AgentResponse } from "../../types/agent";
import type { RelationshipState } from "../../types/relationships";
import {
  NODE_RADIUS,
  SVG_SIZE,
  buildVisualEdges,
  computeRelationshipPositions,
  relationshipEdgeColor,
  relationshipEdgeWidth,
  relationshipPairKey,
} from "./relationshipGraphLayout";

interface RelationshipGraphCanvasProps {
  agents: AgentResponse[];
  relationships: RelationshipState[];
  highlightedPairKey: string | null;
}

/** Render the relationship graph SVG from normalized store data. */
export default function RelationshipGraphCanvas({
  agents,
  relationships,
  highlightedPairKey,
}: RelationshipGraphCanvasProps) {
  const edges = useMemo(
    () => buildVisualEdges(agents, relationships),
    [agents, relationships],
  );
  const positions = useMemo(
    () => computeRelationshipPositions(agents),
    [agents],
  );
  const positionById = useMemo(
    () => new Map(positions.map((position) => [position.agent.id, position])),
    [positions],
  );

  return (
    <svg
      viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
      className="w-full max-w-[360px] h-auto"
      role="img"
      aria-label="关系网络图"
    >
      {edges.map((edge) => {
        const positionA = positionById.get(edge.agentAId);
        const positionB = positionById.get(edge.agentBId);
        if (!positionA || !positionB) return null;
        const key = relationshipPairKey(edge.agentAId, edge.agentBId);
        const color = relationshipEdgeColor(edge.score);
        return (
          <g key={key}>
            <line
              x1={positionA.cx}
              y1={positionA.cy}
              x2={positionB.cx}
              y2={positionB.cy}
              stroke={color}
              strokeWidth={relationshipEdgeWidth(edge.score)}
              strokeOpacity={key === highlightedPairKey ? 1 : 0.6}
              className={key === highlightedPairKey ? "animate-pulse" : ""}
            />
            <text
              x={(positionA.cx + positionB.cx) / 2}
              y={(positionA.cy + positionB.cy) / 2 - 6}
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
  );
}
