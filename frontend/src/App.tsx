import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import AgentFoundry from "./pages/AgentFoundry";
import SoloTheater from "./pages/SoloTheater";
import GroupSandbox from "./pages/GroupSandbox";
import Arena from "./pages/Arena";
import NarrativeFactory from "./pages/NarrativeFactory";
import ControlPanel from "./pages/ControlPanel";
import DirectorIntervention from "./pages/DirectorIntervention";
import Archive from "./pages/Archive";
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
          <Route path="sandbox" element={<GroupSandbox />} />

          {/* M4 竞技场 */}
          <Route path="arena" element={<Arena />} />

          {/* M5 叙事工厂 */}
          <Route path="narratives" element={<NarrativeFactory />} />

          {/* M6 控制台 */}
          <Route path="control" element={<ControlPanel />} />

          {/* M7 干预台 */}
          <Route path="intervention" element={<DirectorIntervention />} />

          {/* M8 档案馆 */}
          <Route path="archive" element={<Archive />} />

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
