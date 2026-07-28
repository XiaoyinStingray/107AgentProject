import { useState, useRef, useEffect } from "react";

interface Props {
  agentName: string;
  agentEmoji: string;
  onSubmit: (message: string) => void;
  onClose: () => void;
}

export default function WhisperBox({ agentName, agentEmoji, onSubmit, onClose }: Props) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    onClose();
  };

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-slide-in">
      <div className="bg-bg-secondary border border-accent-orange/40 rounded-lg shadow-lg p-3 w-80">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{agentEmoji}</span>
          <span className="text-xs font-mono text-text-secondary">
            对 {agentName} 耳语
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-text-secondary hover:text-text-primary text-xs"
          >
            ✕
          </button>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); if (e.key === "Escape") onClose(); }}
            placeholder="低声说点什么…"
            className="flex-1 bg-bg-primary border border-border rounded px-3 py-1.5 text-sm font-mono text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-orange/50"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!text.trim()}
            className="px-3 py-1.5 text-xs font-mono rounded bg-accent-orange/20 text-accent-orange border border-accent-orange/40 hover:bg-accent-orange/30 disabled:opacity-30 transition-colors"
          >
            发送
          </button>
        </div>
      </div>
    </div>
  );
}
