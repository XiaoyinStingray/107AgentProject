/**
 * EmojiDrop — Step 99b: 绘文字投掷系统。
 *
 * 用户点击/触摸场景空地 → emoji 从顶部落下 → 着地效果。
 * 落在 Agent 附近 → Agent 反应动画 + 表情变化。
 * 纯前端 Phaser 粒子，零后端改动。
 */

import Phaser from "phaser";
import type { AgentSprite, Emotion } from "../sprites/AgentSprite";

// ── Emoji 与反应映射 ──

interface EmojiReaction {
  /** Agent 收到 emoji 后的情绪 */
  emotion: Emotion;
  /** 是否触发粒子爆发 */
  burst: boolean;
  /** Agent 动画类型 */
  animation: "jump" | "look" | "shake" | "blown" | "sway" | "startled";
}

const EMOJI_REACTIONS: Record<string, EmojiReaction> = {
  "❤️": { emotion: "happy", burst: true, animation: "jump" },
  "😡": { emotion: "angry", burst: true, animation: "look" },
  "🌸": { emotion: "happy", burst: true, animation: "jump" },
  "💣": { emotion: "surprised", burst: true, animation: "blown" },
  "🎵": { emotion: "excited", burst: true, animation: "sway" },
  "👻": { emotion: "surprised", burst: true, animation: "startled" },
};

// ── 常量 ──

const TILE = 64;
const PROXIMITY_TILES = 2; // Agent 反应范围（tile）
const MIN_CLICK_INTERVAL = 500; // 最小点击间隔 ms
const MAX_SIMULTANEOUS = 3; // 最多同时 3 个 emoji
const AGENT_REACTION_COOLDOWN = 5000; // 同一 Agent 反应冷却 ms
const FRIENDLY_BLOCK_COUNT = 3; // 连砸 3 次 → 友尽冷却
const FRIENDLY_BLOCK_DURATION = 30000; // 友尽冷却 30s

// ── 类型 ──

interface ActiveEmoji {
  sprite: Phaser.GameObjects.Text;
  tween: Phaser.Tweens.Tween;
}

// ================================================================
// EmojiDrop
// ================================================================

export class EmojiDrop {
  private scene: Phaser.Scene;
  private active: ActiveEmoji[] = [];
  private lastClickTime = 0;
  private agentReactionCooldowns: Map<string, number> = new Map();
  private agentHitCounts: Map<string, number> = new Map();
  private agentBlockedUntil: Map<string, number> = new Map();
  private mapW = 16;
  private mapH = 12;
  private selectedEmoji = "❤️"; // 默认选中

  /** 获取所有 Agent 精灵 */
  private getAgents: () => Map<string, AgentSprite> = () => new Map();

  /** 拒绝提示回调 */
  private onReject: ((message: string) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  setMapSize(w: number, h: number): void {
    this.mapW = w;
    this.mapH = h;
  }

  setGetAgents(fn: () => Map<string, AgentSprite>): void {
    this.getAgents = fn;
  }

  onRejectMessage(cb: (message: string) => void): void {
    this.onReject = cb;
  }

  /** 设置当前选中的 emoji */
  setSelectedEmoji(emoji: string): void {
    this.selectedEmoji = emoji;
  }

  /** 处理点击投掷 */
  handleClick(worldX: number, worldY: number): boolean {
    const now = Date.now();

    // 防连点
    if (now - this.lastClickTime < MIN_CLICK_INTERVAL) return false;
    this.lastClickTime = now;

    // 单屏上限
    if (this.active.length >= MAX_SIMULTANEOUS) {
      this.onReject?.("慢一点~");
      return false;
    }

    // 使用当前选中的 emoji
    const emoji = this.selectedEmoji;

    this.dropEmoji(emoji, worldX, worldY);
    return true;
  }

  /** 投掷指定 emoji */
  private dropEmoji(emoji: string, worldX: number, worldY: number): void {
    const startY = -20;
    const endY = worldY;

    // 创建 emoji 文字
    const text = this.scene.add.text(worldX, startY, emoji, {
      fontSize: "32px",
      fontFamily: "\"Segoe UI Emoji\", \"Apple Color Emoji\", \"Noto Color Emoji\", sans-serif",
    }).setOrigin(0.5).setDepth(30).setAlpha(0.9);

    // 下落动画
    const tween = this.scene.tweens.add({
      targets: text,
      y: endY,
      duration: 600 + Math.random() * 300,
      ease: "Bounce.easeOut",
      onComplete: () => {
        this.onEmojiLand(emoji, text);
        // 从活跃列表移除
        const idx = this.active.findIndex((a) => a.sprite === text);
        if (idx >= 0) this.active.splice(idx, 1);
      },
    });

    this.active.push({ sprite: text, tween });
  }

  /** Emoji 着地 → 检查 Agent 反应 */
  private onEmojiLand(emoji: string, text: Phaser.GameObjects.Text): void {
    const now = Date.now();
    const tileX = Math.round(text.x / TILE);
    const tileY = Math.round(text.y / TILE);

    const reaction = EMOJI_REACTIONS[emoji];
    if (!reaction) {
      this.fadeAndDestroy(text);
      return;
    }

    // 🌸 特殊：地上长花
    if (emoji === "🌸") {
      this.spawnFlowers(tileX, tileY);
    }

    // 💣 特殊：爆炸
    if (emoji === "💣") {
      this.spawnExplosion(text.x, text.y);
    }

    // 检查 Agent 附近
    const agents = this.getAgents();
    let hitAgent: AgentSprite | null = null;
    let minDist = Infinity;

    for (const [, sprite] of agents) {
      const dist = Math.abs(sprite.tileX - tileX) + Math.abs(sprite.tileY - tileY);
      if (dist <= PROXIMITY_TILES && dist < minDist) {
        minDist = dist;
        hitAgent = sprite;
      }
    }

    if (hitAgent) {
      // 检查 Agent 是否被友尽屏蔽
      const blockedUntil = this.agentBlockedUntil.get(hitAgent.agentId) ?? 0;
      if (now < blockedUntil) {
        this.showAgentAvoid(hitAgent);
        this.fadeAndDestroy(text);
        return;
      }

      // 检查反应冷却
      const lastReaction = this.agentReactionCooldowns.get(hitAgent.agentId) ?? 0;
      if (now - lastReaction < AGENT_REACTION_COOLDOWN) {
        this.fadeAndDestroy(text);
        return;
      }

      // 记录击中
      const hits = (this.agentHitCounts.get(hitAgent.agentId) ?? 0) + 1;
      this.agentHitCounts.set(hitAgent.agentId, hits);

      // 连砸检测
      if (hits >= FRIENDLY_BLOCK_COUNT) {
        this.agentBlockedUntil.set(hitAgent.agentId, now + FRIENDLY_BLOCK_DURATION);
        this.agentHitCounts.set(hitAgent.agentId, 0);
        this.showAgentBlocked(hitAgent);
        this.fadeAndDestroy(text);
        return;
      }

      // 正常反应
      this.agentReactionCooldowns.set(hitAgent.agentId, now);
      hitAgent.setEmotion(reaction.emotion);

      // 触发粒子爆发
      if (reaction.burst) {
        import("../effects/EmoteBurst").then(({ emoteBurst }) => {
          emoteBurst(this.scene, hitAgent!.x, hitAgent!.y, reaction.emotion, hitAgent!.agentId);
        });
      }

      // 动画
      this.playAgentReactionAnimation(hitAgent, reaction.animation);
    }

    // emoji 着地后淡出
    this.fadeAndDestroy(text);
  }

  /** Agent 反应动画 */
  private playAgentReactionAnimation(
    sprite: AgentSprite,
    animation: EmojiReaction["animation"],
  ): void {
    const origY = sprite.y;
    switch (animation) {
      case "jump":
        this.scene.tweens.add({
          targets: sprite, y: origY - 20, duration: 200, yoyo: true, ease: "Back.easeOut",
        });
        break;
      case "look":
        this.scene.tweens.add({
          targets: sprite, scaleX: 1.1, scaleY: 1.1, duration: 150, yoyo: true,
        });
        break;
      case "shake":
        this.scene.tweens.add({
          targets: sprite, x: sprite.x + 4, duration: 50, yoyo: true, repeat: 3,
        });
        break;
      case "blown":
        this.scene.tweens.add({
          targets: sprite, y: origY - 30, x: sprite.x + (Math.random() > 0.5 ? 30 : -30),
          angle: Math.random() * 360, duration: 400,
          onComplete: () => {
            this.scene.tweens.add({
              targets: sprite, y: origY, angle: 0, duration: 500, ease: "Bounce.easeOut",
            });
          },
        });
        break;
      case "sway":
        this.scene.tweens.add({
          targets: sprite, angle: 8, duration: 300, yoyo: true, repeat: 2,
          onComplete: () => { sprite.angle = 0; },
        });
        break;
      case "startled":
        this.scene.tweens.add({
          targets: sprite, y: origY - 25, scaleX: 1.2, scaleY: 0.8,
          duration: 100, yoyo: true,
          onComplete: () => {
            sprite.setScale(1); sprite.y = origY;
          },
        });
        break;
    }
  }

  /** Agent 避开（友尽屏蔽） */
  private showAgentAvoid(sprite: AgentSprite): void {
    // 闪避动画
    const origX = sprite.x;
    this.scene.tweens.add({
      targets: sprite, x: origX + (Math.random() > 0.5 ? 40 : -40), duration: 200,
      yoyo: true, ease: "Sine.easeOut",
    });
    // 显示 🚫
    const blockText = this.scene.add.text(sprite.x, sprite.y - 40, "🚫", {
      fontSize: "24px",
    }).setOrigin(0.5).setDepth(35);
    this.scene.tweens.add({
      targets: blockText, alpha: 0, y: sprite.y - 60, duration: 1500,
      onComplete: () => blockText.destroy(),
    });
  }

  /** Agent 被友尽 */
  private showAgentBlocked(sprite: AgentSprite): void {
    const blockText = this.scene.add.text(sprite.x, sprite.y - 40, "🚫 友尽!", {
      fontSize: "18px", fontFamily: "monospace",
      color: "#FF6B6B", backgroundColor: "rgba(0,0,0,0.7)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5).setDepth(35);
    this.scene.tweens.add({
      targets: blockText, alpha: 0, y: sprite.y - 70, duration: 2000,
      onComplete: () => blockText.destroy(),
    });
    // 闪避动画
    this.scene.tweens.add({
      targets: sprite, x: sprite.x + 40, duration: 300,
      onComplete: () => {
        this.scene.tweens.add({
          targets: sprite, x: sprite.x - 40, duration: 600, ease: "Sine.easeInOut",
        });
      },
    });
  }

  /** 💣 爆炸特效 */
  private spawnExplosion(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const p = this.scene.add.circle(x, y, 4, 0xFF8800, 0.8).setDepth(31);
      const angle = (Math.PI * 2 * i) / 8;
      const dist = 30 + Math.random() * 20;
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        duration: 500, ease: "Sine.easeOut",
        onComplete: () => p.destroy(),
      });
    }
    // 震屏
    this.scene.cameras.main.shake(150, 0.005);
  }

  /** 🌸 地上长花 */
  private spawnFlowers(tileX: number, tileY: number): void {
    const px = tileX * TILE + TILE / 2;
    const py = tileY * TILE + TILE / 2;
    const flowers = ["🌸", "🌼", "🌺"];
    for (let i = 0; i < 3; i++) {
      const f = this.scene.add.text(
        px + (i - 1) * 16, py, flowers[i],
        { fontSize: "20px" },
      ).setOrigin(0.5).setDepth(5).setAlpha(0).setScale(0);
      this.scene.tweens.add({
        targets: f, alpha: 1, scaleX: 1, scaleY: 1, duration: 400, delay: i * 100,
        ease: "Back.easeOut",
      });
      // 30s 后消失
      this.scene.time.delayedCall(30000, () => {
        this.scene.tweens.add({
          targets: f, alpha: 0, duration: 500, onComplete: () => f.destroy(),
        });
      });
    }
  }

  /** 淡出并销毁 */
  private fadeAndDestroy(text: Phaser.GameObjects.Text): void {
    this.scene.tweens.add({
      targets: text, alpha: 0, scaleX: 0.5, scaleY: 0.5, duration: 500, delay: 200,
      onComplete: () => text.destroy(),
    });
  }

  /** 清理所有活跃 emoji */
  destroy(): void {
    this.active.forEach(({ sprite, tween }) => {
      tween.stop();
      sprite.destroy();
    });
    this.active = [];
  }
}
