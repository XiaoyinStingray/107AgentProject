import { Outlet, useLocation } from "react-router-dom";
import { findItemById, MENU_SECTIONS } from "../../data/menuData";
import Badge from "../shared/Badge";

/** 根据菜单 hash 决定显示模块页面或统一占位反馈。 */
export default function FeatureRouteBoundary() {
  const { hash, pathname } = useLocation();
  const itemId = parseFeatureItemId(hash);
  const selectedItem = itemId === null ? undefined : findItemById(itemId);
  const selectedSection = selectedItem
    ? MENU_SECTIONS.find((section) => section.title === selectedItem.sectionTitle)
    : undefined;
  const belongsToCurrentRoute = Boolean(
    selectedSection &&
      (pathname === selectedSection.route ||
        pathname.startsWith(`${selectedSection.route}/`)),
  );

  if (!selectedItem || !belongsToCurrentRoute) {
    return <Outlet />;
  }

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div
        role="status"
        aria-live="polite"
        className="shrink-0 flex items-center gap-2 border-b border-border bg-bg-secondary px-4 py-2"
      >
        <span aria-hidden="true">{selectedItem.emoji}</span>
        <span className="text-xs font-mono text-text-secondary">
          当前功能：{selectedItem.label}
        </span>
        <Badge label={selectedItem.priority} variant={selectedItem.priority} />
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}

/** 将 `#item-28` 形式的菜单 hash 解析为功能 ID。 */
export function parseFeatureItemId(hash: string): number | null {
  if (!/^#item-\d+$/.test(hash)) return null;
  const itemId = Number.parseInt(hash.slice(6), 10);
  return Number.isSafeInteger(itemId) && itemId > 0 ? itemId : null;
}
