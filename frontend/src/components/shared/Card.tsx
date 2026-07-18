import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  /** 默认无外边框，hover 时亮起 */
  hover?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * 玻璃面板容器——项目中所有"卡片"的基础组件。
 * 暗色半透明背景 + 细边框，hover 时边框提亮。
 */
export default function Card({
  children,
  hover = false,
  className = "",
  onClick,
}: CardProps) {
  return (
    <div
      className={`
        bg-bg-card border border-border rounded-lg p-5
        ${hover ? "hover:border-text-secondary transition-colors duration-200" : ""}
        ${onClick ? "cursor-pointer" : ""}
        ${className}
      `.trim()}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
