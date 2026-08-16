/**
 * State 8: ReportViewer — Markdown 报告渲染组件。
 * 支持标题/粗体/斜体/列表/行内代码/代码块折叠。
 */
import { useState, useMemo } from "react";

interface Props {
  content: string;
  title?: string;
  onDownload?: () => void;
}

/** 将 Markdown 转为 HTML，代码块用折叠 <details> 包裹 */
function renderMarkdown(md: string): string {
  // 先处理代码块（优先级最高 —— 防止内部内容被后续正则误伤）
  const codeBlocks: string[] = [];

  // 策略：逐行扫描，找到 ``` 开头和结尾的行，提取中间内容
  const lines = md.split('\n');
  const resultLines: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // 检查是否是代码块开始行（``` 开头，可选语言标签）
    const startMatch = line.match(/^`{3,4}(\w*)[ \t]*$/);
    if (startMatch) {
      const lang = startMatch[1] || '';
      const codeLines: string[] = [];
      i++;
      // 找到代码块结束行
      while (i < lines.length && !lines[i].match(/^`{3,4}[ \t]*$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      // 跳过结束行
      if (i < lines.length) i++;
      // 存储代码块
      const idx = codeBlocks.length;
      codeBlocks.push({ lang, code: codeLines.join('\n').trimEnd() } as any);
      resultLines.push(`%%CODEBLOCK_${idx}%%`);
    } else {
      resultLines.push(line);
      i++;
    }
  }
  let html = resultLines.join('\n');

  // 兜底：处理逐行扫描未捕获的代码块（例如结尾 ``` 后有内容、或没有独立成行）
  html = html.replace(/```(\w*)[ \t]*(?:\r?\n)([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || '', code: code.trimEnd() } as any);
    return `%%CODEBLOCK_${idx}%%`;
  });

  // 转义 HTML（在代码块提取之后，避免转义代码内容中的 < > &）
  html = html
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // 标题
  html = html.replace(/^#### (.+)$/gm, "<h4 class='r-h4'>$1</h4>");
  html = html.replace(/^### (.+)$/gm, "<h3 class='r-h3'>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2 class='r-h2'>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1 class='r-h1'>$1</h1>");

  // 粗体 / 斜体
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // 行内代码
  html = html.replace(/`([^`]+)`/g, "<code class='r-inline-code'>$1</code>");

  // 分隔线
  html = html.replace(/^---$/gm, "<hr class='r-hr'/>");

  // 无序列表
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul class='r-ul'>$1</ul>");

  // 有序列表
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  // 避免重复包裹
  html = html.replace(/<ul class='r-ul'>((?:<li>.*<\/li>\n?)+)<\/ul>/g, (m) => m);

  // 段落间距
  html = html.replace(/\n\n+/g, "<br/><br/>");
  html = html.replace(/\n/g, "<br/>");

  // 还原代码块 → 折叠 <details>
  codeBlocks.forEach((block: any, idx) => {
    const langLabel = block.lang || "plaintext";
    const escaped = block.code
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const replacement =
      `<details class='r-code-block'>
        <summary class='r-code-summary'>📄 ${langLabel} (${block.code.split("\n").length} 行)</summary>
        <pre><code class='language-${langLabel}'>${escaped}</code></pre>
      </details>`;
    html = html.replace(`%%CODEBLOCK_${idx}%%`, replacement);
  });

  return html;
}

export function ReportViewer({ content, title, onDownload }: Props) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div className="r-root">
      <style>{`
        .r-root { color: #d4d4d8; line-height: 1.75; font-size: 13px; }
        .r-h1 { color: #f97316; font-size: 1.25rem; font-weight: 700; margin: 1rem 0 0.5rem; border-bottom: 1px solid #333; padding-bottom: 0.25rem; }
        .r-h2 { color: #f97316; font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0 0.4rem; }
        .r-h3 { color: #22c55e; font-size: 0.95rem; font-weight: 600; margin: 0.6rem 0 0.3rem; }
        .r-h4 { color: #a78bfa; font-size: 0.85rem; font-weight: 500; margin: 0.5rem 0 0.25rem; }
        .r-ul { margin: 0.25rem 0; padding-left: 1.25rem; }
        .r-ul li { margin: 0.15rem 0; }
        .r-ul li::marker { color: #71717a; }
        .r-inline-code { background: #27272a; color: #60a5fa; padding: 1px 5px; border-radius: 3px; font-size: 0.85em; }
        .r-hr { border: none; border-top: 1px solid #333; margin: 0.75rem 0; }
        .r-code-block { margin: 0.5rem 0; border: 1px solid #333; border-radius: 6px; overflow: hidden; background: #18181b; }
        .r-code-summary { padding: 6px 12px; cursor: pointer; font-size: 11px; color: #a1a1aa; background: #27272a; user-select: none; }
        .r-code-summary:hover { color: #f97316; }
        .r-code-block pre { margin: 0; padding: 10px 14px; overflow-x: auto; font-size: 12px; line-height: 1.5; color: #d4d4d8; }
        .r-code-block code { font-family: 'Consolas', 'Monaco', monospace; }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {onDownload && (
        <button
          type="button"
          onClick={onDownload}
          className="mt-4 px-3 py-1 text-xs font-mono rounded border border-border text-text-secondary hover:border-accent-green hover:text-accent-green transition-colors"
        >
          ⬇ 下载 Markdown
        </button>
      )}
    </div>
  );
}
