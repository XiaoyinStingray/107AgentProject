/**
 * LivePreview — Step 100: 实时文件预览面板。
 *
 * 监听 SSE worker.file_updated 事件，自动渲染最新文件内容。
 * 支持 Markdown 预览、代码高亮、JSON 折叠。
 */

import { useState } from "react";

interface Props {
  filePath: string | null;
  content: string | null;
}

export default function LivePreview({ filePath, content }: Props) {
  const [activeTab, setActiveTab] = useState<"preview" | "raw">("preview");

  if (!filePath || !content) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-secondary font-mono">
        等待 Agent 产出文件...
      </div>
    );
  }

  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const isMarkdown = ext === "md" || ext === "markdown";
  const isCode = ["py", "js", "ts", "tsx", "jsx", "json", "html", "css", "yaml", "yml", "sh"].includes(ext);
  const isJson = ext === "json";

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border shrink-0">
        <span className="text-[10px] font-mono text-accent-green truncate flex-1">
          📄 {filePath}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`px-2 py-0.5 text-[10px] font-mono rounded ${
              activeTab === "preview"
                ? "bg-accent-green/15 text-accent-green"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            预览
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("raw")}
            className={`px-2 py-0.5 text-[10px] font-mono rounded ${
              activeTab === "raw"
                ? "bg-accent-green/15 text-accent-green"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            源码
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === "preview" && isMarkdown && (
          <div
            className="prose prose-invert prose-sm max-w-none text-xs font-mono leading-relaxed"
            dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(content) }}
          />
        )}
        {activeTab === "preview" && isJson && (
          <pre className="text-[11px] font-mono text-text-primary whitespace-pre-wrap">
            {formatJson(content)}
          </pre>
        )}
        {activeTab === "preview" && isCode && !isJson && (
          <pre className="text-[11px] font-mono text-accent-blue whitespace-pre-wrap">
            {content.slice(0, 3000)}
          </pre>
        )}
        {activeTab === "preview" && !isMarkdown && !isCode && (
          <pre className="text-[11px] font-mono text-text-primary whitespace-pre-wrap">
            {content.slice(0, 2000)}
          </pre>
        )}
        {activeTab === "raw" && (
          <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap break-all">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}

/** 极简 Markdown → HTML */
function simpleMarkdownToHtml(md: string): string {
  return md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3 class='text-accent-orange text-sm mt-3 mb-1'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 class='text-accent-orange text-base mt-4 mb-1'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 class='text-accent-orange text-lg mt-4 mb-2'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong class='text-accent-green'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code class='bg-bg-primary px-1 rounded text-accent-blue'>$1</code>")
    .replace(/^- (.+)$/gm, "<li class='ml-4'>• $1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li class='ml-4'>$1. $2</li>")
    .replace(/\n\n/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

function formatJson(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}
