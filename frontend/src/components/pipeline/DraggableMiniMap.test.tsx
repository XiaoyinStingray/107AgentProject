import { fireEvent, render, screen } from "@testing-library/react";
import { ReactFlow } from "@xyflow/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import DraggableMiniMap, { clampMiniMapPosition } from "./DraggableMiniMap";

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

describe("clampMiniMapPosition", () => {
  it("keeps the minimap inside the canvas gap", () => {
    expect(clampMiniMapPosition(
      { x: -40, y: 500 },
      { width: 188, height: 144 },
      { width: 800, height: 600 },
    )).toEqual({ x: 12, y: 444 });
  });
});

describe("DraggableMiniMap", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  });

  it("can collapse and expand without removing minimap navigation", () => {
    render(
      <div style={{ width: 800, height: 600 }}>
        <ReactFlow nodes={[]} edges={[]}>
          <DraggableMiniMap nodeColor="#6b7280" />
        </ReactFlow>
      </div>,
    );

    expect(screen.getByLabelText("折叠小地图")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("折叠小地图"));
    expect(screen.getByLabelText("展开小地图")).toBeInTheDocument();
    expect(localStorage.getItem("lifelab.pipeline.minimap.collapsed")).toBe("true");

    fireEvent.click(screen.getByLabelText("展开小地图"));
    expect(screen.getByLabelText("折叠小地图")).toBeInTheDocument();
  });

  it("moves with mouse events and clamps the result to the canvas", () => {
    render(
      <div style={{ width: 800, height: 600 }}>
        <ReactFlow nodes={[]} edges={[]}>
          <DraggableMiniMap nodeColor="#6b7280" />
        </ReactFlow>
      </div>,
    );

    const minimap = screen.getByTestId("draggable-minimap");
    const canvas = minimap.closest(".react-flow") as HTMLElement;
    Object.defineProperties(canvas, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 },
    });
    Object.defineProperties(minimap, {
      offsetWidth: { configurable: true, value: 188 },
      offsetHeight: { configurable: true, value: 144 },
    });
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 800, bottom: 600,
      width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}),
    });
    minimap.getBoundingClientRect = () => ({
      left: 600, top: 400, right: 788, bottom: 544,
      width: 188, height: 144, x: 600, y: 400, toJSON: () => ({}),
    });

    const handle = screen.getByLabelText("拖动小地图");
    fireEvent.mouseDown(handle, {
      button: 0, clientX: 620, clientY: 420,
    });
    fireEvent.mouseMove(window, { clientX: 760, clientY: 560 });
    fireEvent.mouseUp(window);

    expect(minimap).toHaveStyle({ left: "600px", top: "444px" });
  });

  it("starts collapsed on a narrow screen when no preference is stored", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));

    render(
      <div style={{ width: 480, height: 600 }}>
        <ReactFlow nodes={[]} edges={[]}>
          <DraggableMiniMap nodeColor="#6b7280" />
        </ReactFlow>
      </div>,
    );

    expect(screen.getByLabelText("展开小地图")).toBeInTheDocument();
  });
});
