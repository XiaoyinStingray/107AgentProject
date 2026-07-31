interface EventSourceLike {
  readonly readyState: number;
}

const EVENT_SOURCE_OPEN = 1;

export interface BrainButtonState {
  disabled: boolean;
  label: string;
  title: string;
}

/** Explain why the Brain control is unavailable instead of showing a bare cursor. */
export function getBrainButtonState(
  agentCount: number,
  pending: boolean,
  enabled: boolean,
): BrainButtonState {
  if (agentCount === 0) {
    return {
      disabled: true,
      label: "OFF",
      title: "请先向当前场景投放至少一个 Agent",
    };
  }
  if (pending) {
    return {
      disabled: true,
      label: "⏳",
      title: "正在连接 AI 世界",
    };
  }
  return {
    disabled: false,
    label: enabled ? "ON ✓" : "OFF",
    title: enabled ? "关闭 AI 驱动" : "开启 AI 驱动",
  };
}

/** Treat only a continuously unavailable SSE connection as disconnected. */
export class BrainDisconnectWatchdog {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onDisconnected: () => void,
    private readonly delayMs = 10_000,
  ) {}

  reportError(source: EventSourceLike): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (source.readyState !== EVENT_SOURCE_OPEN) {
        this.onDisconnected();
      }
    }, this.delayMs);
  }

  markOpen(): void {
    this.clear();
  }

  dispose(): void {
    this.clear();
  }

  private clear(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
