/**
 * DialoguePlaybackQueue — 对话消息串行播放队列（66-A）。
 *
 * 保证：
 *   1. 全场同一时刻只有一个消息在播放（无声音重叠）
 *   2. 当前消息全部页面 + 停顿完成后，才消费下一条
 *   3. 提供暂停/恢复、清空、音量控制
 */

import type { Emotion } from "../sprites/AgentSprite";
import { AgentVoiceEngine } from "./AgentVoiceEngine";

/* ── 队列项 ── */
export interface QueuedMessage {
  agentId: string;
  name: string;
  text: string;
  emotion: Emotion;
  /** 气泡显示回调（pageText → 外部渲染气泡） */
  onBubble: (text: string, agentId: string, isFirstPage: boolean) => void;
  /** 消息播放完毕回调 */
  onDone: () => void;
}

type QueueState = "idle" | "playing" | "paused";

export class DialoguePlaybackQueue {
  private queue: QueuedMessage[] = [];
  private state: QueueState = "idle";
  private audioCtx: AudioContext | null = null;
  private engines: Map<string, AgentVoiceEngine> = new Map();
  private volume = 1.0;          // 0-1（用户控制的比例，乘上 MASTER_VOLUME=0.2）
  private muted = false;
  private enabled = false;       // 用户是否已启用声音

  /** 启用/禁用音频上下文 */
  setEnabled(enabled: boolean, ctx: AudioContext | null): void {
    this.enabled = enabled;
    this.audioCtx = enabled ? ctx : null;
    // 更新所有 engine 的 ctx
    for (const engine of this.engines.values()) {
      engine.setAudioContext(enabled ? ctx : null);
    }
  }

  isEnabled(): boolean { return this.enabled; }

  /** 设置音量 (0-1)，持久化到 localStorage */
  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    try { localStorage.setItem("m11_audio_volume", String(this.volume)); } catch {}
  }

  getVolume(): number { return this.volume; }

  /** 静音切换 */
  setMuted(m: boolean): void {
    this.muted = m;
    try { localStorage.setItem("m11_audio_muted", String(m)); } catch {}
  }

  isMuted(): boolean { return this.muted; }

  /** 获取或创建 Agent 的语音引擎 */
  private getEngine(agentId: string): AgentVoiceEngine {
    let engine = this.engines.get(agentId);
    if (!engine) {
      engine = new AgentVoiceEngine(agentId);
      engine.setAudioContext(this.audioCtx);
      this.engines.set(agentId, engine);
    }
    return engine;
  }

  /**
   * 将一条消息加入队列。
   * 如果当前队列为空且 idle → 立即开始播放。
   * 如果正在播放 → 等待当前完成后依次播放。
   */
  enqueue(msg: QueuedMessage): void {
    this.queue.push(msg);
    if (this.state === "idle") {
      this.processNext();
    }
  }

  /** 暂停当前播放 */
  pause(): void {
    if (this.state !== "playing") return;
    this.state = "paused";
    for (const engine of this.engines.values()) engine.pause();
  }

  /** 恢复播放 */
  resume(): void {
    if (this.state !== "paused") return;
    this.state = "playing";
    for (const engine of this.engines.values()) engine.resume();
    // 如果 resume 后没有在处理的消息，重新触发
    if (this.queue.length > 0) {
      this.processNext();
    }
  }

  /** 清空队列 + 打断当前播放 */
  clear(): void {
    for (const engine of this.engines.values()) engine.abort();
    this.queue.length = 0;
    this.state = "idle";
  }

  /** 销毁，释放所有音频资源 */
  destroy(): void {
    this.clear();
    this.engines.clear();
    this.audioCtx = null;
  }

  /** 取出并播放下一条 */
  private processNext(): void {
    if (this.state === "paused") return;
    if (this.queue.length === 0) {
      this.state = "idle";
      return;
    }

    this.state = "playing";
    const msg = this.queue.shift()!;
    const engine = this.getEngine(msg.agentId);
    const effectiveVolume = this.enabled && !this.muted ? this.volume : 0;

    engine.speak(
      msg.text,
      msg.emotion,
      effectiveVolume,
      {
        onPageText: (text, isFirst) => {
          msg.onBubble(text, msg.agentId, isFirst);
        },
        onComplete: () => {
          msg.onDone();
          // 消息间短暂停顿
          setTimeout(() => this.processNext(), 100);
        },
      },
    );
  }
}

/** 全局单例 */
export const playbackQueue = new DialoguePlaybackQueue();
