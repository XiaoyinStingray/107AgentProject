import { useState } from "react";

interface Checkpoint {
  id: string;
  name: string;
  created_at: string;
}

interface Props {
  checkpoints: Checkpoint[];
  count: number;
  max: number;
  paused: boolean;
  onSave: (name: string) => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePause: () => void;
}

export default function CheckpointPanel({
  checkpoints, count, max, paused,
  onSave, onLoad, onDelete, onTogglePause,
}: Props) {
  const [saveName, setSaveName] = useState("");

  const handleSave = () => {
    if (count >= max) return;
    onSave(saveName.trim() || `存档 ${count + 1}`);
    setSaveName("");
  };

  return (
    <div className="space-y-2 text-xs font-mono">
      {/* 暂停/继续 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePause}
          className={`px-3 py-1 rounded border transition-colors ${
            paused
              ? "border-accent-green/60 bg-accent-green/10 text-accent-green"
              : "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
          }`}
        >
          {paused ? "▶ 继续" : "⏸ 暂停"}
        </button>
        <span className="text-text-secondary">
          {paused ? "已暂停" : "运行中"}
        </span>
      </div>

      {/* 保存 */}
      {paused && (
        <div className="flex gap-1.5">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
            placeholder="存档名称…"
            maxLength={20}
            className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-orange/50"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={count >= max}
            className="px-2 py-1 rounded bg-accent-orange/20 text-accent-orange border border-accent-orange/40 hover:bg-accent-orange/30 disabled:opacity-30 transition-colors"
          >
            保存 ({count}/{max})
          </button>
        </div>
      )}

      {/* 存档列表 */}
      {checkpoints.length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto">
          {checkpoints.map((cp) => (
            <div
              key={cp.id}
              className="flex items-center gap-2 px-2 py-1 bg-bg-primary/50 rounded border border-border/50"
            >
              <span className="flex-1 text-text-primary truncate">
                {cp.name || cp.id.slice(0, 8)}
              </span>
              <span className="text-text-secondary/50 text-[10px]">
                {cp.created_at ? new Date(cp.created_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : ""}
              </span>
              {paused && (
                <>
                  <button
                    type="button"
                    onClick={() => onLoad(cp.id)}
                    className="px-1.5 py-0.5 text-[10px] rounded border border-accent-orange/40 text-accent-orange hover:bg-accent-orange/10 transition-colors"
                  >
                    加载
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(cp.id)}
                    className="px-1.5 py-0.5 text-[10px] rounded border border-border text-text-secondary hover:text-red-400 hover:border-red-400/40 transition-colors"
                  >
                    删
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
