import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";
import { MENU_SECTIONS } from "../../data/menuData";
import FeatureRouteBoundary, {
  parseFeatureItemId,
} from "./FeatureRouteBoundary";

function BoundaryLayout() {
  return (
    <>
      <Link to="/arena#item-22">打开 1v1</Link>
      <Link to="/arena#item-25">打开盲测</Link>
      <FeatureRouteBoundary />
    </>
  );
}

function renderBoundary(initialEntry: string) {
  return render(
    <MemoryRouter
      initialEntries={[initialEntry]}
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Routes>
        <Route path="/" element={<BoundaryLayout />}>
          <Route path="agents" element={<div>铸造厂正文</div>} />
          <Route path="sandbox" element={<div>群体沙盒正文</div>} />
          <Route path="arena" element={<div>竞技场正文</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("Step 28 parseFeatureItemId", () => {
  it.each([
    ["#item-1", 1],
    ["#item-56", 56],
    ["#item-0002", 2],
  ])("parses %s", (hash, expected) => {
    expect(parseFeatureItemId(hash)).toBe(expected);
  });

  it.each([
    "",
    "#item-",
    "#item-0",
    "#item--1",
    "#item-1.5",
    "#item-1-extra",
    "#ITEM-1",
    `#item-${"9".repeat(100)}`,
  ])("rejects malformed or unsafe hash %s", (hash) => {
    expect(parseFeatureItemId(hash)).toBeNull();
  });
});

describe("Step 28 FeatureRouteBoundary", () => {
  it("renders the module unchanged without a feature hash", () => {
    renderBoundary("/agents");
    expect(screen.getByText("铸造厂正文")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps P0-P2 module content and announces the selected feature", () => {
    renderBoundary("/agents#item-1");
    expect(screen.getByText("铸造厂正文")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "当前功能：创建 Agent",
    );
    expect(screen.getByText("P0")).toBeInTheDocument();
  });

  it("treats the implemented battle royale entry as P2 content", () => {
    renderBoundary("/arena#item-23");
    expect(screen.getByText("竞技场正文")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("当前功能：大乱斗");
    expect(screen.getByText("P2")).toBeInTheDocument();
  });

  it("ignores a feature hash that belongs to another module", () => {
    renderBoundary("/sandbox#item-23");
    expect(screen.getByText("群体沙盒正文")).toBeInTheDocument();
    expect(screen.queryByText("🏟️ 大乱斗")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps all menu IDs unique", () => {
    const items = MENU_SECTIONS.flatMap((section) => section.items);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
});
