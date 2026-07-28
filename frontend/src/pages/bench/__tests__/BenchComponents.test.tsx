/**
 * CompareView + OverlayHexagon 组件测试 — Step T3 / Layer 2。
 * 覆盖: 两组数据并排渲染、差异高亮、六维标签、图例展示。
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CompareView from "../../../components/bench/CompareView";
import OverlayHexagon from "../../../components/bench/OverlayHexagon";

const SCORES_A: Record<string, number> = {
  "人格一致性": 80, "决策质量": 70, "交互深度": 60,
  "鲁棒性": 90, "创造力": 50, "适应性": 65,
};

const SCORES_B: Record<string, number> = {
  "人格一致性": 75, "决策质量": 85, "交互深度": 55,
  "鲁棒性": 80, "创造力": 60, "适应性": 70,
};

// =====================================================================
// CompareView
// =====================================================================

describe("CompareView", () => {
  it("renders both labels in table header", () => {
    render(<CompareView scoresA={SCORES_A} scoresB={SCORES_B} labelA="Model X" labelB="Model Y" />);
    // Labels appear in both the legend and table header
    expect(screen.getAllByText("Model X").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Model Y").length).toBeGreaterThanOrEqual(1);
  });

  it("renders 6 dimension short names", () => {
    render(<CompareView scoresA={SCORES_A} scoresB={SCORES_B} labelA="A" labelB="B" />);
    const shortNames = ["一致性", "决策", "交互", "鲁棒", "创造", "适应"];
    shortNames.forEach((name) => {
      // Each name appears in both OverlayHexagon axis labels and table rows
      expect(screen.getAllByText(name).length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders correct score values", () => {
    render(<CompareView scoresA={SCORES_A} scoresB={SCORES_B} labelA="A" labelB="B" />);
    // SCORES_A 人格一致性 = 80
    expect(screen.getAllByText("80").length).toBeGreaterThan(0);
    // SCORES_B 决策质量 = 85
    expect(screen.getAllByText("85").length).toBeGreaterThan(0);
  });

  it("renders difference column with sign", () => {
    render(<CompareView scoresA={SCORES_A} scoresB={SCORES_B} labelA="A" labelB="B" />);
    // 人格一致性: A=80, B=75, diff=+5.0; 交互: A=60, B=55, diff=+5.0
    expect(screen.getAllByText("+5.0").length).toBeGreaterThanOrEqual(1);
  });

  it("renders OverlayHexagon inside", () => {
    const { container } = render(
      <CompareView scoresA={SCORES_A} scoresB={SCORES_B} labelA="A" labelB="B" />,
    );
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("handles equal scores without crash", () => {
    const same = { "人格一致性": 70, "决策质量": 70, "交互深度": 70, "鲁棒性": 70, "创造力": 70, "适应性": 70 };
    render(<CompareView scoresA={same} scoresB={same} labelA="A" labelB="B" />);
    // diff should be 0.0 for all
    expect(screen.getAllByText("0.0").length).toBe(6);
  });
});

// =====================================================================
// OverlayHexagon
// =====================================================================

describe("OverlayHexagon", () => {
  it("renders SVG with both polygons", () => {
    const { container } = render(
      <OverlayHexagon scoresA={SCORES_A} scoresB={SCORES_B} labelA="A" labelB="B" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    // At least 2 filled polygons (A + B) + 3 grid levels = 5
    const polygons = container.querySelectorAll("polygon");
    expect(polygons.length).toBeGreaterThanOrEqual(5);
  });

  it("renders legend with both labels", () => {
    render(<OverlayHexagon scoresA={SCORES_A} scoresB={SCORES_B} labelA="DeepSeek" labelB="GPT-5" />);
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.getByText("GPT-5")).toBeInTheDocument();
  });

  it("renders 6 axis labels", () => {
    render(<OverlayHexagon scoresA={SCORES_A} scoresB={SCORES_B} labelA="A" labelB="B" />);
    const labels = ["一致性", "决策", "交互", "鲁棒", "创造", "适应"];
    labels.forEach((l) => {
      expect(screen.getByText(l)).toBeInTheDocument();
    });
  });

  it("respects custom size", () => {
    const { container } = render(
      <OverlayHexagon scoresA={SCORES_A} scoresB={SCORES_B} labelA="A" labelB="B" size={500} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("500");
  });
});
