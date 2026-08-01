/**
 * ProactiveBanner — Step 99: 顶部滑入横幅。
 *
 * Agent 主动搭话时，从屏幕顶部滑入通知横幅。
 * 显示 Agent 头像、话题预览、[聊聊] [忽略] 按钮。
 */

import { useState, useEffect } from "react";
import type { AgentSpriteData } from "../../game/sprites/AgentSprite";

interface Props {
  agent: AgentSpriteData;
  topic: string;
  /** 60s 倒计时剩余秒数 */
  remainingSeconds: number;
  onAccept: () => void;
  onIgnore: () => void;
}

const CHAT_TIMEOUT = 60;

export default function ProactiveBanner({ agent, topic, remainingSeconds, onAccept, onIgnore }: Props) {
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);

  // 入场动画
  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleIgnore = () => {
    setExiting(true);
    setTimeout(onIgnore, 200);
  };

  const handleAccept = () => {
    setExiting(true);
    setTimeout(onAccept, 200);
  };

  // 倒计时进度条
  const progress = remainingSeconds / CHAT_TIMEOUT;

  return (
    <div
      className={`fixed top-4 left-1/2 z-50 w-[480px] max-w-[95vw] transition-all duration-300 ease-out ${
        visible && !exiting ? "translate-y-0 opacity-100" : "-translate-y-20 opacity-0"
      }`}
      style={{ transform: visible && !exiting ? "translate(-50%, 0)" : "translate(-50%, -80px)" }}
    >
      <div className="relative rounded-xl border border-accent-orange/40 bg-bg-secondary/95 backdrop-blur-md shadow-2xl shadow-accent-orange/10 overflow-hidden">
        {/* 脉冲光晕 */}
        <div className="absolute inset-0 rounded-xl bg-accent-orange/5 animate-pulse pointer-events-none" />

        {/* 倒计时进度条 */}
        <div className="absolute bottom-0 left-0 h-0.5 bg-accent-orange/30 w-full">
          <div
            className="h-full bg-accent-orange transition-all duration-1000 ease-linear"
            style={{ width: `${Math.max(0, progress * 100)}%` }}
          />
        </div>

        <div className="relative p-4 flex items-center gap-4">
          {/* Agent 头像 */}
          <div className="shrink-0 relative">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-2xl animate-bounce"
              style={{ backgroundColor: agent.color + "22", border: `2px solid ${agent.color}` }}
            >
              {agent.emoji}
            </div>
          </div>

          {/* 文本区 */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-mono text-text-primary font-semibold">
              {agent.name}
              <span className="text-text-secondary font-normal ml-1">想跟你聊聊…</span>
            </p>
            <p className="text-xs text-text-secondary font-mono mt-0.5 truncate">
              "{topic}"
            </p>
          </div>

          {/* 按钮 */}
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleAccept}
              className="px-4 py-1.5 text-xs font-mono rounded-lg border border-accent-green/50 bg-accent-green/15 text-accent-green hover:bg-accent-green/25 transition-colors"
            >
              💬 聊聊
            </button>
            <button
              type="button"
              onClick={handleIgnore}
              className="px-3 py-1.5 text-xs font-mono rounded-lg border border-border text-text-secondary hover:border-text-secondary/50 hover:text-text-primary transition-colors"
            >
              ✕ 忽略
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
