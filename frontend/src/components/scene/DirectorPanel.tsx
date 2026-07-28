import { useState } from "react";

interface Props {
  weather: string;
  onWeatherChange: (w: string) => void;
  onGodVoice: (message: string) => void;
  onMoodAll: (emotion: string) => void;
  paused: boolean;
}

const WEATHERS = [
  { id: "clear", label: "☀️" },
  { id: "sakura", label: "🌸" },
  { id: "rain", label: "🌧️" },
];

const MOODS = [
  { id: "happy", label: "😊" },
  { id: "anxious", label: "😰" },
  { id: "angry", label: "😡" },
  { id: "sad", label: "😢" },
  { id: "surprised", label: "😲" },
  { id: "neutral", label: "😐" },
];

export default function DirectorPanel({ weather, onWeatherChange, onGodVoice, onMoodAll, paused }: Props) {
  const [voice, setVoice] = useState("");

  const handleVoice = () => {
    const m = voice.trim();
    if (!m) return;
    onGodVoice(m);
    setVoice("");
  };

  return (
    <div className="space-y-2 text-xs font-mono">
      {/* 上帝之声 */}
      <div>
        <p className="text-text-secondary mb-1">上帝之声</p>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleVoice(); }}
            placeholder="对全员说话…"
            maxLength={40}
            className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-text-primary placeholder-text-secondary/40 focus:outline-none focus:border-accent-orange/50"
          />
          <button
            onClick={handleVoice}
            disabled={!voice.trim()}
            className="px-2 py-1 rounded bg-accent-orange/20 text-accent-orange border border-accent-orange/40 hover:bg-accent-orange/30 disabled:opacity-30 transition-colors"
          >
            广播
          </button>
        </div>
      </div>

      {/* 天气 */}
      <div>
        <p className="text-text-secondary mb-1">天气</p>
        <div className="flex gap-1">
          {WEATHERS.map((w) => (
            <button
              key={w.id}
              onClick={() => onWeatherChange(w.id)}
              className={`px-2 py-0.5 rounded border transition-colors ${
                weather === w.id
                  ? "border-accent-orange/60 bg-accent-orange/10 text-accent-orange"
                  : "border-border text-text-secondary hover:border-text-secondary/40"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* 全员氛围 */}
      {!paused && (
        <div>
          <p className="text-text-secondary mb-1">全员氛围</p>
          <div className="flex gap-1 flex-wrap">
            {MOODS.map((m) => (
              <button
                key={m.id}
                onClick={() => onMoodAll(m.id)}
                className="px-2 py-0.5 text-sm rounded border border-border hover:border-text-secondary/40 transition-colors"
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
