interface EmptyStateProps {
  title: string;
  description?: string;
  /** P0-P3 优先级提示（可选） */
  tier?: "P0" | "P1" | "P2" | "P3";
  className?: string;
}

/**
 * 🚧 建设中占位组件——用于尚未实现的页面/功能。
 * 居中显示图标 + 标题 + 说明 + 优先级标注。
 */
export default function EmptyState({
  title,
  description,
  tier,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center h-full text-text-secondary ${className}`}
    >
      <div className="text-5xl mb-4 select-none">🚧</div>
      <h2 className="text-xl font-mono text-text-primary mb-2">{title}</h2>
      {description && (
        <p className="text-sm max-w-md text-center mb-3">{description}</p>
      )}
      {tier && (
        <span className="text-xs text-text-secondary/50 font-mono">
          {tier} — 演示后可继续开发
        </span>
      )}
    </div>
  );
}
