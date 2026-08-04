/**
 * AgentVoiceEngine — Web Audio 情绪拟声合成器（66-A）。
 *
 * 设计：
 *   - 纯 Web Audio API，零外部依赖
 *   - 每个 Agent 一个稳定声线（voiceProfiles）
 *   - 文本长度 → 音节数 → 短音符序列
 *   - 情绪 → 音高/节奏/音色调制
 *   - 标点 → 停顿长度
 *
 * 输出音量默认 20%，统一归一化防止爆音。
 */

import type { Emotion } from "../sprites/AgentSprite";
import {
  getVoiceProfile,
  getEmotionMod,
  type VoiceProfile,
  type EmotionModulation,
} from "./voiceProfiles";

/* ── 音节参数 ── */
const BASE_NOTE_DURATION = 0.08;  // 单个音符基础时长 (s)
const BASE_NOTE_GAP = 0.06;       // 音符间隔 (s)
const MASTER_VOLUME = 0.2;        // 默认主音量 20%

/* 标点 → 额外停顿 (s) */
const PUNCTUATION_PAUSE: Record<string, number> = {
  "，": 0.15, ",": 0.15,
  "。": 0.35, ".": 0.35,
  "！": 0.3,  "!": 0.3,
  "？": 0.3,  "?": 0.3,
  "…": 0.4,  "~": 0.2,
  "；": 0.25, ";": 0.25,
};

/* ── 分页参数 ── */
const MAX_CHARS_PER_PAGE = 18;  // 每页最多 18 个汉字
const MIN_CHARS_PER_PAGE = 8;   // 最少 8 个（不到就单页）

export interface PlaybackCallbacks {
  /** 当前页文字需要显示到气泡 */
  onPageText: (text: string, isFirstPage: boolean) => void;
  /** 当前消息全部播放完毕 */
  onComplete: () => void;
}

/**
 * AgentVoiceEngine — 为单个 Agent 合成情绪拟声。
 *
 * 用法：
 *   const engine = new AgentVoiceEngine(agentId);
 *   await engine.speak(text, emotion, callbacks);
 *   // 或
 *   engine.speakAsync(text, emotion) → Promise<void>
 */
export class AgentVoiceEngine {
  private profile: VoiceProfile;
  private audioCtx: AudioContext | null = null;
  private aborted = false;
  private paused = false;
  private pauseResolve: (() => void) | null = null;

  constructor(private agentId: string) {
    this.profile = getVoiceProfile(agentId);
  }

  /** 注入外部 AudioContext（由 AudioManager 统一管理） */
  setAudioContext(ctx: AudioContext | null): void {
    this.audioCtx = ctx;
  }

  /** 打断当前播放 */
  abort(): void {
    this.aborted = true;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
    this.paused = false;
  }

  /** 暂停 */
  pause(): void {
    this.paused = true;
  }

  /** 恢复 */
  resume(): void {
    this.paused = false;
    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }
  }

  /**
   * 异步播放一段文字的情绪拟声。
   * 返回 Promise，resolve 时表示全部分页播放完毕。
   * BUG-044 修复：volume 支持传 number 或 () => number 回调，逐页动态检查。
   * BUG-044 修复：volume 支持传 number 或 () => number 回调，逐页动态检查。
   */
  async speak(
    text: string,
    emotion: Emotion,
    volume: number | (() => number),
    volume: number | (() => number),
    callbacks: PlaybackCallbacks,
  ): Promise<void> {
    this.aborted = false;
    const mod = getEmotionMod(emotion);
    const pages = this.paginate(text);
    // 支持动态音量查询（用于中途开启声音）
    const getVol = typeof volume === "function" ? volume : () => volume;
    // 支持动态音量查询（用于中途开启声音）
    const getVol = typeof volume === "function" ? volume : () => volume;

    for (let pi = 0; pi < pages.length; pi++) {
      if (this.aborted) break;

      // 暂停等待
      while (this.paused && !this.aborted) {
        await new Promise<void>((resolve) => { this.pauseResolve = resolve; });
      }
      if (this.aborted) break;

      const pageText = pages[pi];
      callbacks.onPageText(pageText, pi === 0);

      // BUG-044 修复：逐页动态检查音频可用性（支持中途开启声音）
      const currentVolume = getVol();
      const canPlayAudio = this.audioCtx && currentVolume > 0;
      if (canPlayAudio) {
        const ctx = this.audioCtx!;
        const globalGain = MASTER_VOLUME * currentVolume;
        await this.playPageAudio(ctx, pageText, mod, globalGain);

        if (this.aborted) break;

        // 页间阅读停顿
        const readPause = 600 + Math.random() * 400;
        await this.delay(readPause);
      } else {
        // 无声模式：仅文字分页 + 阅读停顿
        await this.delay(500 + Math.random() * 300);
      }
    }

    if (!this.aborted) {
      callbacks.onComplete();
    }
  }

  /* ================================================================
   * 内部
   * ================================================================ */

  // playSilent 已合并到 speak() 主循环中（BUG-044 修复）

  /** 为单页文字合成拟声音频 */
  private playPageAudio(
    ctx: AudioContext,
    text: string,
    mod: EmotionModulation,
    globalGain: number,
  ): Promise<void> {
    return new Promise((resolve) => {
      const now = ctx.currentTime;
      const chars = [...text.replace(/\s/g, "")]; // 去空白
      const syllableCount = Math.max(3, Math.min(chars.length, 20));
      const noteDur = BASE_NOTE_DURATION * mod.noteLength * this.profile.speed;
      const noteGap = BASE_NOTE_GAP * mod.noteGap * this.profile.speed;

      let t = now;
      for (let i = 0; i < syllableCount; i++) {
        if (this.aborted) break;

        // 音高：基础 + 情绪偏移 + 随机微调 + 语调曲线
        const curve = 1 + Math.sin((i / syllableCount) * Math.PI) * 0.3; // 句中高，句尾低
        const microShift = (Math.random() - 0.5) * 30;
        const freq = Math.max(80, Math.min(1200,
          (this.profile.basePitch + mod.pitchShift) * curve + microShift,
        ));

        // 主振荡器
        const osc = ctx.createOscillator();
        osc.type = this.profile.waveform;
        osc.frequency.setValueAtTime(freq, t);

        // 谐波（亮度）
        let gainValue = globalGain + mod.gainBoost;
        if (this.profile.waveform === "sawtooth" || this.profile.waveform === "square") {
          gainValue *= 0.6; // 降低刺耳波形音量
        }
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(gainValue, t + 0.005);
        gain.gain.linearRampToValueAtTime(0, t + noteDur);

        // 颤音
        if (this.profile.vibrato > 0) {
          const vib = ctx.createOscillator();
          vib.type = "sine";
          vib.frequency.value = this.profile.vibrato;
          const vibGain = ctx.createGain();
          vibGain.gain.value = this.profile.vibrato * 0.4;
          vib.connect(vibGain);
          vibGain.connect(osc.frequency);
          vib.start(t);
          vib.stop(t + noteDur);
        }

        // 谐波层（亮度）
        if (this.profile.brightness > 0.4) {
          const harm = ctx.createOscillator();
          harm.type = "sine";
          harm.frequency.value = freq * 1.5;
          const harmGain = ctx.createGain();
          harmGain.gain.setValueAtTime(0, t);
          harmGain.gain.linearRampToValueAtTime(
            gainValue * (this.profile.brightness - 0.4) * 0.5, t + 0.005,
          );
          harmGain.gain.linearRampToValueAtTime(0, t + noteDur);
          harm.connect(harmGain);
          harmGain.connect(ctx.destination);
          harm.start(t);
          harm.stop(t + noteDur);
        }

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + noteDur);

        // 下一个音符的时间
        const charIdx = Math.floor((i / syllableCount) * chars.length);
        const char = chars[Math.min(charIdx, chars.length - 1)] ?? "";
        const puncPause = PUNCTUATION_PAUSE[char] ?? 0;
        t += noteDur + noteGap + puncPause;
      }

      // 总时长后 resolve
      const totalDuration = (t - now) * 1000 + 50;
      setTimeout(resolve, Math.max(50, totalDuration));
    });
  }

  /** 按标点 + 长度分页，完整文本不丢失 */
  private paginate(text: string): string[] {
    if (text.length <= MAX_CHARS_PER_PAGE) return [text];

    const pages: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_CHARS_PER_PAGE) {
        pages.push(remaining);
        break;
      }

      // 在最佳断点处切割：标点 > 空格 > 中位
      let cutAt = MAX_CHARS_PER_PAGE;
      const window = remaining.slice(MIN_CHARS_PER_PAGE, MAX_CHARS_PER_PAGE);

      // 寻找标点切点
      for (const punc of ["。", "！", "？", "…", ".", "!", "?", "；", ";", "，", ","]) {
        const idx = window.lastIndexOf(punc);
        if (idx >= 0) {
          cutAt = MIN_CHARS_PER_PAGE + idx + 1;
          break;
        }
      }

      pages.push(remaining.slice(0, cutAt));
      remaining = remaining.slice(cutAt);
    }

    return pages;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
