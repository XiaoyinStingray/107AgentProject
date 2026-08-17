import { describe, expect, it } from "vitest";

import { getMenuItemTarget, MENU_SECTIONS } from "./menuData";


describe("menu navigation targets", () => {
  it("gives every P2 entry an explicit anchor or redirect", () => {
    const implicit = MENU_SECTIONS.flatMap((section) =>
      section.items
        .filter((item) => item.priority === "P2" && !item.anchor && !item.redirect)
        .map((item) => `${section.title}/${item.label}`),
    );
    expect(implicit).toEqual([]);
  });

  it.each([
    ["Agent Remix", "/agents#remix"],
    ["模板库", "/agents#models"],
    ["暂停/干预", "/theater#controls"],
    ["决策回放", "/archive#highlights"],
    ["关系网络图", "/sandbox#relationships"],
    ["事件注入", "/intervention#inject"],
    ["干预历史", "/intervention#history"],
    ["存档系统", "/scene#checkpoints"],
    ["导演模式", "/scene#director"],
    ["文件浏览器", "/worker#files"],
    ["决策分叉", "/worker#branches"],
    ["管道编辑器", "/pipeline-editor"],
  ])("maps %s to %s", (label, expected) => {
    const section = MENU_SECTIONS.find((candidate) =>
      candidate.items.some((item) => item.label === label),
    );
    const item = section?.items.find((candidate) => candidate.label === label);
    expect(section).toBeDefined();
    expect(item).toBeDefined();
    expect(getMenuItemTarget(section!, item!)).toBe(expected);
  });
});
