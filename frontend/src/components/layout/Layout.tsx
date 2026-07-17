import { Outlet } from "react-router-dom";

export default function Layout() {
  return (
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Top Bar */}
      <header className="h-12 border-b border-border flex items-center px-4 bg-bg-secondary">
        <span className="font-mono text-sm text-accent-green">Life Lab v0.1.0</span>
        <span className="ml-auto font-mono text-xs text-text-secondary">
          Agent 社会实验平台
        </span>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>

      {/* Bottom Bar */}
      <footer className="h-6 border-t border-border flex items-center px-4 bg-bg-secondary">
        <span className="font-mono text-xs text-text-secondary">
          READY
        </span>
      </footer>
    </div>
  );
}
