/**
 * FileTimeline — Step 100: 文件时间轴面板。
 *
 * 展示文件的版本历史列表。
 * 支持: 查看、对比、恢复历史版本。
 */

interface Snapshot {
  name: string;
  size: number;
  timestamp: string;
}

interface Props {
  filePath: string | null;
  snapshots: Snapshot[];
  onView?: (snapshotName: string) => void;
  onRestore?: (snapshotName: string) => void;
}

export default function FileTimeline({ filePath, snapshots, onView, onRestore }: Props) {
  if (!filePath || snapshots.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-text-secondary font-mono">
        {filePath ? "暂无历史版本" : "选择文件查看版本历史"}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-2 max-h-full overflow-y-auto">
      <p className="text-[10px] font-mono text-text-secondary mb-1 px-1">
        📄 {filePath} · {snapshots.length} 个版本
      </p>
      {snapshots.map((snap, i) => (
        <div
          key={snap.name}
          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-bg-secondary/50 transition-colors group"
        >
          <span className="text-[9px] font-mono text-text-secondary shrink-0 w-6">
            v{snapshots.length - i}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-mono text-text-primary truncate">
              {snap.name}
            </p>
            <p className="text-[9px] font-mono text-text-secondary">
              {(snap.size / 1024).toFixed(1)}KB · {snap.timestamp.slice(0, 19).replace("T", " ")}
            </p>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => onView?.(snap.name)}
              className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20"
            >
              查看
            </button>
            <button
              type="button"
              onClick={() => onRestore?.(snap.name)}
              className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-accent-orange/10 text-accent-orange hover:bg-accent-orange/20"
            >
              恢复
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
