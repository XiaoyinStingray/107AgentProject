import Phaser from "phaser";
import { AVATAR_FRAME } from "../avatars";

/**
 * Agent 精灵数据（从 React → Phaser 的单向流）。
 */
export interface AgentSpriteData {
  agentId: string;
  name: string;
  emoji: string;
  color: string;
  tileX: number;
  tileY: number;
  action: "idle" | "walk" | "sit" | "talk";
  emotion: "neutral" | "happy" | "anxious" | "angry" | "sad";
}

/* —— 常量 —— */
const TILE = 64;
const CIRCLE_R = 36;
const EMOTION_COLORS: Record<string, number> = {
  neutral: 0xCCCCCC,
  happy: 0x66CC66,
  anxious: 0xDDCC44,
  angry: 0xEE5555,
  sad: 0x8899BB,
};

/** 情绪 → 弹窗 emoji */
const EMOTION_EMOJI: Record<string, string> = {
  neutral: "",
  happy: "😊",
  anxious: "😰",
  angry: "😡",
  sad: "😢",
};

/**
 * Agent 精灵 — Phaser Container 封装。
 *
 * 视觉层级（从底到顶）：
 *   阴影椭圆 → 自制头像 → 情绪光环 → 情绪 emoji 弹窗 → 名字标签
 */
export class AgentSprite extends Phaser.GameObjects.Container {
  public agentId: string;
  public tileX: number;
  public tileY: number;
  public action: AgentSpriteData["action"];
  public emotion: AgentSpriteData["emotion"];

  private avatar: Phaser.GameObjects.Image | null = null;
  private nameText: Phaser.GameObjects.Text;
  private emotionRing: Phaser.GameObjects.Arc;
  private emotionPopup: Phaser.GameObjects.Text | null = null;
  private shadow: Phaser.GameObjects.Ellipse;
  private colorHex: string;
  private breathTween: Phaser.Tweens.Tween | null = null;
  private popupTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, data: AgentSpriteData) {
    const px = data.tileX * TILE + TILE / 2;
    const py = data.tileY * TILE + TILE / 2;
    super(scene, px, py);

    this.agentId = data.agentId;
    this.tileX = data.tileX;
    this.tileY = data.tileY;
    this.action = data.action;
    this.emotion = data.emotion;
    this.colorHex = data.color;

    // 阴影
    this.shadow = scene.add.ellipse(0, CIRCLE_R - 8, CIRCLE_R * 2, 18, 0x000000, 0.22);
    this.add(this.shadow);

    // 自制头像纹理（替代 emoji）
    const frame = AVATAR_FRAME[data.agentId] ?? 0;
    if (scene.textures.exists("avatars")) {
      this.avatar = scene.add.image(0, 0, "avatars", frame).setDisplaySize(CIRCLE_R * 2, CIRCLE_R * 2);
      this.add(this.avatar);
    }

    // 情绪光环（外圈）
    this.emotionRing = scene.add.circle(0, 0, CIRCLE_R + 5);
    this.emotionRing.setStrokeStyle(3, EMOTION_COLORS.neutral, 0);
    this.emotionRing.setFillStyle(0xffffff, 0);
    this.add(this.emotionRing);

    // 情绪 emoji 弹窗（初始隐藏）
    this.emotionPopup = scene.add.text(CIRCLE_R - 8, -CIRCLE_R + 6, "", {
      fontSize: "20px",
      fontFamily: "sans-serif",
    }).setOrigin(0.5).setAlpha(0).setScale(0);
    this.add(this.emotionPopup);

    // 名字
    this.nameText = scene.add.text(0, CIRCLE_R + 10, data.name, {
      fontSize: "16px",
      fontFamily: "monospace",
      color: "#e0e0e0",
      backgroundColor: "rgba(0,0,0,0.55)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0);
    this.add(this.nameText);

    // 初始动作 + 情绪
    this.applyAction(data.action);
    this.applyEmotion(data.emotion);
    this.startEmotionPopup();

    scene.add.existing(this);
    this.setDepth(15);
  }

  /* ================================================================
   * 位置
   * ================================================================ */

  setTile(tx: number, ty: number): void {
    this.tileX = tx;
    this.tileY = ty;
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE / 2;
  }

  moveToTile(tx: number, ty: number, duration = 300): Promise<void> {
    return new Promise((resolve) => {
      this.tileX = tx;
      this.tileY = ty;
      this.scene.tweens.add({
        targets: this,
        x: tx * TILE + TILE / 2,
        y: ty * TILE + TILE / 2,
        duration,
        ease: "Sine.easeInOut",
        onComplete: () => resolve(),
      });
    });
  }

  /* ================================================================
   * 动作
   * ================================================================ */

  setAction(action: AgentSpriteData["action"]): void {
    this.action = action;
    this.applyAction(action);
  }

  private applyAction(action: AgentSpriteData["action"]): void {
    this.breathTween?.stop();
    this.breathTween = null;

    switch (action) {
      case "idle":
        this.setScale(1);
        this.setAlpha(1);
        this.nameText.setVisible(true);
        this.startBreath();
        break;
      case "walk":
        this.setScale(1);
        this.setAlpha(1);
        this.nameText.setVisible(true);
        // walk 时轻微弹跳
        this.breathTween = this.scene.tweens.add({
          targets: this,
          scaleY: 0.96,
          duration: 150,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        break;
      case "sit":
        this.setScale(0.78);
        this.y += 8;
        this.nameText.setVisible(true);
        break;
      case "talk":
        this.setScale(1);
        this.setAlpha(1);
        this.nameText.setVisible(true);
        this.startBreath();
        break;
    }
  }

  private startBreath(): void {
    this.breathTween = this.scene.tweens.add({
      targets: this,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /* ================================================================
   * 情绪
   * ================================================================ */

  setEmotion(emotion: AgentSpriteData["emotion"]): void {
    this.emotion = emotion;
    this.applyEmotion(emotion);
    this.startEmotionPopup();
  }

  private applyEmotion(emotion: AgentSpriteData["emotion"]): void {
    const color = EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral;
    const alpha = emotion === "neutral" ? 0 : 0.7;
    this.emotionRing.setStrokeStyle(3, color, alpha);

    if (emotion === "angry" || emotion === "happy") {
      this.scene.tweens.add({
        targets: this.emotionRing,
        alpha: 1,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 400,
        yoyo: true,
        repeat: 2,
      });
    }
  }

  /* ================================================================
   * 情绪 emoji 弹窗
   * ================================================================ */

  private startEmotionPopup(): void {
    this.popupTimer?.destroy();
    if (!this.emotionPopup) return;

    const emoji = EMOTION_EMOJI[this.emotion];
    if (!emoji) {
      this.emotionPopup.setAlpha(0).setScale(0);
      return;
    }

    this.emotionPopup.setText(emoji);

    const show = () => {
      if (!this.emotionPopup || !this.scene) return;
      this.emotionPopup.setAlpha(1).setScale(0.3);
      this.scene.tweens.add({
        targets: this.emotionPopup,
        scaleX: 1.2,
        scaleY: 1.2,
        duration: 300,
        ease: "Back.easeOut",
        onComplete: () => {
          this.scene.tweens.add({
            targets: this.emotionPopup,
            alpha: 0,
            duration: 800,
            delay: 600,
          });
        },
      });
    };

    // 立即弹一次，然后每 5-8 秒循环
    show();
    this.popupTimer = this.scene.time.addEvent({
      delay: 5000 + Math.random() * 3000,
      loop: true,
      callback: show,
    });
  }

  /* ================================================================
   * 清理
   * ================================================================ */

  destroy(fromScene?: boolean): void {
    this.breathTween?.stop();
    this.popupTimer?.destroy();
    super.destroy(fromScene);
  }
}
