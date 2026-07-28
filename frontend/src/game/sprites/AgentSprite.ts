import Phaser from "phaser";
import { AVATAR_FRAME } from "../avatars";
import { emoteBurst } from "../effects/EmoteBurst";

export type Emotion =
  | "neutral" | "happy" | "anxious" | "angry" | "sad"
  | "surprised" | "confused" | "tired" | "excited";

export interface AgentSpriteData {
  agentId: string;
  name: string;
  emoji: string;
  color: string;
  tileX: number;
  tileY: number;
  action: "idle" | "walk" | "sit" | "talk";
  emotion: Emotion;
}

const TILE = 64;
const CIRCLE_R = 36;

const EMOTION_EMOJI: Record<Emotion, string> = {
  neutral: "",
  happy: "😊",
  anxious: "😰",
  angry: "😡",
  sad: "😢",
  surprised: "😲",
  confused: "😵",
  tired: "😴",
  excited: "🤩",
};

/** 表情参数 */
interface Face {
  eyeW: number; eyeH: number; eyeY: number; eyeGap: number; eyeRot: number; eyeA: number;
  mW: number; mH: number; mY: number; mA: number;
  brows?: true;
}

/** 同情绪 2-3 种微变体，随机选取 */
const FACES: Record<Emotion, Face[]> = {
  neutral: [
    { eyeW:12, eyeH:8,  eyeY:-6, eyeGap:8, eyeRot:0,   eyeA:1,   mW:10, mH:2,  mY:10, mA:0.85 },
    { eyeW:11, eyeH:7,  eyeY:-6, eyeGap:9, eyeRot:0,   eyeA:1,   mW:9,  mH:2,  mY:10, mA:0.8  },
  ],
  happy: [
    { eyeW:11, eyeH:5,  eyeY:-8, eyeGap:8, eyeRot:0,   eyeA:1,   mW:16, mH:5,  mY:8,  mA:0.9  },
    { eyeW:10, eyeH:4,  eyeY:-8, eyeGap:9, eyeRot:0,   eyeA:1,   mW:14, mH:4,  mY:9,  mA:0.85 },
    { eyeW:12, eyeH:6,  eyeY:-7, eyeGap:8, eyeRot:0,   eyeA:1,   mW:15, mH:6,  mY:8,  mA:0.9  },
  ],
  anxious: [
    { eyeW:5,  eyeH:5,  eyeY:-6, eyeGap:6, eyeRot:0,   eyeA:1,   mW:7,  mH:6,  mY:12, mA:0.7  },
    { eyeW:6,  eyeH:6,  eyeY:-6, eyeGap:5, eyeRot:0,   eyeA:1,   mW:6,  mH:5,  mY:13, mA:0.65 },
  ],
  angry: [
    { eyeW:11, eyeH:7,  eyeY:-6, eyeGap:8, eyeRot:-0.3, eyeA:1,  mW:10, mH:2.5,mY:14, mA:0.9, brows:true },
    { eyeW:10, eyeH:6,  eyeY:-6, eyeGap:8, eyeRot:-0.3, eyeA:1,  mW:8,  mH:2,  mY:14, mA:0.85,brows:true },
    { eyeW:12, eyeH:8,  eyeY:-5, eyeGap:7, eyeRot:-0.3, eyeA:1,  mW:11, mH:3,  mY:14, mA:0.9, brows:true },
  ],
  sad: [
    { eyeW:11, eyeH:5,  eyeY:-3, eyeGap:8, eyeRot:0,   eyeA:0.8, mW:8,  mH:3,  mY:17, mA:0.6  },
    { eyeW:10, eyeH:4,  eyeY:-3, eyeGap:9, eyeRot:0,   eyeA:0.7, mW:7,  mH:2,  mY:17, mA:0.55 },
  ],
  surprised: [
    { eyeW:8,  eyeH:12, eyeY:-6, eyeGap:8, eyeRot:0,   eyeA:1,   mW:10, mH:10, mY:12, mA:0.85 },
    { eyeW:7,  eyeH:11, eyeY:-6, eyeGap:9, eyeRot:0,   eyeA:1,   mW:9,  mH:9,  mY:13, mA:0.8  },
  ],
  confused: [
    { eyeW:14, eyeH:8,  eyeY:-8, eyeGap:7, eyeRot:-0.15,eyeA:0.9, mW:10, mH:3,  mY:10, mA:0.6, brows:true },
    { eyeW:13, eyeH:7,  eyeY:-7, eyeGap:8, eyeRot:-0.1, eyeA:0.85,mW:9,  mH:3,  mY:11, mA:0.55,brows:true },
  ],
  tired: [
    { eyeW:12, eyeH:4,  eyeY:-4, eyeGap:9, eyeRot:0,   eyeA:0.7, mW:7,  mH:2,  mY:12, mA:0.5  },
    { eyeW:11, eyeH:3,  eyeY:-4, eyeGap:10,eyeRot:0,   eyeA:0.65,mW:6,  mH:2,  mY:13, mA:0.45 },
  ],
  excited: [
    { eyeW:7,  eyeH:10, eyeY:-8, eyeGap:8, eyeRot:0,   eyeA:1,   mW:14, mH:6,  mY:8,  mA:0.9  },
    { eyeW:8,  eyeH:11, eyeY:-8, eyeGap:7, eyeRot:0,   eyeA:1,   mW:16, mH:7,  mY:7,  mA:0.9  },
    { eyeW:6,  eyeH:9,  eyeY:-8, eyeGap:9, eyeRot:0,   eyeA:1,   mW:13, mH:5,  mY:9,  mA:0.85 },
  ],
};

function pickFace(emotion: Emotion): Face {
  const variants = FACES[emotion] ?? FACES.neutral;
  return variants[Math.floor(Math.random() * variants.length)];
}

/** 波兰球风格 — Agent 精灵。彩色球 + 白椭圆眼 + 嘴 + 情绪弹窗。 */
export class AgentSprite extends Phaser.GameObjects.Container {
  public agentId: string;
  public tileX: number;
  public tileY: number;
  public action: AgentSpriteData["action"];
  public emotion: Emotion;

  private ball: Phaser.GameObjects.Arc | Phaser.GameObjects.Image | null = null;
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

    // 球体：优先用预生成纹理（有渐变），未知 Agent 用纯色 Circle
    const frame = AVATAR_FRAME[data.agentId];
    if (frame !== undefined && scene.textures.exists("avatars")) {
      this.ball = scene.add.image(0, 0, "avatars", frame).setDisplaySize(CIRCLE_R * 2, CIRCLE_R * 2);
    } else {
      this.ball = scene.add.circle(
        0, 0, CIRCLE_R - 2,
        Phaser.Display.Color.HexStringToColor(data.color).color, 1,
      );
      this.ball.setStrokeStyle(2, 0xffffff, 0.25);
    }
    this.add(this.ball);

    // 左眼
    this.leftEye = scene.add.ellipse(-8, -6, 12, 8, 0xffffff);
    this.add(this.leftEye);
    // 右眼
    this.rightEye = scene.add.ellipse(8, -6, 12, 8, 0xffffff);
    this.add(this.rightEye);
    // 嘴
    this.mouth = scene.add.ellipse(0, 10, 10, 2, 0xffffff, 0.85);
    this.add(this.mouth);

    // 情绪 emoji 弹窗
    this.emotionPopup = scene.add.text(CIRCLE_R - 8, -CIRCLE_R + 6, "", {
      fontSize: "20px", fontFamily: "sans-serif",
    }).setOrigin(0.5).setAlpha(0).setScale(0);
    this.add(this.emotionPopup);

    // 名字
    this.nameText = scene.add.text(0, CIRCLE_R + 10, data.name, {
      fontSize: "16px", fontFamily: "monospace",
      color: "#e0e0e0", backgroundColor: "rgba(0,0,0,0.55)",
      padding: { x: 6, y: 3 },
    }).setOrigin(0.5, 0);
    this.add(this.nameText);

    this.applyEmotion(data.emotion);
    this.setAction(data.action);
    this.startEmotionPopup();

    scene.add.existing(this);
    this.setDepth(15);
  }

  /* ================================================================
   * 位置
   * ================================================================ */
  setTile(tx: number, ty: number): void {
    this.tileX = tx; this.tileY = ty;
    this.x = tx * TILE + TILE / 2; this.y = ty * TILE + TILE / 2;
  }

  /* ================================================================
   * 动作
   * ================================================================ */
  setAction(action: AgentSpriteData["action"]): void {
    this.action = action;
    this.breathTween?.stop(); this.breathTween = null;
    this.setScale(1); this.setAlpha(1); this.nameText.setVisible(true);
    switch (action) {
      case "idle": this.startBreath(); break;
      case "walk":
        this.breathTween = this.scene.tweens.add({
          targets: this, scaleY: 0.96, duration: 150, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
        }); break;
      case "sit": this.setScale(0.78); this.y += 8; break;
      case "talk": this.startBreath(); break;
    }
  }
  private startBreath(): void {
    this.breathTween = this.scene.tweens.add({
      targets: this, scaleX: 1.04, scaleY: 1.04,
      duration: 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut",
    });
  }

  /* ================================================================
   * 情绪 → 表情参数
   * ================================================================ */
  setEmotion(emotion: Emotion): void {
    this.emotion = emotion;
    this.applyEmotion(emotion);
    this.startEmotionPopup();
    // 粒子爆发（非 neutral）
    if (emotion !== "neutral" && this.scene) {
      emoteBurst(this.scene, this.x, this.y, emotion);
    }
  }

  private applyEmotion(emotion: Emotion): void {
    const f = pickFace(emotion);
    // 眼睛
    this.leftEye.setPosition(-f.eyeGap, f.eyeY).setSize(f.eyeW, f.eyeH)
      .setRotation(emotion === "angry" ? -0.3 : f.eyeRot).setAlpha(f.eyeA);
    this.rightEye.setPosition(f.eyeGap, f.eyeY).setSize(f.eyeW, f.eyeH)
      .setRotation(emotion === "angry" ? 0.3 : f.eyeRot).setAlpha(f.eyeA);
    // 嘴
    this.mouth.setPosition(0, f.mY).setSize(f.mW, f.mH).setAlpha(f.mA);
    // 眉毛
    this.leftBrow?.destroy(); this.rightBrow?.destroy();
    this.leftBrow = null; this.rightBrow = null;
    if (f.brows) {
      const by = f.eyeY - 9;
      this.leftBrow = this.scene.add.rectangle(-f.eyeGap - 1, by, 12, 3, 0xffffff).setRotation(-0.4);
      this.rightBrow = this.scene.add.rectangle(f.eyeGap + 1, by, 12, 3, 0xffffff).setRotation(0.4);
      this.add(this.leftBrow); this.add(this.rightBrow);
    }
  }

  /* ================================================================
   * 情绪 emoji 弹窗
   * ================================================================ */
  private startEmotionPopup(): void {
    this.popupTimer?.destroy();
    if (!this.emotionPopup) return;
    const emoji = EMOTION_EMOJI[this.emotion];
    if (!emoji) { this.emotionPopup.setAlpha(0).setScale(0); return; }
    this.emotionPopup.setText(emoji);
    const show = () => {
      if (!this.emotionPopup || !this.scene) return;
      this.emotionPopup.setAlpha(1).setScale(0.3);
      this.scene.tweens.add({
        targets: this.emotionPopup, scaleX: 1.2, scaleY: 1.2, duration: 300, ease: "Back.easeOut",
        onComplete: () => { this.scene.tweens.add({ targets: this.emotionPopup, alpha: 0, duration: 800, delay: 600 }); },
      });
    };
    show();
    this.popupTimer = this.scene.time.addEvent({ delay: 5000 + Math.random() * 3000, loop: true, callback: show });
  }

  destroy(fromScene?: boolean): void {
    this.breathTween?.stop(); this.popupTimer?.destroy();
    super.destroy(fromScene);
  }
}
