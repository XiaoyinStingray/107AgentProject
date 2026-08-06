/**
 * AchievementToast — 全局成就弹窗。监听 achievement-unlocked 事件。
 */
import { useState, useEffect, useCallback } from "react";
import type { Achievement } from "../../game/achievements";

export default function AchievementToast() {
  const [queue, setQueue] = useState<Achievement[]>([]);
  const [current, setCurrent] = useState<Achievement | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<Achievement>).detail;
      if (detail) setQueue(prev => [...prev, detail]);
    };
    window.addEventListener("achievement-unlocked", handler);
    return () => window.removeEventListener("achievement-unlocked", handler);
  }, []);

  useEffect(() => {
    if (!current && queue.length > 0) {
      setCurrent(queue[0]);
      setQueue(prev => prev.slice(1));
    }
  }, [current, queue]);

  useEffect(() => {
    if (current) {
      const t = setTimeout(() => setCurrent(null), 4000);
      return () => clearTimeout(t);
    }
  }, [current]);

  if (!current) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] animate-fade-in pointer-events-none">
      <div className="bg-gradient-to-r from-accent-green/20 via-bg-primary to-accent-purple/20 border-2 border-accent-green/40 rounded-2xl px-6 py-4 shadow-2xl backdrop-blur-sm text-center">
        <span className="text-3xl block mb-1">{current.icon}</span>
        <p className="text-sm font-mono font-bold text-accent-green">成就解锁：{current.title}</p>
        <p className="text-xs font-mono text-text-secondary mt-1">{current.desc}</p>
        <p className="text-[10px] font-mono text-text-muted/50 mt-0.5">{current.module}</p>
      </div>
    </div>
  );
}
