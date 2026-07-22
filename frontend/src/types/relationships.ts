/** Canonical payload persisted in a relationship_change SSE event. */
export interface RelationshipChangeData {
  from: string;
  to: string;
  interaction: string;
  intensity: number;
  old_score: number;
  new_score: number;
}

/** One Agent node returned by the relationship snapshot endpoint. */
export interface RelationshipNode {
  id: string;
  name: string;
}

/** One directed relationship returned by the snapshot endpoint. */
export interface RelationshipEdgeSnapshot {
  source: string;
  target: string;
  score: number;
}

/** Response from GET /api/worlds/{worldId}/relationships. */
export interface RelationshipSnapshot {
  nodes: RelationshipNode[];
  edges: RelationshipEdgeSnapshot[];
}

/** Normalized directed relationship kept in the SSE store. */
export interface RelationshipState extends RelationshipEdgeSnapshot {
  interaction: string;
  lastChange: number;
}
