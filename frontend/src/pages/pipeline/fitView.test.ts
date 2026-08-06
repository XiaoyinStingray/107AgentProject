import { describe, expect, it } from "vitest";

import { getPipelineFitViewOptions } from "./fitView";

describe("getPipelineFitViewOptions", () => {
  it("uses normal padding for an empty pipeline", () => {
    expect(getPipelineFitViewOptions([])).toMatchObject({
      padding: 0.18,
      minZoom: 0.25,
      maxZoom: 1.2,
      duration: 250,
    });
  });

  it("uses normal padding for flow edges and missing edge types", () => {
    expect(getPipelineFitViewOptions([
      { data: { edge_type: "flow" } },
      { data: {} },
    ])).toMatchObject({ padding: 0.18 });
  });

  it("expands padding when the pipeline has a loop edge", () => {
    expect(getPipelineFitViewOptions([
      { data: { edge_type: "loop" } },
    ])).toMatchObject({ padding: 0.32 });
  });

  it("expands padding when the pipeline has a branch edge", () => {
    expect(getPipelineFitViewOptions([
      { data: { edge_type: "branch" } },
    ])).toMatchObject({ padding: 0.32 });
  });
});
