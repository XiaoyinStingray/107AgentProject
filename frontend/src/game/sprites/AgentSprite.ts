import Phaser from "phaser";
import { AVATAR_FRAME } from "../avatars";

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

const TILE = 64;
const CIRCLE_R = 36;

/** 情绪 → 弹窗 emoji */
const EMOTION_EMOJI: Record<string, string> = {
  neutral: "",
  happy: "😊",
  anxious: "😰",
  angry: "😡",
  sad: "😢",
};

/** 波兰球风格 — Agent 精灵。纯色球 + 白椭圆眼 + 情绪弹窗。 */
export class AgentSprite extends Phaser.GameObjects.Container {
  public agentId: string;
  public tileX: number;
  public tileY: number;
  public action: AgentSpriteData["action"];
  public emotion: AgentSpriteData["emotion"];

  private avatar: Phaser.GameObjects.Image | null = null;
  private leftEye: Phaser.GameObjects.Ellipse;
  private rightEye: Phaser.GameObjects.Ellipse;
  private leftBrow: Phaser.GameObjects.Rectangle | null = null;
  private rightBrow: Phaser.GameObjects.Rectangle | null = null;
  private mouth: Phaser.GameObjects.Ellipse;
  private nameText: Phaser.GameObjects.Text;
  private emotionPopup: Phaser.GameObjects.Text | null = null;
  private shadow: Phaser.GameObjects.Ellipse;
  private breathTween: Phaser.Tweens.Tween | null = null;
  private popupTimer: Phaser.Time.TimerEvent | null = null;

  /* —— 五官常量 —— */
  private static readonly EYE_Y = -6;
  private static readonly EYE_GAP = 8;
  private static readonly MOUTH_Y = 10;

  constructor(scene: Phaser.Scene, data: AgentSpriteData) {
    const px = data.tileX * TILE + TILE / 2;
    const py = data.tileY * TILE + TILE / 2;
    super(scene, px, py);

    this.agentId = data.agentId;
    this.tileX = data.tileX;
    this.tileY = data.tileY;
    this.action = data.action;
    this.emotion = data.emotion;

    // 阴影
    this.shadow = scene.add.ellipse(0, CIRCLE_R - 8, CIRCLE_R * 2, 18, 0x000000, 0.22);
    this.add(this.shadow);

    // 波兰球（72×72 纹理，displaySize 填满 72px 圆区域）
    const frame = AVATAR_FRAME[data.agentId] ?? 0;
    if (scene.textures.exists("avatars")) {
      this.avatar = scene.add.image(0, 0, "avatars", frame).setDisplaySize(CIRCLE_R * 2, CIRCLE_R * 2);
      this.add(this.avatar);
    }

    // 左眼
    this.leftEye = scene.add.ellipse(
      -AgentSprite.EYE_GAP, AgentSprite.EYE_Y, 12, 8, 0xffffff,
    );
    this.add(this.leftEye);

    // 右眼
    this.rightEye = scene.add.ellipse(
      AgentSprite.EYE_GAP, AgentSprite.EYE_Y, 12, 8, 0xffffff,
    );
    this.add(this.rightEye);

    // 嘴
    this.mouth = scene.add.ellipse(0, AgentSprite.MOUTH_Y, 10, 2, 0xffffff, 0.85);
    this.add(this.mouth);

    // 情绪 emoji 弹窗
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
        this.breathTween = this.scene.tweens.add({
          targets: this, scaleY: 0.96, duration: 150,
          yoyo: true, repeat: -1, ease: "Sine.easeInOut",
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
      targets: this, scaleX: 1.04, scaleY: 1.04,
      duration: 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });
  }

  /* ================================================================
   * 情绪 → 波兰球眼形
   * ================================================================ */

  setEmotion(emotion: AgentSpriteData["emotion"]): void {
    this.emotion = emotion;
    this.applyEmotion(emotion);
    this.startEmotionPopup();
  }

  private applyEmotion(emotion: AgentSpriteData["emotion"]): void {
    const ey = AgentSprite.EYE_Y;
    const gap = AgentSprite.EYE_GAP;
    const l = this.leftEye;
    const r = this.rightEye;
    const m = this.mouth;

    // 清除旧眉毛
    this.leftBrow?.destroy();
    this.rightBrow?.destroy();
    this.leftBrow = null;
    this.rightBrow = null;

    switch (emotion) {
      case "neutral":
        l.setPosition(-gap, ey).setSize(12, 8).setRotation(0).setAlpha(1);
        r.setPosition(gap, ey).setSize(12, 8).setRotation(0).setAlpha(1);
        m.setPosition(0, AgentSprite.MOUTH_Y).setSize(10, 2).setAlpha(0.85);
        break;
      case "happy":
        l.setPosition(-gap, ey - 2).setSize(11, 5).setRotation(0).setAlpha(1);
        r.setPosition(gap, ey - 2).setSize(11, 5).setRotation(0).setAlpha(1);
        // 大弧线笑嘴
        m.setPosition(0, AgentSprite.MOUTH_Y - 2).setSize(16, 5).setAlpha(0.9);
        break;
      case "anxious":
        l.setPosition(-gap + 2, ey).setSize(5, 5).setRotation(0).setAlpha(1);
        r.setPosition(gap - 2, ey).setSize(5, 5).setRotation(0).setAlpha(1);
        // 小圆张嘴
        m.setPosition(0, AgentSprite.MOUTH_Y + 2).setSize(7, 6).setAlpha(0.7);
        break;
      case "angry":
        l.setPosition(-gap, ey).setSize(11, 7).setRotation(-0.3).setAlpha(1);
        r.setPosition(gap, ey).setSize(11, 7).setRotation(0.3).setAlpha(1);
        // 下弯嘴
        m.setPosition(0, AgentSprite.MOUTH_Y + 4).setSize(10, 2.5).setAlpha(0.9);
        this.addBrows("angry");
        break;
      case "sad":
        l.setPosition(-gap, ey + 3).setSize(11, 5).setRotation(0).setAlpha(0.8);
        r.setPosition(gap, ey + 3).setSize(11, 5).setRotation(0).setAlpha(0.8);
        // 下坠小嘴
        m.setPosition(0, AgentSprite.MOUTH_Y + 7).setSize(8, 3).setAlpha(0.6);
        break;
    }
  }

  /** 画眉毛（angry 时用） */
  private addBrows(_style: string): void {
    const by = AgentSprite.EYE_Y - 9;
    const bg = AgentSprite.EYE_GAP;
    this.leftBrow = this.scene.add.rectangle(-bg - 1, by, 12, 3, 0xffffff).setRotation(-0.4);
    this.rightBrow = this.scene.add.rectangle(bg + 1, by, 12, 3, 0xffffff).setRotation(0.4);
    this.add(this.leftBrow);
    this.add(this.rightBrow);
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
        scaleX: 1.2, scaleY: 1.2,
        duration: 300, ease: "Back.easeOut",
        onComplete: () => {
          this.scene.tweens.add({
            targets: this.emotionPopup,
            alpha: 0, duration: 800, delay: 600,
          });
        },
      });
    };

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
