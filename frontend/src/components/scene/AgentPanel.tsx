import { useState, useRef, useCallback, useEffect } from "react";
import type { AgentSpriteData, Emotion } from "../../game/sprites/AgentSprite";

interface Props {
  agent: AgentSpriteData | null;
  onClose: () => void;
  onEmotionChange?: (emotion: Emotion) => void;
  onWhisper?: (message: string) => void;
}

const EMOTION_LABELS: Record<Emotion, string> = {
  neutral: "平静", happy: "开心", anxious: "焦虑", angry: "愤怒", sad: "悲伤",
  surprised: "惊讶", confused: "困惑", tired: "疲惫", excited: "兴奋",
};

export default function AgentPanel({ agent, onClose, onEmotionChange, onWhisper }: Props) {
  const [whisper, setWhisper] = useState("");
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ dragging: false, sx: 0, sy: 0, px: 0, py: 0 });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { dragging: true, sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.dragging) return;
    setPos({
      x: dragRef.current.px + e.clientX - dragRef.current.sx,
      y: dragRef.current.py + e.clientY - dragRef.current.sy,
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  // 切换 agent 时重置位置
  useEffect(() => { setPos({ x: 0, y: 0 }); }, [agent?.agentId]);

  if (!agent) return null;

  const handleWhisperSubmit = () => {
    const trimmed = whisper.trim();
    if (!trimmed) return;
    onWhisper?.(trimmed);
    setWhisper("");
  };

  return (
    <div
      className="fixed w-64 bg-bg-secondary border border-border rounded-lg shadow-lg z-50 animate-slide-in select-none"
      style={{ right: 16 - pos.x, top: 96 + pos.y }}
    >
      {/* 头部（拖拽把手） */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-border cursor-grab active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div className="flex items-center gap-2">
          <span className="inline-block w-4 h-4 rounded-full" style={{ backgroundColor: agent.color }} />
          <span className="text-sm font-mono text-text-primary">{agent.name}</span>
          <span className="text-lg">{agent.emoji}</span>
        </div>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-sm">✕</button>
      </div>

      {/* 信息 */}
      <div className="px-4 py-3 space-y-2 text-xs font-mono">
        <Row label="位置" value={`(${agent.tileX}, ${agent.tileY})`} />
        <Row label="动作" value={agent.action} />
        <Row label="情绪" value={EMOTION_LABELS[agent.emotion] ?? agent.emotion} />
        <Row label="ID" value={agent.agentId} />
      </div>

      {/* 耳语输入 */}
      {onWhisper && (
        <div className="px-4 py-2 border-t border-border">
          <p className="text-[10px] font-mono text-text-secondary mb-1.5">耳语</p>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={whisper}
              onChange={(e) => setWhisper(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleWhisperSubmit(); }}
              placeholder="说点什么…"
              className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-[11px] font-mono text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-orange/50"
            />
            <button
              type="button"
              onClick={handleWhisperSubmit}
              disabled={!whisper.trim()}
              className="px-2 py-1 text-[10px] font-mono rounded bg-accent-orange/20 text-accent-orange border border-accent-orange/40 hover:bg-accent-orange/30 disabled:opacity-30 transition-colors"
            >
              发送
            </button>
          </div>
        </div>
      )}

      {/* 情绪切换 */}
      <div className="px-4 py-2 border-t border-border">
        <p className="text-[10px] font-mono text-text-secondary mb-1.5">切换情绪</p>
        <div className="flex flex-wrap gap-1">
          {(Object.entries(EMOTION_LABELS) as [Emotion, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => onEmotionChange?.(key)}
              className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-colors ${
                agent.emotion === key
                  ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                  : "border-border text-text-secondary hover:border-text-secondary/40"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}
