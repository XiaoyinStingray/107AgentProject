import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import FeatureRouteBoundary from "./FeatureRouteBoundary";

/**
 * 全局布局：左侧可折叠 Sidebar + 顶部状态栏 + 主内容区。
 * 原有顶栏/底栏被提取为 TopBar，底栏（状态条）合并到 TopBar 右侧。
 */
export default function Layout() {
  return (
    <div className="h-screen flex flex-col bg-bg-primary overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <FeatureRouteBoundary />
        </main>
      </div>
    </div>
  );
}
