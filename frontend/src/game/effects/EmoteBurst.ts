import Phaser from "phaser";

/**
 * 情绪粒子爆发 — 在 Agent 周身发射彩色粒子。
 * 在 AgentSprite.setEmotion() 中调用。
 */

const COLORS: Record<string, number> = {
  happy: 0x66CC66,
  anxious: 0xDDCC44,
  angry: 0xEE5555,
  sad: 0x8899BB,
  surprised: 0xFFAA44,
  confused: 0xCC88FF,
  tired: 0xAAAAAA,
  excited: 0xFF88CC,
};

const lastBurst: Record<string, number> = {};

export function emoteBurst(scene: Phaser.Scene, x: number, y: number, emotion: string, agentId?: string): void {
  const color = COLORS[emotion];
  if (color === undefined) return;
  // 同 Agent 1s 内不重复爆发
  const key = agentId ?? "global";
  if (Date.now() - (lastBurst[key] ?? 0) < 1000) return;
  lastBurst[key] = Date.now();

  const count = emotion === "angry" || emotion === "excited" ? 14 : 8;
  const particles: Phaser.GameObjects.Arc[] = [];

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 40 + Math.random() * 30;
    const size = 2 + Math.random() * 3;
    const p = scene.add.circle(x, y, size, color, 0.8).setDepth(20);
    particles.push(p);

    scene.tweens.add({
      targets: p,
      x: x + Math.cos(angle) * speed,
      y: y + Math.sin(angle) * speed,
      alpha: 0,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 500 + Math.random() * 300,
      ease: "Sine.easeOut",
      onComplete: () => p.destroy(),
    });
  }

  // angry 加屏幕微震
  if (emotion === "angry") {
    scene.cameras.main.shake(200, 0.003);
  }
}
