export function parseLoopMaxIterations(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10 ? parsed : null;
}

type ControlFlowEdge = {
  source: string;
  target: string;
  data?: {
    edge_type?: unknown;
    condition?: unknown;
  } | null;
};

type DuplicateEdgeCandidate = {
  source: string;
  target: string;
  edgeType: "flow" | "loop" | "branch";
  condition?: string | null;
};

function normalizeCondition(condition: unknown): string {
  return typeof condition === "string" ? condition.trim() : "";
}

export function hasDuplicateControlFlowEdge(
  edges: ControlFlowEdge[],
  candidate: DuplicateEdgeCandidate,
): boolean {
  const candidateCondition = candidate.edgeType === "flow"
    ? ""
    : normalizeCondition(candidate.condition);

  return edges.some((edge) => {
    const edgeType = edge.data?.edge_type || "flow";
    const edgeCondition = edgeType === "flow"
      ? ""
      : normalizeCondition(edge.data?.condition);

    return edge.source === candidate.source
      && edge.target === candidate.target
      && edgeType === candidate.edgeType
      && edgeCondition === candidateCondition;
  });
}

export function isBranchTargetDownstream(
  edges: ControlFlowEdge[],
  source: string,
  target: string,
): boolean {
  if (source === target) return false;

  const flowTargets = new Map<string, Set<string>>();
  for (const edge of edges) {
    if ((edge.data?.edge_type || "flow") !== "flow") continue;
    const targets = flowTargets.get(edge.source) ?? new Set<string>();
    targets.add(edge.target);
    flowTargets.set(edge.source, targets);
  }

  const pending = [source];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    for (const child of flowTargets.get(current) ?? []) {
      if (child === target) return true;
      if (!visited.has(child)) pending.push(child);
    }
  }

  return false;
}
