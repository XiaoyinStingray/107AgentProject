/**
 * WorkCard — Step 100a: 单张成果卡片。
 *
 * 展示: Agent 头像 + 任务名 + 文件列表 + 元信息（耗时/步数）。
 */

interface FileInfo {
  path: string;
  size: number;
}

interface Props {
  runId: string;
  agentName: string;
  agentEmoji: string;
  agentColor: string;
  task: string;
  steps: number;
  files: FileInfo[];
  createdAt: string;
  onDownload?: (runId: string, filePath: string) => void;
  onShare?: (runId: string) => void;
}

const FILE_ICONS: Record<string, string> = {
  md: "📄", txt: "📝", json: "📋", csv: "📊",
  py: "🐍", js: "🟨", ts: "🔷", html: "🌐",
  png: "🖼️", jpg: "🖼️", svg: "🎨",
};

function fileIcon(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? "📎";
}

function formatDuration(createdAt: string): string {
  try {
    const created = new Date(createdAt).getTime();
    const now = Date.now();
    const mins = Math.floor((now - created) / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  } catch {
    return "";
  }
}

export default function WorkCard({
  runId, agentName, agentEmoji, agentColor,
  task, steps, files, createdAt,
  onDownload, onShare,
}: Props) {
  return (
    <div className="rounded-xl border border-border bg-bg-secondary/70 hover:border-accent-orange/30 hover:bg-bg-secondary transition-all duration-200 overflow-hidden group">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-border/50">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0"
          style={{ backgroundColor: agentColor + "22", border: `2px solid ${agentColor}` }}
        >
          {agentEmoji || "🤖"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-text-primary font-semibold truncate">
            {agentName}
          </p>
          <p className="text-[10px] font-mono text-text-secondary truncate mt-0.5">
            {task.slice(0, 50)}
          </p>
        </div>
      </div>

      {/* Files */}
      <div className="px-4 py-2 space-y-1">
        {files.slice(0, 3).map((f) => (
          <div key={f.path} className="flex items-center gap-2 text-[10px] font-mono">
            <span>{fileIcon(f.path)}</span>
            <span className="text-text-primary truncate flex-1">{f.path}</span>
            <span className="text-text-secondary shrink-0">
              {(f.size / 1024).toFixed(1)}KB
            </span>
          </div>
        ))}
        {files.length > 3 && (
          <p className="text-[10px] font-mono text-text-secondary pl-5">
            +{files.length - 3} 个文件
          </p>
        )}
        {files.length === 0 && (
          <p className="text-[10px] font-mono text-text-secondary">暂无产出文件</p>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[10px] font-mono text-text-secondary">
          <span>📊 {steps}步</span>
          <span>{formatDuration(createdAt)}</span>
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onShare?.(runId)}
            className="px-2 py-0.5 text-[9px] font-mono rounded border border-border text-text-secondary hover:text-accent-orange hover:border-accent-orange/40"
          >
            🔗 分享
          </button>
        </div>
      </div>
    </div>
  );
}
