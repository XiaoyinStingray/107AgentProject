import type { SandboxSpeed } from "../../types/sandbox";
import StatusDot from "../shared/StatusDot";

interface SandboxHeaderProps {
  scenario: string;
  currentTick: number;
  connected: boolean;
  isPaused: boolean;
  isPending: boolean;
  speed: SandboxSpeed;
  onToggleSpeed: () => void;
  onToggleRunning: () => void;
  onBack: () => void;
  onReset: () => void;
}

/** 群体沙盒运行时顶部控制栏。 */
export default function SandboxHeader({
  scenario,
  currentTick,
  connected,
  isPaused,
  isPending,
  speed,
  onToggleSpeed,
  onToggleRunning,
  onBack,
  onReset,
}: SandboxHeaderProps) {
  const statusLabel = isPaused ? "PAUSED" : connected ? "RUNNING" : "CONNECTING";

  return (
    <header className="shrink-0 border-b border-border bg-bg-secondary px-4 py-3 flex items-center gap-4">
      <div>
        <p className="text-xs text-text-secondary font-mono">WORLD</p>
        <h1 className="text-sm text-text-primary font-mono">{scenario}</h1>
      </div>
      <span className="text-xs text-text-secondary font-mono">
        Tick #{currentTick}
      </span>
      <span className="ml-auto flex items-center gap-2 text-xs font-mono text-text-secondary">
        <StatusDot status={connected && !isPaused ? "active" : "idle"} label="" />
        {statusLabel}
      </span>
      <button
        type="button"
        onClick={onToggleRunning}
        disabled={isPending}
        className="text-xs font-mono text-accent-green hover:text-accent-green/80 transition-colors"
      >
        {isPaused ? "▶ 继续" : "⏸ 暂停"}
      </button>
      <button
        type="button"
        onClick={onToggleSpeed}
        disabled={isPending}
        className="text-xs font-mono text-accent-blue hover:text-accent-blue/80 transition-colors"
      >
        ⏩ Speed {speed}x
      </button>
      <button
        type="button"
        onClick={onBack}
        disabled={isPending}
        className="text-xs font-mono text-text-secondary hover:text-text-primary transition-colors"
      >
        ⏎ 返回列表
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={isPending}
        className="text-xs font-mono text-accent-orange hover:text-accent-orange/80 transition-colors"
      >
        ✕ 结束
      </button>
    </header>
  );
}
