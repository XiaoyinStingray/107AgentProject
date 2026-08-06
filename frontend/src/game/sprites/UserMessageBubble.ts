import Phaser from "phaser";

/** A silent user-authored message displayed above the addressed Agent. */
export class UserMessageBubble extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly messageText: Phaser.GameObjects.Text;
  private fadeTimer: Phaser.Time.TimerEvent | null = null;
  private fadeTween: Phaser.Tweens.Tween | null = null;
  private onComplete: (() => void) | null = null;

  static readonly OFFSET_Y = -70;

  constructor(scene: Phaser.Scene, message: string) {
    super(scene, 0, 0);

    this.messageText = scene.add.text(0, 0, `💬 ${message}`, {
      fontSize: "20px",
      fontFamily: "monospace",
      color: "#d8f4ff",
      wordWrap: { width: 300 },
      align: "center",
    }).setOrigin(0.5, 0.5);

    const padX = 14;
    const padY = 10;
    const width = this.messageText.width + padX * 2;
    const height = this.messageText.height + padY * 2;

    this.bg = scene.add.graphics();
    this.bg.fillStyle(0x123247, 0.96);
    this.bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    this.bg.lineStyle(2, 0x4cc9f0, 0.9);
    this.bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
    this.bg.fillStyle(0x123247, 0.96);
    this.bg.fillTriangle(
      -6,
      height / 2,
      6,
      height / 2,
      0,
      height / 2 + 8,
    );

    this.add(this.bg);
    this.add(this.messageText);
    this.setDepth(31);
    this.setAlpha(0);
  }

  show(parent: Phaser.GameObjects.Container, onComplete: () => void): void {
    this.x = parent.x;
    this.y = parent.y + UserMessageBubble.OFFSET_Y;
    this.onComplete = onComplete;

    if (!this.parentContainer) parent.scene.add.existing(this);

    this.setAlpha(1);
    this.setScale(0.3);
    this.scene.tweens.add({
      targets: this,
      scaleX: 1,
      scaleY: 1,
      duration: 200,
      ease: "Back.easeOut",
    });

    const visibleDuration = Math.min(3200, 1400 + this.messageText.text.length * 45);
    this.fadeTimer = this.scene.time.delayedCall(visibleDuration, () => {
      this.fadeTween = this.scene.tweens.add({
        targets: this,
        alpha: 0,
        duration: 300,
        onComplete: () => this.complete(),
      });
    });
  }

  hide(): void {
    this.fadeTimer?.destroy();
    this.fadeTween?.stop();
    this.fadeTimer = null;
    this.fadeTween = null;
    this.onComplete = null;
    this.setAlpha(0);
    this.destroy();
  }

  private complete(): void {
    const callback = this.onComplete;
    this.onComplete = null;
    this.fadeTimer = null;
    this.fadeTween = null;
    this.destroy();
    callback?.();
  }
}
