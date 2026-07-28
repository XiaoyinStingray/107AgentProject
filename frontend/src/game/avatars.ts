/**
 * Agent 头像纹理生成 — Canvas 绘制，替代系统 emoji。
 * 输出 72×72 spritesheet 帧，底色 = Agent 个性色，中央 = 白色角色图标。
 */

const SIZE = 72;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = SIZE / 2 - 4;

type IconDrawer = (ctx: CanvasRenderingContext2D) => void;

/** 小林 — 程序员 `</>` */
function drawCoder(ctx: CanvasRenderingContext2D): void {
  const s = 12;
  // 左尖括号 <
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(CX + 3, CY - s + 2);
  ctx.lineTo(CX - s + 6, CY);
  ctx.lineTo(CX + 3, CY + s - 2);
  ctx.stroke();
  // 右尖括号 >
  ctx.beginPath();
  ctx.moveTo(CX - 3, CY - s + 2);
  ctx.lineTo(CX + s - 6, CY);
  ctx.lineTo(CX - 3, CY + s - 2);
  ctx.stroke();
  // 斜杠 /
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(CX + 8, CY - s + 5);
  ctx.lineTo(CX - 8, CY + s - 5);
  ctx.stroke();
}

/** 小红 — 调色板 */
function drawArtist(ctx: CanvasRenderingContext2D): void {
  const s = 13;
  // 画板主体
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(CX, CY, s, 0, Math.PI * 2);
  ctx.fill();
  // 拇指孔
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.beginPath();
  ctx.arc(CX + 6, CY - 2, 4, 0, Math.PI * 2);
  // 用 clip 挖洞太复杂，改用覆盖
  ctx.fillStyle = "#fff";
  // 颜料点
  const dots: [number, number, string][] = [
    [-4, -3, "#EE5555"], [4, -4, "#55AAEE"], [0, -6, "#EEAA44"],
    [-6, 3, "#55CC55"], [6, 2, "#CC55CC"],
  ];
  dots.forEach(([dx, dy, c]) => {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(CX + dx, CY + dy, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

/** 小刚 — 领带/公文包 */
function drawBusiness(ctx: CanvasRenderingContext2D): void {
  // 公文包主体
  ctx.fillStyle = "#fff";
  const bw = 18, bh = 12;
  const bx = CX - bw / 2, by = CY - 3;
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(bx, by + bh, bw, 3);
  // 提手
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(CX - 4, by - 1);
  ctx.lineTo(CX - 4, by - 8);
  ctx.lineTo(CX + 4, by - 8);
  ctx.lineTo(CX + 4, by - 1);
  ctx.stroke();
  // 锁扣
  ctx.fillStyle = "#fff";
  ctx.fillRect(CX - 2, by + 3, 4, 3);
}

/** 小雪 — 锥形瓶 */
function drawScientist(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 瓶颈
  ctx.beginPath();
  ctx.moveTo(CX - 3, CY - 12);
  ctx.lineTo(CX - 3, CY - 4);
  ctx.lineTo(CX - 10, CY + 10);
  ctx.lineTo(CX + 10, CY + 10);
  ctx.lineTo(CX + 3, CY - 4);
  ctx.lineTo(CX + 3, CY - 12);
  ctx.stroke();
  // 液面
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.fillRect(CX - 7, CY + 2, 14, 8);
  // 气泡
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(CX + 3, CY + 5, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(CX - 2, CY + 8, 1, 0, Math.PI * 2);
  ctx.fill();
}

/** 阿杰 — 星星 */
function drawPerformer(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "#fff";
  const s = 13;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
    const outerX = CX + Math.cos(angle) * s;
    const outerY = CY + Math.sin(angle) * s;
    const innerAngle = angle + (2 * Math.PI) / 10;
    const innerX = CX + Math.cos(innerAngle) * (s * 0.4);
    const innerY = CY + Math.sin(innerAngle) * (s * 0.4);
    if (i === 0) ctx.moveTo(outerX, outerY);
    else ctx.lineTo(outerX, outerY);
    ctx.lineTo(innerX, innerY);
  }
  ctx.closePath();
  ctx.fill();
}

/* ── 头像定义 ─────────────────────────────────────── */

interface AvatarDef {
  id: string;
  color: string;
  draw: IconDrawer;
}

export const AVATARS: AvatarDef[] = [
  { id: "agent-1", color: "#5588CC", draw: drawCoder },
  { id: "agent-2", color: "#EE8899", draw: drawArtist },
  { id: "agent-3", color: "#DD9944", draw: drawBusiness },
  { id: "agent-4", color: "#66AA88", draw: drawScientist },
  { id: "agent-5", color: "#8866CC", draw: drawPerformer },
];

/** Agent ID → spritesheet 帧索引 */
export const AVATAR_FRAME: Record<string, number> = Object.fromEntries(
  AVATARS.map((a, i) => [a.id, i]),
);

/* ── 生成入口 ─────────────────────────────────────── */

/** 生成头像 spritesheet，注入 Phaser texture cache */
export function generateAvatarTexture(scene: Phaser.Scene): Promise<void> {
  return new Promise((resolve) => {
    const count = AVATARS.length;
    const canvas = document.createElement("canvas");
    canvas.width = count * SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d")!;

    AVATARS.forEach((avatar, i) => {
      const x = i * SIZE;
      // 底色圆
      ctx.fillStyle = avatar.color;
      ctx.beginPath();
      ctx.arc(x + CX, CY, R, 0, Math.PI * 2);
      ctx.fill();
      // 白色图标
      ctx.save();
      ctx.translate(x, 0);
      avatar.draw(ctx);
      ctx.restore();
    });

    const img = new Image();
    img.onload = () => {
      scene.textures.addSpriteSheet("avatars", img, { frameWidth: SIZE, frameHeight: SIZE });
      resolve();
    };
    img.src = canvas.toDataURL();
  });
}
