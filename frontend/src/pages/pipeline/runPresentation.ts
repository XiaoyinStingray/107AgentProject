export interface LoopProgress {
  iteration: number;
  maxIterations: number;
}

/** Human-readable text for a loop replay event. */
export function describeLoopProgress(progress: LoopProgress): string {
  return `条件命中，准备第 ${progress.iteration}/${progress.maxIterations} 次回放`;
}

/** Describe only what can be proven from existing SSE events. */
export function describeLoopFinish(progress: LoopProgress | null): string {
  if (!progress) return "未触发回边，管道按初始流程结束";
  if (progress.iteration < progress.maxIterations) {
    return `第 ${progress.iteration} 次回放后条件未再次触发，循环提前结束`;
  }
  return `已完成最大 ${progress.maxIterations} 次回放，管道使用最后一轮结果结束`;
}

/** Only text files can be previewed safely through the current API. */
export function isPreviewablePipelineFile(path: string): boolean {
  return /\.(md|markdown|txt|json|csv|yaml|yml)$/i.test(path);
}
