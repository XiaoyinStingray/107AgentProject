import { useMockSSE } from "../../mocks/sse";
import ThoughtStream from "../../components/agent/ThoughtStream";
import StatusDot from "../../components/shared/StatusDot";

/**
 * 隐藏测试页面——`/debug/sse`
 * Mock 驱动，不连后端。验证 ThoughtBubble + ThoughtStream 的视觉效果。
 * Step 19 单人剧场完成后可移除此文件和对应路由。
 */
export default function SSEDebug() {
  const { events, connected, start, stop, clear } = useMockSSE();

  return (
    <div className="h-full flex flex-col animate-fade-in">
      {/* 控制栏 */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-secondary">
        <h1 className="text-sm font-mono text-accent-green">思维流测试</h1>
        <StatusDot status={connected ? "active" : "idle"} />
        <span className="text-sm text-text-secondary font-mono">
          {events.length} 条事件
        </span>
        <div className="ml-auto flex gap-2">
          {!connected ? (
            <button
              onClick={start}
              className="
                px-3 py-1 text-sm font-mono rounded
                bg-accent-green/10 border border-accent-green/30
                text-accent-green hover:bg-accent-green/20
                transition-colors
              "
            >
              ▶ 开始推流
            </button>
          ) : (
            <button
              onClick={stop}
              className="
                px-3 py-1 text-sm font-mono rounded
                bg-accent-orange/10 border border-accent-orange/30
                text-accent-orange hover:bg-accent-orange/20
                transition-colors
              "
            >
              ⏹ 停止
            </button>
          )}
          <button
            onClick={clear}
            className="
              px-3 py-1 text-sm font-mono rounded
              bg-bg-card border border-border
              text-text-secondary hover:text-text-primary
              transition-colors
            "
          >
            清空
          </button>
        </div>
      </div>

      {/* 思维流 */}
      <ThoughtStream events={events} className="flex-1" />

      {/* 进度 */}
      <div className="shrink-0 px-4 py-1.5 border-t border-border bg-bg-secondary flex items-center gap-2">
        <span className="text-xs font-mono text-text-secondary/60">
          Mock 模式 · 每 2s 推一条 · 共 15 条
        </span>
        {connected && (
          <span className="text-xs font-mono text-accent-green/70 ml-auto">
            推流中…
          </span>
        )}
      </div>
    </div>
  );
}
