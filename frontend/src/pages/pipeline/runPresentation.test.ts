import { describe, expect, it } from "vitest";

import {
  describeLoopFinish,
  describeLoopProgress,
  isPreviewablePipelineFile,
} from "./runPresentation";

describe("pipeline run presentation", () => {
  it("describes live and early-finished loops", () => {
    expect(describeLoopProgress({ iteration: 2, maxIterations: 3 })).toContain("2/3");
    expect(describeLoopFinish({ iteration: 2, maxIterations: 3 })).toContain("提前结束");
  });

  it("does not claim an unproven PASS when all replays were used", () => {
    expect(describeLoopFinish({ iteration: 3, maxIterations: 3 })).toBe(
      "已完成最大 3 次回放，管道使用最后一轮结果结束",
    );
  });

  it("limits live previews to text formats", () => {
    expect(isPreviewablePipelineFile("draft.md")).toBe(true);
    expect(isPreviewablePipelineFile("review.JSON")).toBe(true);
    expect(isPreviewablePipelineFile("chart.png")).toBe(false);
  });
});
