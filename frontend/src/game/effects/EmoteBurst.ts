import Phaser from "phaser";

const lastBurst: Record<string, number> = {};

const PROFILES: Record<string, {
  color: number; count: number; emoji: string; sideEmojis: string[];
  shake: number; particles: "burst" | "rain" | "spiral" | "float" | "confetti" | "jitter";
}> = {
  happy:    { color:0x66DD66, count:14, emoji:"😊", sideEmojis:["🎉","✨","💖"], shake:0.002, particles:"confetti" },
  anxious:  { color:0xDDCC44, count:16, emoji:"😰", sideEmojis:["❗","💦","😱"], shake:0.004, particles:"jitter" },
  angry:    { color:0xEE5555, count:16, emoji:"😡", sideEmojis:["😤","💢","😠"], shake:0.006, particles:"burst" },
  sad:      { color:0x7799CC, count:12, emoji:"😢", sideEmojis:["💧","🌧️","😿"], shake:0.001, particles:"rain" },
  surprised:{ color:0xFFAA44, count:14, emoji:"😲", sideEmojis:["❗","💥","⚡"], shake:0.003, particles:"burst" },
  confused: { color:0xCC88FF, count:15, emoji:"😵", sideEmojis:["❓","💫","🌀"], shake:0.003, particles:"spiral" },
  tired:    { color:0xAAAAAA, count:10, emoji:"😴", sideEmojis:["💤","🛏️","🥱"], shake:0.001, particles:"float" },
  excited:  { color:0xFF66AA, count:20, emoji:"🤩", sideEmojis:["🌟","💥","🔥"], shake:0.004, particles:"confetti" },
};

export function emoteBurst(
  scene: Phaser.Scene | null,
  x: number, y: number,
  emotion: string,
  agentId?: string,
): void {
  if (!scene) return;
  const key = agentId ?? "global";
  // 66-S: 加长冷却到 8s，避免过于频繁
  if (Date.now() - (lastBurst[key] ?? 0) < 8000) return;
  lastBurst[key] = Date.now();

  const profile = PROFILES[emotion];
  if (!profile) return;

  const W = scene.cameras.main.width;
  const H = scene.cameras.main.height;

  // ═══ 1. 粒子爆发 ═══
  for (let i = 0; i < profile.count; i++) {
    const angle = (Math.PI * 2 * i) / profile.count + (Math.random() - 0.5) * 0.6;
    const dist = 40 + Math.random() * 50;
    const tx = x + Math.cos(angle) * dist;
    const ty = y + Math.sin(angle) * dist;
    const delay = i * 20;
    const isStar = Math.random() < 0.35;

    let p: Phaser.GameObjects.GameObject;
    if (profile.particles === "rain") {
      p = scene.add.rectangle(x + (Math.random()-0.5)*30, y - Math.random()*40, 2, 6+Math.random()*8, profile.color, 0.7).setDepth(20);
      scene.tweens.add({ targets:p, x:tx, y:ty+H*0.6, alpha:0, duration:800, delay, ease:"Sine.easeIn", onComplete:()=>p.destroy() });
    } else if (profile.particles === "float") {
      p = scene.add.circle(x+(Math.random()-0.5)*20, y, 2+Math.random()*3, profile.color, 0.5).setDepth(20);
      scene.tweens.add({ targets:p, x:tx, y:ty-20, alpha:0, duration:1200, delay, ease:"Sine.easeOut", onComplete:()=>p.destroy() });
    } else if (profile.particles === "spiral") {
      p = scene.add.circle(x, y, 3+Math.random()*4, profile.color, 0.8).setDepth(20);
      scene.tweens.add({ targets:p, x:tx, y:ty, alpha:0, scaleX:0, scaleY:0, rotation:Math.random()*5, duration:600, delay, ease:"Sine.easeOut", onComplete:()=>p.destroy() });
    } else if (profile.particles === "jitter") {
      p = isStar ? scene.add.star(x, y, 4, 1.5, 3, profile.color, 0.8).setDepth(20) : scene.add.circle(x, y, 2+Math.random()*4, profile.color, 0.8).setDepth(20);
      scene.tweens.add({ targets:p, x:tx+(Math.random()-0.5)*30, y:ty+(Math.random()-0.5)*20, alpha:0, duration:400, delay, yoyo:true, repeat:2, ease:"Linear", onComplete:()=>p.destroy() });
    } else if (profile.particles === "confetti") {
      const w = 3+Math.random()*3, h = 6+Math.random()*6;
      p = scene.add.rectangle(x+(Math.random()-0.5)*20, y-Math.random()*10, w, h, profile.color, 0.85).setDepth(20).setRotation(Math.random()*2);
      scene.tweens.add({ targets:p, x:tx, y:ty, alpha:0, rotation:Math.random()*4, duration:700+Math.random()*300, delay, ease:"Sine.easeOut", onComplete:()=>p.destroy() });
    } else {
      // burst (default)
      p = isStar ? scene.add.star(x, y, 5, 2, 4, profile.color, 0.9).setDepth(20) : scene.add.circle(x, y, 2+Math.random()*4, profile.color, 0.85).setDepth(20);
      scene.tweens.add({ targets:p, x:tx, y:ty, alpha:0, scaleX:0.1, scaleY:0.1, duration:500+Math.random()*300, delay, ease:"Sine.easeOut", onComplete:()=>p.destroy() });
    }
  }

  // ═══ 2. 坠落大 emoji ═══
  const ex = x + (Math.random() - 0.5) * 50;
  const bigEmoji = scene.add.text(ex, -50, profile.emoji, { fontSize:"40px" }).setOrigin(0.5).setDepth(28).setAlpha(0);
  scene.tweens.add({
    targets: bigEmoji, y: y + 5, alpha: 1,
    duration: 500, ease: "Bounce.easeOut",
    onComplete: () => scene.tweens.add({
      targets: bigEmoji, alpha: 0, y: y + 50, duration: 700, delay: 600,
      onComplete: () => bigEmoji.destroy(),
    }),
  });

  // ═══ 3. 屏幕边缘 emoji 弹入 ═══
  profile.sideEmojis.forEach((sem, i) => {
    const side = i % 2 === 0 ? -1 : 1;
    const sx = side < 0 ? -60 : W + 60;
    const ty = 40 + i * 80 + Math.random() * 30;
    const landingX = side < 0 ? 30 + i * 25 : W - 30 - i * 25;

    const t = scene.add.text(sx, ty, sem, { fontSize:"34px" }).setOrigin(0.5).setDepth(28).setAlpha(0);
    scene.tweens.add({
      targets: t, x: landingX, alpha: 1,
      duration: 400 + i * 80, delay: i * 100, ease: "Back.easeOut",
      onComplete: () => scene.tweens.add({
        targets: t, y: H + 50, alpha: 0,
        duration: 1400, delay: 500, ease: "Sine.easeIn",
        onComplete: () => t.destroy(),
      }),
    });
  });

  // ═══ 4. 相机 ═══
  if (profile.shake > 0) scene.cameras.main.shake(profile.shake > 0.004 ? 350 : 200, profile.shake);
}
