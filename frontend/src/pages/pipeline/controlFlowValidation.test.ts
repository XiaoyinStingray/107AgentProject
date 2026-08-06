import { describe, expect, it } from "vitest";

import {
  hasDuplicateControlFlowEdge,
  isBranchTargetDownstream,
  parseLoopMaxIterations,
} from "./controlFlowValidation";

describe("parseLoopMaxIterations", () => {
  it.each([
    ["1", 1],
    ["3", 3],
    ["10", 10],
  ])("accepts %s", (value, expected) => {
    expect(parseLoopMaxIterations(value)).toBe(expected);
  });

  it.each(["", "0", "11", "-1", "1.5", "abc"])("rejects %s", (value) => {
    expect(parseLoopMaxIterations(value)).toBeNull();
  });
});

describe("hasDuplicateControlFlowEdge", () => {
  const edges = [
    { source: "a", target: "b", data: { edge_type: "flow" } },
    { source: "b", target: "a", data: { edge_type: "loop", condition: " FAILED " } },
    { source: "a", target: "c", data: { edge_type: "branch", condition: "PASS" } },
  ];

  it("rejects an identical flow edge", () => {
    expect(hasDuplicateControlFlowEdge(edges, {
      source: "a", target: "b", edgeType: "flow",
    })).toBe(true);
  });

  it("rejects an identical loop edge after trimming its condition", () => {
    expect(hasDuplicateControlFlowEdge(edges, {
      source: "b", target: "a", edgeType: "loop", condition: "FAILED",
    })).toBe(true);
  });

  it("rejects an identical branch edge", () => {
    expect(hasDuplicateControlFlowEdge(edges, {
      source: "a", target: "c", edgeType: "branch", condition: "PASS",
    })).toBe(true);
  });

  it("allows branches with the same endpoints and different conditions", () => {
    expect(hasDuplicateControlFlowEdge(edges, {
      source: "a", target: "c", edgeType: "branch", condition: "FAILED",
    })).toBe(false);
  });
});

describe("isBranchTargetDownstream", () => {
  const edges = [
    { source: "a", target: "b", data: { edge_type: "flow" } },
    { source: "b", target: "c", data: { edge_type: "flow" } },
    { source: "c", target: "a", data: { edge_type: "loop" } },
    { source: "c", target: "d", data: { edge_type: "branch" } },
  ];

  it("accepts direct and transitive flow descendants", () => {
    expect(isBranchTargetDownstream(edges, "a", "b")).toBe(true);
    expect(isBranchTargetDownstream(edges, "a", "c")).toBe(true);
  });

  it("rejects an upstream target", () => {
    expect(isBranchTargetDownstream(edges, "c", "a")).toBe(false);
  });

  it("rejects a disconnected target", () => {
    expect(isBranchTargetDownstream(edges, "a", "d")).toBe(false);
  });

  it("does not treat loop or branch edges as the main flow", () => {
    expect(isBranchTargetDownstream(edges, "c", "d")).toBe(false);
    expect(isBranchTargetDownstream(edges, "c", "a")).toBe(false);
  });
});
