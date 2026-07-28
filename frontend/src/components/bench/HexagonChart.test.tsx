/**
 * HexagonChart 组件测试 — Step T3 / Layer 2。
 * 覆盖: SVG 渲染 + 六维标签 + 分数显示 + 尺寸适配。
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HexagonChart from "./HexagonChart";

const MOCK_SCORES: Record<string, number> = {
  "人格一致性": 80,
  "决策质量": 70,
  "交互深度": 60,
  "鲁棒性": 90,
  "创造力": 50,
  "适应性": 65,
};

describe("HexagonChart", () => {
  it("renders SVG element", () => {
    const { container } = render(<HexagonChart scores={MOCK_SCORES} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders 6 dimension labels", () => {
    render(<HexagonChart scores={MOCK_SCORES} />);
    const labels = ["一致性", "决策", "交互", "鲁棒", "创造", "适应"];
    labels.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it("renders center average score", () => {
    // avg = (80+70+60+90+50+65)/6 = 69.17 → 69
    render(<HexagonChart scores={MOCK_SCORES} />);
    expect(screen.getByText("69分")).toBeInTheDocument();
  });

  it("renders score polygon", () => {
    const { container } = render(<HexagonChart scores={MOCK_SCORES} />);
    const polygons = container.querySelectorAll("polygon");
    // 3 background grid + 1 score polygon = 4
    expect(polygons.length).toBe(4);
  });

  it("respects custom size prop", () => {
    const { container } = render(<HexagonChart scores={MOCK_SCORES} size={300} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("300");
    expect(svg?.getAttribute("height")).toBe("300");
  });

  it("handles zero scores gracefully", () => {
    const zeroScores: Record<string, number> = {
      "人格一致性": 0, "决策质量": 0, "交互深度": 0,
      "鲁棒性": 0, "创造力": 0, "适应性": 0,
    };
    render(<HexagonChart scores={zeroScores} />);
    expect(screen.getByText("0分")).toBeInTheDocument();
  });

  it("handles perfect scores", () => {
    const perfectScores: Record<string, number> = {
      "人格一致性": 100, "决策质量": 100, "交互深度": 100,
      "鲁棒性": 100, "创造力": 100, "适应性": 100,
    };
    render(<HexagonChart scores={perfectScores} />);
    expect(screen.getByText("100分")).toBeInTheDocument();
  });
});
