import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Layout from "./components/layout/Layout";
import Home from "./pages/Home";
import EmptyState from "./components/shared/EmptyState";
import Badge from "./components/shared/Badge";
import LoadingSpinner from "./components/shared/LoadingSpinner";
import { findItemById } from "./data/menuData";

// --- 懒加载：8 个模块页面按需加载 ---
const AgentModule = lazy(() => import("./pages/AgentModule"));
const SoloTheater = lazy(() => import("./pages/SoloTheater"));
const GroupSandbox = lazy(() => import("./pages/GroupSandbox"));
const Arena = lazy(() => import("./pages/Arena"));
const NarrativeFactory = lazy(() => import("./pages/NarrativeFactory"));
const ControlPanel = lazy(() => import("./pages/ControlPanel"));
const DirectorIntervention = lazy(() => import("./pages/DirectorIntervention"));
const Archive = lazy(() => import("./pages/Archive"));
const TeamDashboard = lazy(() => import("./pages/TeamDashboard"));

/** Suspense 占位——加载中显示 */
function PageFallback() {
  return <LoadingSpinner title="加载中…" fullscreen />;
}

/** 占位页面——解析 URL hash（如 #item-25），显示对应功能项名称。 */
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

  const itemId = hash.startsWith("#item-") ? parseInt(hash.slice(6), 10) : null;
  const selectedItem = itemId ? findItemById(itemId) : null;

  return (
    <div className="h-full flex items-center justify-center">
      {selectedItem ? (
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
          <Route
            path="agents"
            element={
              <Suspense fallback={<PageFallback />}>
                <AgentModule />
              </Suspense>
            }
          />
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
          <Route
            path="theater"
            element={
              <Suspense fallback={<PageFallback />}>
                <SoloTheater />
              </Suspense>
            }
          />

          {/* M3 群体沙盒 */}
          <Route
            path="sandbox"
            element={
              <Suspense fallback={<PageFallback />}>
                <GroupSandbox />
              </Suspense>
            }
          />

          {/* M4 竞技场 */}
          <Route
            path="arena"
            element={
              <Suspense fallback={<PageFallback />}>
                <Arena />
              </Suspense>
            }
          />

          {/* M5 叙事工厂 */}
          <Route
            path="narratives"
            element={
              <Suspense fallback={<PageFallback />}>
                <NarrativeFactory />
              </Suspense>
            }
          />

          {/* M6 控制台 */}
          <Route
            path="control"
            element={
              <Suspense fallback={<PageFallback />}>
                <ControlPanel />
              </Suspense>
            }
          />

          {/* M7 干预台 */}
          <Route
            path="intervention"
            element={
              <Suspense fallback={<PageFallback />}>
                <DirectorIntervention />
              </Suspense>
            }
          />

          {/* M8 档案馆 */}
          <Route
            path="archive"
            element={
              <Suspense fallback={<PageFallback />}>
                <Archive />
              </Suspense>
            }
          />

          {/* M9 Agent Team */}
          <Route
            path="team"
            element={
              <Suspense fallback={<PageFallback />}>
                <TeamDashboard />
              </Suspense>
            }
          />

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
