/**
 * AudioControls — 音频控制面板（66-A）。
 *
 * 提供：启用声音 / 静音 / 音量滑块。
 * 状态持久化到 localStorage。
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { playbackQueue } from "../../game/audio/DialoguePlaybackQueue";

export default function AudioControls() {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.25);
  const audioContextRef = useRef<AudioContext | null>(null);

  // 初始化：从 localStorage 恢复
  useEffect(() => {
    const savedMuted = localStorage.getItem("m11_audio_muted") === "true";
    const savedVol = parseFloat(localStorage.getItem("m11_audio_volume") ?? "0.25");
    setMuted(savedMuted);
    setVolume(savedVol);
    playbackQueue.setMuted(savedMuted);
    playbackQueue.setVolume(savedVol);
  }, []);

  // 仅在音频启用期间监听页面可见性，并在卸载时解除监听。
  useEffect(() => {
    if (!enabled) return;
    const handleVisibilityChange = () => {
      if (document.hidden) {
        playbackQueue.pause();
      } else {
        playbackQueue.resume();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled]);

  // 页面离开后关闭本组件创建的 AudioContext，避免残留音频资源。
  useEffect(() => () => {
    playbackQueue.setEnabled(false, null);
    const ctx = audioContextRef.current;
    audioContextRef.current = null;
    if (
      ctx &&
      ctx.state !== "closed" &&
      typeof ctx.close === "function"
    ) {
      void ctx.close();
    }
  }, []);

  /** 用户点击「启用声音」→ 创建 AudioContext */
  const handleEnable = useCallback(() => {
    if (enabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = ctx;
      playbackQueue.setEnabled(true, ctx);
      setEnabled(true);
      try { localStorage.setItem("m11_audio_enabled", "true"); } catch {}
    } catch {
      // Web Audio 不可用
    }
  }, [enabled]);

  // visibilitychange 监听器：页面隐藏时暂停，显示时恢复
  useEffect(() => {
    if (!enabled) return;
    const handleVisibility = () => {
      if (document.hidden) {
        playbackQueue.pause();
      } else {
        playbackQueue.resume();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled]);

  const handleMuteToggle = useCallback(() => {
    const next = !muted;
    setMuted(next);
    playbackQueue.setMuted(next);
  }, [muted]);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    playbackQueue.setVolume(v);
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 12px", background: "rgba(0,0,0,0.6)",
      borderRadius: 8, fontSize: 13, color: "#ccc",
    }}>
      {!enabled ? (
        <button
          onClick={handleEnable}
          style={{
            padding: "4px 12px", borderRadius: 6, border: "1px solid #4CAF50",
            background: "rgba(76,175,80,0.2)", color: "#4CAF50", cursor: "pointer",
            fontSize: 13,
          }}
        >
          🔊 启用声音
        </button>
      ) : (
        <>
          <button
            onClick={handleMuteToggle}
            style={{
              padding: "4px 8px", borderRadius: 6, border: "1px solid #666",
              background: "transparent", color: muted ? "#f44336" : "#ccc",
              cursor: "pointer", fontSize: 13, minWidth: 36,
            }}
            title={muted ? "取消静音" : "静音"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolumeChange}
            style={{ width: 80, accentColor: "#4CAF50" }}
            title={`音量: ${Math.round(volume * 100)}%`}
          />
          <span style={{ color: "#888", minWidth: 36 }}>
            {Math.round(volume * 100)}%
          </span>
        </>
      )}
    </div>
  );
}
