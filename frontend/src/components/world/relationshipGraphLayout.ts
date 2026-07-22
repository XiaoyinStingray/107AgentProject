import type { AgentResponse } from "../../types/agent";
import type { RelationshipState } from "../../types/relationships";

export interface RelationshipVisualEdge {
  agentAId: string;
  agentBId: string;
  score: number;
}

export interface RelationshipNodePosition {
  agent: AgentResponse;
  cx: number;
  cy: number;
}

export const SVG_SIZE = 360;
export const NODE_RADIUS = 24;

/** Normalize two Agent IDs to one undirected visual pair key. */
export function relationshipPairKey(agentA: string, agentB: string): string {
  return [agentA, agentB].sort().join("::");
}

/** Average directed scores into the single edge supported by the current SVG. */
export function buildVisualEdges(
  agents: AgentResponse[],
  relationships: RelationshipState[],
): RelationshipVisualEdge[] {
  const scores = new Map<string, number[]>();
  for (const relationship of relationships) {
    const key = relationshipPairKey(relationship.source, relationship.target);
    scores.set(key, [...(scores.get(key) ?? []), relationship.score]);
  }

  const edges: RelationshipVisualEdge[] = [];
  for (let left = 0; left < agents.length; left += 1) {
    for (let right = left + 1; right < agents.length; right += 1) {
      const agentAId = agents[left].id;
      const agentBId = agents[right].id;
      const values = scores.get(relationshipPairKey(agentAId, agentBId)) ?? [];
      const score = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;
      edges.push({ agentAId, agentBId, score });
    }
  }
  return edges;
}

/** Place Agent nodes evenly around a circle. */
export function computeRelationshipPositions(
  agents: AgentResponse[],
): RelationshipNodePosition[] {
  const center = SVG_SIZE / 2;
  const radius = 120;
  return agents.map((agent, index) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * index) / agents.length;
    return {
      agent,
      cx: center + radius * Math.cos(angle),
      cy: center + radius * Math.sin(angle),
    };
  });
}

export function relationshipEdgeColor(score: number): string {
  if (score > 0.05) return "#00ff88";
  if (score < -0.05) return "#ff4466";
  return "#8888aa";
}

export function relationshipEdgeWidth(score: number): number {
  return 1.5 + Math.abs(score) * 3.5;
}
