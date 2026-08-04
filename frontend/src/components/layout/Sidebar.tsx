import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Hammer,
  User,
  Users,
  Swords,
  BookOpen,
  BarChart3,
  Wand2,
  Archive,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
  LayoutDashboard,
  Terminal,
  Settings,
} from "lucide-react";
import Badge from "../shared/Badge";
import { MENU_SECTIONS } from "../../data/menuData";

/* ================================================================
   模块图标映射 —— M1–M8 对应 Lucide icon
   ================================================================ */

const SECTION_ICONS: Record<string, React.ReactNode> = {
  "M1 铸造厂": <Hammer size={16} />,
  "M2 单人剧场": <User size={16} />,
  "M3 群体沙盒": <Users size={16} />,
  "M4 竞技场": <Swords size={16} />,
  "M5 叙事工厂": <BookOpen size={16} />,
  "M6 控制台": <BarChart3 size={16} />,
  "M7 干预台": <Wand2 size={16} />,
  "M8 档案馆": <Archive size={16} />,
  "M9 Agent Team": <Users size={16} />,
  "M10 LLM Bench": <BarChart3 size={16} />,
  "M11 游戏化场景": <LayoutDashboard size={16} />,
  "M12 Worker": <Terminal size={16} />,
};

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  // 手风琴：同时只展开一个 section，null = 全部折叠
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <aside
      className={`
        bg-bg-secondary border-r border-border flex flex-col shrink-0
        transition-all duration-200 overflow-hidden
        ${collapsed ? "w-14" : "w-64"}
      `.trim()}
    >
      {/* 折叠按钮 */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="
          flex items-center justify-center h-10 border-b border-border
          text-text-secondary hover:text-text-primary transition-colors
        "
        title={collapsed ? "展开菜单" : "折叠菜单"}
      >
        {collapsed ? <PanelLeft size={14} /> : <PanelLeftClose size={14} />}
      </button>

      {/* 导航列表 */}
      <nav className="flex-1 overflow-y-auto py-1">
        {/* Dashboard — 返回主界面 */}
        <button
          onClick={() => navigate("/")}
          className={`
            w-full flex items-center gap-2 px-3 py-2 text-sm
            transition-colors duration-150
            ${pathname === "/"
              ? "border-l-2 border-accent-green bg-bg-card text-accent-green"
              : "border-l-2 border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-card/30"
            }
          `.trim()}
        >
          <LayoutDashboard size={16} className="shrink-0" />
          {!collapsed && (
            <span className="flex-1 text-left font-mono text-sm tracking-wide">
              Dashboard
            </span>
          )}
        </button>

        {MENU_SECTIONS.map((section, idx) => {
          const isExpanded = expandedIndex === idx;
          const isActive = pathname === section.route || pathname.startsWith(section.route + "/");

          return (
            <div key={section.title}>
              {/* Section Header */}
              <button
                onClick={() => {
                  if (collapsed) {
                    // 折叠模式：点击直接导航到模块首页
                    navigate(section.route);
                  } else {
                    setExpandedIndex(isExpanded ? null : idx);
                    navigate(section.route);
                  }
                }}
                className={`
                  w-full flex items-center gap-2 px-3 py-2 text-sm
                  transition-colors duration-150
                  ${isActive && expandedIndex === null
                    ? "border-l-2 border-accent-green bg-bg-card text-accent-green"
                    : isActive && !collapsed
                      ? "border-l-2 border-accent-green bg-bg-card/30 text-text-primary"
                      : "border-l-2 border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-card/30"
                  }
                `.trim()}
              >
                <span className="shrink-0">{SECTION_ICONS[section.title]}</span>
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left font-mono text-sm tracking-wide">
                      {section.title}
                    </span>
                    {isExpanded ? (
                      <ChevronDown size={12} className="shrink-0" />
                    ) : (
                      <ChevronRight size={12} className="shrink-0" />
                    )}
                  </>
                )}
              </button>

              {/* Sub Items */}
              {!collapsed && isExpanded && (
                <div className="bg-bg-primary/50 border-b border-border/50">
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        const it = item as any;
                        if (it.redirect) {
                          navigate(it.redirect);
                        } else if (it.anchor) {
                          navigate(`${section.route}#${it.anchor}`, { replace: true });
                        } else {
                          // 无锚点单页面：强制跳转
                          window.location.href = section.route;
                        }
                      }}
                      className="
                        w-full flex items-center gap-2 pl-10 pr-3 py-1.5 text-sm
                        text-text-secondary hover:text-text-primary hover:bg-bg-card/30
                        transition-colors duration-100
                      "
                    >
                      <span className="w-4 text-center shrink-0">{item.emoji}</span>
                      <span className="flex-1 text-left truncate">{item.label}</span>
                      <Badge label={item.priority} variant={item.priority} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Step 103: 设置入口 */}
      <div className="border-t border-border mt-auto">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-mono
            transition-colors duration-100
            ${pathname === "/settings"
              ? "text-accent-green bg-accent-green/10 border-r-2 border-accent-green"
              : "text-text-secondary hover:text-text-primary hover:bg-bg-card/30"
            }`}
        >
          <Settings size={16} />
          {!collapsed && <span>⚙️ 参数设置</span>}
        </button>
      </div>

      {/* 底部提示 */}
      {!collapsed && (
        <div className="border-t border-border px-3 py-2">
          <p className="text-xs font-mono text-text-secondary/60 leading-relaxed">
            P0: 6 · P1: 14 · P2: 19 · P3: 17
          </p>
          <p className="text-xs font-mono text-text-secondary/40">
            共 59 项功能菜单
          </p>
        </div>
      )}
    </aside>
  );
}
