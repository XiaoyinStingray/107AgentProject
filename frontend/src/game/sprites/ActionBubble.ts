import Phaser from "phaser";

/**
 * Agent 头顶气泡。
 *
 * 用法：
 *   const bubble = new ActionBubble(scene, sprite, "你好！");
 *   bubble.show();
 *   // 2.5s 后自动 fade out + destroy
 */
export class ActionBubble extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  private fadeTimer: Phaser.Time.TimerEvent | null = null;
  private fadeTween: Phaser.Tweens.Tween | null = null;

  /** 气泡在 Agent 上方偏移量（像素） */
  static readonly OFFSET_Y = -70;

  constructor(scene: Phaser.Scene, message: string) {
    super(scene, 0, 0);

    // 文字（先量尺寸）
    this.text = scene.add.text(0, 0, message, {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#1a1a2e",
      wordWrap: { width: 300 },
      align: "center",
    }).setOrigin(0.5, 0.5);

    const padX = 14;
    const padY = 10;
    const w = this.text.width + padX * 2;
    const h = this.text.height + padY * 2;

    // 背景圆角矩形
    this.bg = scene.add.graphics();
    this.bg.fillStyle(0xfafaf5, 0.92);
    this.bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    this.bg.lineStyle(2, 0xccccbb, 0.6);
    this.bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);

    // 小三角（指向 Agent）
    this.bg.fillStyle(0xfafaf5, 0.92);
    this.bg.fillTriangle(-6, h / 2, 6, h / 2, 0, h / 2 + 8);

    this.add(this.bg);
    this.add(this.text);
    this.setDepth(25);
    this.setAlpha(0);
  }

  /** 显示气泡，挂到 agent 上方 */
  show(parent: Phaser.GameObjects.Container): void {
    // 跟随 parent 位置
    this.x = parent.x;
    this.y = parent.y + ActionBubble.OFFSET_Y;

    // 加入场景显示列表（Phaser Container 构造时已设 this.scene，但未自动加入显示树）
    if (!this.parentContainer) {
      parent.scene.add.existing(this);
    }

    // 清除旧定时器
    this.fadeTimer?.destroy();
    this.fadeTween?.stop();

    this.setAlpha(1);
    this.setScale(0.3);

    // 弹出动画
    this.scene.tweens.add({
      targets: this,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
      ease: "Back.easeOut",
    });

    // 2.5s 后淡出
    this.fadeTimer = this.scene.time.delayedCall(2500, () => {
      this.fadeTween = this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: 400,
        onComplete: () => this.hide(),
      });
    });
  }

  /** 立即隐藏 */
  hide(): void {
    this.fadeTimer?.destroy();
    this.fadeTween?.stop();
    this.setAlpha(0);
    this.destroy();
  }
}
