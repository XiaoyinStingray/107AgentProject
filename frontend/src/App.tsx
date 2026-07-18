import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import AgentFoundry from "./pages/AgentFoundry";
import SoloTheater from "./pages/SoloTheater";
import SSEDebug from "./pages/debug/SSEDebug";
import EmptyState from "./components/shared/EmptyState";
import Badge from "./components/shared/Badge";
import { findItemById } from "./data/menuData";

/**
 * 占位页面——解析 URL hash（如 #item-25），显示对应功能项名称。
 * 后续 Step 逐模块替换为完整页面。
 */
function PlaceholderPage({
  title,
  description,
  tier,
}: {
  title: string;
  description: string;
  tier?: "P0" | "P1" | "P2" | "P3";
}) {
  const { hash } = useLocation();

  // 解析 hash: "#item-25" → id=25 → 查找对应功能项
  const itemId = hash.startsWith("#item-") ? parseInt(hash.slice(6), 10) : null;
  const selectedItem = itemId ? findItemById(itemId) : null;

  return (
    <div className="h-full flex items-center justify-center">
      {selectedItem ? (
        /* 选中了具体功能项——展示功能名 + 所属模块 */
        <div className="flex flex-col items-center gap-3">
          <span className="text-4xl">{selectedItem.emoji}</span>
          <div className="text-center">
            <h2 className="text-xl font-mono text-text-primary mb-1">
              {selectedItem.label}
            </h2>
            <p className="text-sm text-text-secondary font-mono mb-3">
              {selectedItem.sectionTitle}
              <Badge
                label={selectedItem.priority}
                variant={selectedItem.priority}
                className="ml-2"
              />
            </p>
          </div>
          <EmptyState title="🚧 建设中" description={description} />
        </div>
      ) : (
        /* 未选中具体功能项——模块默认占位 */
        <EmptyState title={title} description={description} tier={tier} />
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          {/* Dashboard */}
          <Route index element={<Home />} />

          {/* M1 铸造厂 */}
          <Route path="agents" element={<AgentFoundry />} />
          <Route
            path="agents/:id"
            element={
              <PlaceholderPage
                title="Agent 详情"
                description="人格雷达图、记忆时间线、决策记录"
                tier="P1"
              />
            }
          />

          {/* M2 单人剧场 */}
          <Route path="theater" element={<SoloTheater />} />

          {/* M3 群体沙盒 */}
          <Route
            path="sandbox"
            element={
              <PlaceholderPage
                title="M3 群体沙盒"
                description="群体投放 · Agent 间对话 · 关系演化 · 竞争博弈"
                tier="P0"
              />
            }
          />

          {/* M4 竞技场 */}
          <Route
            path="arena"
            element={
              <PlaceholderPage
                title="M4 竞技场"
                description="1v1 对抗 · 大乱斗 · 战报生成 · 复盘对比"
                tier="P1"
              />
            }
          />

          {/* M5 叙事工厂 */}
          <Route
            path="narratives"
            element={
              <PlaceholderPage
                title="M5 叙事工厂"
                description="小说化叙事 · 未来的信 · 平行对话 · 播客脚本"
                tier="P1"
              />
            }
          />

          {/* M6 控制台 */}
          <Route
            path="control"
            element={
              <PlaceholderPage
                title="M6 观察者控制台"
                description="多 Agent 仪表盘 · 事件热力图 · Agent 搜索 · 决策模式识别"
                tier="P1"
              />
            }
          />

          {/* M7 干预台 */}
          <Route
            path="intervention"
            element={
              <PlaceholderPage
                title="M7 导演干预台"
                description="事件注入 · 上帝之声 · 时间回溯 · 人格篡改"
                tier="P2"
              />
            }
          />

          {/* M8 档案馆 */}
          <Route
            path="archive"
            element={
              <PlaceholderPage
                title="M8 Agent 档案馆"
                description="Agent 市场 · 精彩回放 · 实验模板 · 研究报告导出"
                tier="P2"
              />
            }
          />

          {/* 隐藏测试路由——Step 19 完成后移除 */}
          <Route path="debug/sse" element={<SSEDebug />} />

          {/* 404 */}
          <Route
            path="*"
            element={
              <PlaceholderPage
                title="404"
                description="这个页面不存在——或者还没建好。"
              />
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
