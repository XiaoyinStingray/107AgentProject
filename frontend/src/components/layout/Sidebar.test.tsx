import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";

import Sidebar from "./Sidebar";


function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.hash}</output>;
}

function renderSidebar() {
  return render(
    <MemoryRouter
      initialEntries={["/"]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Sidebar />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("Sidebar feature navigation", () => {
  it.each([
    ["M1 铸造厂", "Agent Remix", "/agents#remix"],
    ["M1 铸造厂", "模板库", "/agents#models"],
    ["M2 单人剧场", "暂停/干预", "/theater#controls"],
    ["M2 单人剧场", "决策回放", "/archive#highlights"],
    ["M3 群体沙盒", "关系网络图", "/sandbox#relationships"],
    ["M7 干预台", "干预历史", "/intervention#history"],
    ["M11 游戏化场景", "导演模式", "/scene#director"],
    ["M12 Worker", "文件浏览器", "/worker#files"],
    ["M12 Worker", "决策分叉", "/worker#branches"],
  ])("opens %s / %s at its canonical target", (section, item, expected) => {
    renderSidebar();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(section) }));
    fireEvent.click(screen.getByRole("button", { name: new RegExp(item) }));
    expect(screen.getByTestId("location")).toHaveTextContent(expected);
  });
});
