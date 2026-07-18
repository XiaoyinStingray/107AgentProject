interface BadgeProps {
  label: string;
  /** 优先级决定了颜色：P0=红, P1=橙, P2=蓝, P3=灰 */
  variant?: "P0" | "P1" | "P2" | "P3" | "default";
  className?: string;
}

const variantStyles: Record<string, string> = {
  P0: "bg-accent-red/20 text-accent-red border-accent-red/30",
  P1: "bg-accent-orange/20 text-accent-orange border-accent-orange/30",
  P2: "bg-accent-blue/20 text-accent-blue border-accent-blue/30",
  P3: "bg-text-secondary/20 text-text-secondary border-text-secondary/30",
  default: "bg-bg-secondary text-text-secondary border-border",
};

/**
 * 微型状态/优先级标签。用于卡片、列表项、Sidebar 菜单子项。
 */
export default function Badge({
  label,
  variant = "default",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`
        inline-block text-xs font-mono px-1.5 py-0.5 rounded border
        ${variantStyles[variant]}
        ${className}
      `.trim()}
    >
      {label}
    </span>
  );
}
