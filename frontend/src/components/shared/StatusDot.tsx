type Status = "active" | "thinking" | "idle" | "offline";

interface StatusDotProps {
  status: Status;
  /** 可选的 Tooltip 文字，默认 = status 名 */
  label?: string;
  className?: string;
}

const statusMap: Record<Status, { cssClass: string; defaultLabel: string }> = {
  active: { cssClass: "status-dot active", defaultLabel: "活跃" },
  thinking: { cssClass: "status-dot thinking", defaultLabel: "思考中" },
  idle: { cssClass: "status-dot idle", defaultLabel: "空闲" },
  offline: { cssClass: "status-dot idle opacity-40", defaultLabel: "离线" },
};

/**
 * 呼吸指示灯——展示 Agent / 连接 / 服务的运行状态。
 * active=绿色常亮+光晕, thinking=蓝色脉冲, idle=灰色, offline=灰色半透明。
 */
export default function StatusDot({
  status,
  label,
  className = "",
}: StatusDotProps) {
  const { cssClass, defaultLabel } = statusMap[status];

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={cssClass} aria-hidden="true" />
      <span className="text-xs text-text-secondary font-mono">
        {label ?? defaultLabel}
      </span>
    </span>
  );
}
