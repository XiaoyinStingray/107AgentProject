/** Build the M12 runner URL for a saved pipeline. */
export function buildPipelineRunUrl(pipelineId: string): string {
  return `/pipeline?pipeline=${encodeURIComponent(pipelineId)}`;
}

/** Read the requested pipeline ID from the runner page query string. */
export function getRequestedPipelineId(search: string): string | null {
  const pipelineId = new URLSearchParams(search).get("pipeline")?.trim();
  return pipelineId || null;
}
