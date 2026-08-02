import { useLocation, Link } from "react-router-dom";

/** 路由路径 → 面包屑名称映射 */
const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/agents": "铸造厂",
  "/theater": "单人剧场",
  "/sandbox": "群体沙盒",
  "/arena": "竞技场",
  "/narratives": "叙事工厂",
  "/control": "控制台",
  "/intervention": "干预台",
  "/archive": "档案馆",
  "/bench": "LLM Bench",
  "/worker": "Worker 工作台",
  "/duel": "Agent 实时 PK",
  "/showcase": "产出纪念墙",
  "/scene": "游戏化场景",
  "/team": "Agent Team",
};

/**
 * 顶部状态栏。
 * 左侧：产品名 + 版本；中间：面包屑；右侧：连接状态。
 */
export default function TopBar() {
  const { pathname } = useLocation();

  // 面包屑：取路由第一段
  const segment = "/" + (pathname.split("/")[1] || "");
  const pageLabel = ROUTE_LABELS[segment] ?? segment;

  return (
    <header className="h-12 border-b border-border flex items-center px-4 bg-bg-secondary shrink-0">
      {/* 产品名 — 点击回 Dashboard */}
      <Link
        to="/"
        className="font-mono text-sm text-accent-green tracking-wide hover:text-accent-green/80 transition-colors no-underline"
      >
        Life Lab v0.1.0
      </Link>
      <span className="ml-2 text-[10px] font-mono text-accent-green/50 border border-accent-green/20 rounded px-1 py-0.5">
        USTC
      </span>

      {/* 面包屑 */}
      <span className="ml-6 text-sm text-text-secondary font-mono">
        / {pageLabel}
      </span>

      {/* 右侧状态 */}
      <span className="ml-auto font-mono text-sm text-text-secondary flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-green shadow-[0_0_6px_#00ff88]" />
        READY
      </span>
    </header>
  );
}
