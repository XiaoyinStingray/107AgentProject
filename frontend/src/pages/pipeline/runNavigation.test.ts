import { describe, expect, it } from "vitest";

import { buildPipelineRunUrl, getRequestedPipelineId } from "./runNavigation";

describe("pipeline run navigation", () => {
  it("builds an encoded runner URL", () => {
    expect(buildPipelineRunUrl("pipe id/1")).toBe(
      "/pipeline?pipeline=pipe%20id%2F1",
    );
  });

  it("reads the requested pipeline ID", () => {
    expect(getRequestedPipelineId("?pipeline=pipe%20id%2F1")).toBe("pipe id/1");
  });

  it("returns null when no usable pipeline ID is present", () => {
    expect(getRequestedPipelineId("?pipeline=%20%20")).toBeNull();
    expect(getRequestedPipelineId("")).toBeNull();
  });
});
