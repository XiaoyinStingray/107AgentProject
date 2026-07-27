import Phaser from "phaser";

/**
 * Agent 精灵数据（从 React → Phaser 的单向流）。
 * tileX/tileY 使用 Step 62 统一 32px 坐标系统。
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
const CIRCLE_R = 36; // 精灵圆半径
const EMOTION_COLORS: Record<string, number> = {
  neutral: 0xCCCCCC,
  happy: 0x66CC66,
  anxious: 0xDDCC44,
  angry: 0xEE5555,
  sad: 0x8899BB,
};

/**
 * Agent 精灵 — Phaser Container 封装。
 *
 * 视觉层级（从底到顶）：
 *   阴影椭圆 → 个性色圆 → emoji 文字 → 情绪光环 → 名字标签
 *
 * 动作效果：
 *   idle  — 微呼吸 scale (1.0 ↔ 1.04)
 *   walk  — 正常大小（移动 tween 由 MapScene 驱动）
 *   sit   — scale 0.78 + 向下偏移 4px
 *   talk  — 无自身变化（气泡由 ActionBubble 负责）
 */
export class AgentSprite extends Phaser.GameObjects.Container {
  public agentId: string;
  public tileX: number;
  public tileY: number;
  public action: AgentSpriteData["action"];
  public emotion: AgentSpriteData["emotion"];

  private circle: Phaser.GameObjects.Arc;
  private emojiText: Phaser.GameObjects.Text;
  private nameText: Phaser.GameObjects.Text;
  private emotionRing: Phaser.GameObjects.Arc;
  private shadow: Phaser.GameObjects.Ellipse;
  private colorHex: string;
  private breathTween: Phaser.Tweens.Tween | null = null;

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

    // 主体圆
    this.circle = scene.add.circle(0, 0, CIRCLE_R, Phaser.Display.Color.HexStringToColor(data.color).color);
    this.circle.setStrokeStyle(3, 0xffffff, 0.3);
    this.add(this.circle);

    // 情绪光环（外圈，初始透明）
    this.emotionRing = scene.add.circle(0, 0, CIRCLE_R + 5);
    this.emotionRing.setStrokeStyle(3, EMOTION_COLORS.neutral, 0);
    this.emotionRing.setFillStyle(0xffffff, 0);
    this.add(this.emotionRing);

    // emoji
    this.emojiText = scene.add.text(0, 2, data.emoji, {
      fontSize: "28px",
      fontFamily: "sans-serif",
    }).setOrigin(0.5);
    this.add(this.emojiText);

    // 名字
    this.nameText = scene.add.text(0, CIRCLE_R + 10, data.name, {
      fontSize: "16px",
      fontFamily: "monospace",
      color: "#e0e0e0",
      backgroundColor: "rgba(0,0,0,0.55)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0);
    this.add(this.nameText);

    // 初始动作
    this.applyAction(data.action);
    this.applyEmotion(data.emotion);

    scene.add.existing(this);
    this.setDepth(15); // 高于物品层 (2) 和天气层 (10)
  }

  /* ================================================================
   * 位置
   * ================================================================ */

  /** 设置 tile 坐标（不带动画），立即更新像素位置 */
  setTile(tx: number, ty: number): void {
    this.tileX = tx;
    this.tileY = ty;
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE / 2;
  }

  /** 带动画的 tile 移动 */
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
    // 停止呼吸
    this.breathTween?.stop();
    this.breathTween = null;

    switch (action) {
      case "idle":
        this.setScale(1);
        this.setAlpha(1);
        this.emojiText.setY(1);
        this.startBreath();
        break;
      case "walk":
        this.setScale(1);
        this.setAlpha(1);
        this.emojiText.setY(1);
        // walk 时轻微上下弹跳
        this.breathTween = this.scene.tweens.add({
          targets: this.emojiText,
          y: -1,
          duration: 150,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        break;
      case "sit":
        this.setScale(0.78);
        this.y += 8;
        this.emojiText.setY(0);
        break;
      case "talk":
        this.setScale(1);
        this.setAlpha(1);
        this.emojiText.setY(1);
        this.startBreath();
        break;
    }
  }

  /** idle 呼吸动画 */
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
  }

  private applyEmotion(emotion: AgentSpriteData["emotion"]): void {
    const color = EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral;
    const alpha = emotion === "neutral" ? 0 : 0.7;
    this.emotionRing.setStrokeStyle(2, color, alpha);

    // 强烈情绪时脉冲光环
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
   * 清理
   * ================================================================ */

  destroy(fromScene?: boolean): void {
    this.breathTween?.stop();
    super.destroy(fromScene);
  }
}
