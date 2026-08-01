interface EventSourceLike {
  readonly readyState: number;
}

const EVENT_SOURCE_OPEN = 1;

export interface BrainButtonState {
  disabled: boolean;
  label: string;
  title: string;
}

export interface BrainWhisperCommand {
  actorId: string;
  actorName: string;
  targetId?: string;
  targetName?: string;
}

type BrainWhisperPhase = "actor" | "target";

interface PendingBrainWhisper extends BrainWhisperCommand {
  phase: BrainWhisperPhase;
}

/** Track one visible Brain whisper from dispatch through A/B speech. */
export class BrainWhisperTracker {
  private pending: PendingBrainWhisper | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private paused = false;

  constructor(
    private readonly feedback: (agentId: string, message: string) => void,
    private readonly timeoutMs = 35_000,
  ) {}

  start(command: BrainWhisperCommand, paused = false): void {
    this.cancel();
    this.pending = { ...command, phase: "actor" };
    this.paused = paused;
    if (paused) {
      this.feedback(
        command.actorId,
        `耳语已排队，将在继续后由 ${command.actorName} 优先执行`,
      );
      return;
    }
    this.reportExecuting();
    this.armTimeout();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    this.clearTimer();
    if (!paused && this.pending) {
      this.reportExecuting();
      this.armTimeout();
    }
  }

  recordSpeaker(agentId: string): boolean {
    const pending = this.pending;
    if (!pending) return false;

    if (pending.phase === "actor" && agentId === pending.actorId) {
      this.clearTimer();
      if (pending.targetId && pending.targetName) {
        pending.phase = "target";
        this.feedback(
          pending.actorId,
          `耳语已执行：${pending.actorName} 已发言，等待 ${pending.targetName} 回应`,
        );
        if (!this.paused) this.armTimeout();
      } else {
        this.feedback(
          pending.actorId,
          `耳语执行完成：${pending.actorName} 已发言`,
        );
        this.pending = null;
      }
      return true;
    }

    if (pending.phase === "target" && agentId === pending.targetId) {
      this.feedback(
        pending.actorId,
        `耳语执行完成：${pending.targetName} 已回应`,
      );
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.clearTimer();
    this.pending = null;
  }

  dispose(): void {
    this.cancel();
  }

  private reportExecuting(): void {
    if (!this.pending) return;
    const subject =
      this.pending.phase === "actor"
        ? this.pending.actorName
        : this.pending.targetName;
    this.feedback(
      this.pending.actorId,
      `耳语执行中：等待 ${subject ?? "目标 Agent"} 发言`,
    );
  }

  private armTimeout(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      const pending = this.pending;
      if (!pending) return;
      const subject =
        pending.phase === "actor" ? pending.actorName : pending.targetName;
      this.feedback(
        pending.actorId,
        `耳语执行超时：${subject ?? "目标 Agent"} 未产生可见发言`,
      );
      this.pending = null;
    }, this.timeoutMs);
  }

  private clearTimer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
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
