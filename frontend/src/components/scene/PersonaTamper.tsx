import { useState } from "react";

export interface Personality {
  openness: number;
  conscientiousness: number;
  extraversion: number;
  agreeableness: number;
  neuroticism: number;
}

interface Props {
  agentName: string;
  agentEmoji: string;
  initial: Personality;
  onSave: (p: Personality) => void;
  onClose: () => void;
}

const TRAITS: { key: keyof Personality; label: string; desc: string }[] = [
  { key: "openness",          label: "开放性",   desc: "好奇、创新 vs 保守、务实" },
  { key: "conscientiousness", label: "尽责性",   desc: "自律、有序 vs 随性、灵活" },
  { key: "extraversion",      label: "外向性",   desc: "社交、活跃 vs 内敛、安静" },
  { key: "agreeableness",     label: "宜人性",   desc: "合作、共情 vs 竞争、理性" },
  { key: "neuroticism",       label: "情绪稳定", desc: "焦虑、敏感 vs 稳定、从容" },
];

export const DEFAULT_PERSONALITY: Personality = {
  openness: 60, conscientiousness: 55, extraversion: 50, agreeableness: 55, neuroticism: 45,
};

export default function PersonaTamper({ agentName, agentEmoji, initial, onSave, onClose }: Props) {
  const [values, setValues] = useState<Personality>(initial);

  return (
    <div className="fixed right-4 top-24 w-72 bg-bg-secondary border border-border rounded-lg shadow-lg z-50 animate-slide-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-lg">{agentEmoji}</span>
          <span className="text-sm font-mono text-text-primary">{agentName}</span>
          <span className="text-[10px] font-mono text-accent-orange/60">篡改模式</span>
        </div>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary text-sm">✕</button>
      </div>

      <div className="px-4 py-3 space-y-3">
        {TRAITS.map((t) => (
          <div key={t.key}>
            <div className="flex justify-between text-[10px] font-mono mb-0.5">
              <span className="text-text-secondary">{t.label}</span>
              <span className="text-accent-orange">{values[t.key]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={values[t.key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [t.key]: Number(e.target.value) }))
              }
              className="w-full h-1.5 bg-bg-primary rounded appearance-none cursor-pointer
                accent-accent-orange [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent-orange"
            />
            <p className="text-[9px] text-text-secondary/50 mt-0.5">{t.desc}</p>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 border-t border-border flex gap-2">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 text-xs font-mono rounded border border-border text-text-secondary hover:text-text-primary transition-colors"
        >
          取消
        </button>
        <button
          onClick={() => onSave(values)}
          className="flex-1 py-1.5 text-xs font-mono rounded bg-accent-orange/20 text-accent-orange border border-accent-orange/40 hover:bg-accent-orange/30 transition-colors"
        >
          应用篡改
        </button>
      </div>
    </div>
  );
}
