/**
 * Agent 头像纹理 — 波兰球风格。
 * 只生成纯色圆底（72×72），眼睛由 AgentSprite 动态绘制以响应情绪变化。
 */

const SIZE = 72;
const R = SIZE / 2 - 3;

interface AvatarDef {
  id: string;
  color: string;
}

export const AVATARS: AvatarDef[] = [
  { id: "agent-1", color: "#5588CC" },
  { id: "agent-2", color: "#EE8899" },
  { id: "agent-3", color: "#DD9944" },
  { id: "agent-4", color: "#66AA88" },
  { id: "agent-5", color: "#8866CC" },
];

export const AVATAR_FRAME: Record<string, number> = Object.fromEntries(
  AVATARS.map((a, i) => [a.id, i]),
);

export function generateAvatarTexture(scene: Phaser.Scene): Promise<void> {
  return new Promise((resolve) => {
    const count = AVATARS.length;
    const canvas = document.createElement("canvas");
    canvas.width = count * SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;

    AVATARS.forEach((avatar, i) => {
      const cx = i * SIZE + SIZE / 2;
      const cy = SIZE / 2;
      // 纯色球体（带轻微高光）
      ctx.fillStyle = avatar.color;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      // 高光
      const grad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
      grad.addColorStop(0, "rgba(255,255,255,0.35)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      // 细边框
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
    });

    const img = new Image();
    img.onload = () => {
      if (!scene.textures.exists("avatars")) {
        try { scene.textures.addSpriteSheet("avatars", img, { frameWidth: SIZE, frameHeight: SIZE }); } catch { /* 场景已销毁 */ }
      }
      resolve();
    };
    img.src = canvas.toDataURL();
  });
}
