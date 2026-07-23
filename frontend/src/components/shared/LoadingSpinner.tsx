/**
 * 统一加载指示器——替换各页面内联 loading UI。
 *
 * 用法:
 *   <LoadingSpinner title="正在构建人格…" detail="LLM 正在推理角色设定" />
 *   <LoadingSpinner icon="📖" title="正在生成小说…" />
 */

import type { ReactNode } from "react";

interface LoadingSpinnerProps {
  /** 图标，默认绿色旋转 spinner */
  icon?: ReactNode;
  /** 主标题（必填） */
  title: string;
  /** 副文本（可选） */
  detail?: string;
  /** 是否全屏居中（默认 false = 内联） */
  fullscreen?: boolean;
}

export default function LoadingSpinner({
  icon,
  title,
  detail,
  fullscreen = false,
}: LoadingSpinnerProps) {
  const containerClass = fullscreen
    ? "h-full flex items-center justify-center animate-fade-in"
    : "flex flex-col items-center py-12 text-text-secondary";

  const defaultIcon = icon ?? (
    <div className="w-8 h-8 border-2 border-accent-green/30 border-t-accent-green rounded-full animate-spin" />
  );
  const iconWrap = fullscreen ? (
    <div className="text-5xl mb-4 animate-pulse">{defaultIcon}</div>
  ) : (
    <div className="mb-3">{defaultIcon}</div>
  );

  return (
    <div className={containerClass}>
      <div className="text-center">
        {iconWrap}
        <h2
          className={`font-mono text-text-primary ${
            fullscreen ? "text-lg mb-2" : "text-sm"
          }`}
        >
          {title}
        </h2>
        {detail && (
          <p className="text-sm text-text-secondary/60 mt-1">{detail}</p>
        )}
      </div>
    </div>
  );
}
