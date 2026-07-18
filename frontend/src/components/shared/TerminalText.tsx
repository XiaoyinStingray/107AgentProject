interface TerminalTextProps {
  children: string;
  /** 打字机逐字动效（CSS 模拟，非 JS 驱动） */
  typewriter?: boolean;
  /** 前缀符号，如 ">" 或 "$" */
  prompt?: string;
  className?: string;
}

/**
 * 等宽打字机风格文字。控制台/终端场景专用。
 * 自带 terminal-text 样式（font-mono + text-sm + text-text-secondary）。
 */
export default function TerminalText({
  children,
  typewriter = false,
  prompt,
  className = "",
}: TerminalTextProps) {
  return (
    <span
      className={`terminal-text ${typewriter ? "animate-typewriter" : ""} ${className}`.trim()}
    >
      {prompt && (
        <span className="text-accent-green mr-1 select-none">{prompt}</span>
      )}
      {children}
    </span>
  );
}
