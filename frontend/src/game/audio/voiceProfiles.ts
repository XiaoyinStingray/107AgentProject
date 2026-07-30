/**
 * voiceProfiles.ts — Agent 稳定声线生成器（66-A）。
 *
 * 每个 Agent 的声线通过 agentId 的稳定 hash 决定：
 *   - 基础音高（Hz）
 *   - 波形类型
 *   - 音色参数
 * 情绪参数在播放时叠加。
 */

import type { Emotion } from "../sprites/AgentSprite";

/* ── 波形类型 ── */
export type Waveform = "sine" | "triangle" | "sawtooth" | "square";

/* ── 声线配置 ── */
export interface VoiceProfile {
  /** 基础频率 (Hz)，说话时的音高中心 */
  basePitch: number;
  /** 波形类型 */
  waveform: Waveform;
  /** 音色亮度 0-1（谐波含量） */
  brightness: number;
  /** 颤音幅度 (Hz deviation) */
  vibrato: number;
  /** 语速系数 (0.7=慢, 1.0=正常, 1.3=快) */
  speed: number;
}

/* ── 情绪参数叠加 ── */
export interface EmotionModulation {
  /** 音高偏移 (Hz) */
  pitchShift: number;
  /** 音符持续时间系数 */
  noteLength: number;
  /** 音符间隔系数 */
  noteGap: number;
  /** 额外增益 (0-1)，总响度会被归一化 */
  gainBoost: number;
}

/* ── 简易稳定 hash（djb2） ── */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const WAVEFORMS: Waveform[] = ["triangle", "sine", "sawtooth", "triangle", "square", "sine"];

/** 根据 agentId 生成稳定声线 */
export function getVoiceProfile(agentId: string): VoiceProfile {
  const h = hashStr(agentId);
  return {
    basePitch: 200 + (h % 180),           // 200-380 Hz
    waveform: WAVEFORMS[h % WAVEFORMS.length],
    brightness: 0.35 + (h % 40) / 100,     // 0.35-0.75
    vibrato: 2 + (h % 8),                  // 2-10 Hz
    speed: 0.85 + (h % 40) / 100,          // 0.85-1.25
  };
}

/** 情绪 → 音频参数调制 */
export function getEmotionMod(emotion: Emotion): EmotionModulation {
  switch (emotion) {
    case "happy":
      return { pitchShift: 60, noteLength: 0.7, noteGap: 0.5, gainBoost: 0.15 };
    case "excited":
      return { pitchShift: 80, noteLength: 0.55, noteGap: 0.4, gainBoost: 0.2 };
    case "angry":
      return { pitchShift: 40, noteLength: 0.4, noteGap: 0.3, gainBoost: 0.1 };
    case "sad":
      return { pitchShift: -30, noteLength: 1.6, noteGap: 0.9, gainBoost: -0.15 };
    case "tired":
      return { pitchShift: -50, noteLength: 1.8, noteGap: 1.2, gainBoost: -0.2 };
    case "anxious":
      return { pitchShift: 30, noteLength: 0.6, noteGap: 0.4, gainBoost: 0.05 };
    case "confused":
      return { pitchShift: 10, noteLength: 0.9, noteGap: 0.6, gainBoost: 0 };
    case "surprised":
      return { pitchShift: 90, noteLength: 0.5, noteGap: 0.5, gainBoost: 0.1 };
    default: // neutral
      return { pitchShift: 0, noteLength: 1.0, noteGap: 0.65, gainBoost: 0 };
  }
}
