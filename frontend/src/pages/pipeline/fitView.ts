import type { Edge, FitViewOptions } from "@xyflow/react";

const DEFAULT_PADDING = 0.18;
const CONTROL_FLOW_PADDING = 0.32;

type PipelineEdgeData = {
  edge_type?: unknown;
};

export function getPipelineFitViewOptions(
  edges: Array<Pick<Edge, "data">>,
): FitViewOptions {
  const hasControlFlowEdge = edges.some((edge) => {
    const edgeType = (edge.data as PipelineEdgeData | undefined)?.edge_type;
    return edgeType === "loop" || edgeType === "branch";
  });

  return {
    padding: hasControlFlowEdge ? CONTROL_FLOW_PADDING : DEFAULT_PADDING,
    minZoom: 0.25,
    maxZoom: 1.2,
    duration: 250,
  };
}
