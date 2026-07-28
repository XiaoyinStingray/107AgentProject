/**
 * Life Lab tileset — 纯程序化生成，零外部依赖。
 *
 * 所有贴图在 BootScene 初始化时通过 Canvas 绘制，
 * 以 data URL 注入 Phaser texture cache（spritesheet 格式）。
 *
 * 布局：
 *   "tiles"  spritesheet → [0-5] 地面  [6-9] 墙壁
 *   "items"  spritesheet → [0-13] 物品图标
 */

const S = 32;   // 逻辑 tile 尺寸（绘制坐标）
const TS = 64;  // 物理 tile 尺寸（输出像素，2x 高清）

// ─── 色板 ───────────────────────────────────────────────
const C = {
  // 地面
  wood:      { fill: "#C49A6C", dark: "#A88058", light: "#D8B88C", line: "#B89068" },
  tile:      { fill: "#E0D8D0", dark: "#C8C0B8", light: "#F0E8E0", line: "#D0C8C0" },
  stone:     { fill: "#A8A4A0", dark: "#908C88", light: "#B8B4B0", grain: "#989490" },
  grass:     { fill: "#7CB342", dark: "#689F38", light: "#8BC34A", blade: "#6DA834" },
  whiteTile: { fill: "#F0ECE8", dark: "#DCD8D4", light: "#F8F6F2", line: "#E0DCD8" },
  path:      { fill: "#B0A898", dark: "#988878", light: "#C0B8A8", cobble: "#A09888" },

  // 墙壁
  wallTop:    "#7B6555",
  wallFace:   "#9B8575",
  wallShadow: "rgba(0,0,0,0.18)",
  wallDark:   "#6B5545",

  // 物品通用
  shadow:     "rgba(0,0,0,0.22)",
  furniture:  "#8B6F50",
  furnDark:   "#6B4F30",
  furnLight:  "#AB8F70",
  metal:      "#8899AA",
  metalDark:  "#68798A",
  metalLight: "#A8B9CA",
  screen:     "#5599CC",
  screenGlow: "#88CCFF",
  white:      "#F5F5F5",
  black:      "#3A3A3A",
  red:        "#CC6666",
  pink:       "#EEAACC",
  pinkLight:  "#FFCCEE",
  green:      "#66AA66",
  blue:       "#7799CC",
  sheet:      "#88AADD",
  sheetLight: "#AACCFF",
  boardGreen: "#2A5A3A",
  trunk:      "#8B6914",
  roof:       "#CC5555",
};

// ─── 地面瓦片绘制 ───────────────────────────────────────

function drawWood(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.wood.fill;
  ctx.fillRect(0, 0, S, S);
  // 木纹水平线
  for (let y = 7; y < S; y += 8) {
    ctx.fillStyle = C.wood.line;
    ctx.fillRect(0, y, S, 1);
    ctx.fillStyle = C.wood.light;
    ctx.fillRect(0, y + 1, S, 1);
  }
  // 交错竖缝
  const joints: Record<number, number[]> = { 0: [10, 22, 26], 1: [6, 18, 30], 2: [14, 26], 3: [2, 18] };
  Object.entries(joints).forEach(([row, xs]) => {
    xs.forEach((jx) => {
      ctx.fillStyle = C.wood.dark;
      ctx.fillRect(jx, Number(row) * 8 + 1, 1, 6);
    });
  });
}

function drawTile(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.tile.fill;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = C.tile.line;
  ctx.lineWidth = 0.5;
  [0, 16].forEach((ox) => {
    [0, 16].forEach((oy) => {
      ctx.strokeRect(ox + 0.5, oy + 0.5, 15, 15);
    });
  });
}

function drawStone(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.stone.fill;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 12; i++) {
    const sx = (i * 11 + 3) % S;
    const sy = (i * 7 + 7) % S;
    ctx.fillStyle = i % 2 === 0 ? C.stone.dark : C.stone.light;
    ctx.fillRect(sx, sy, 2 + (i % 3), 2 + (i % 2));
  }
}

function drawGrass(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.grass.fill;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = C.grass.blade;
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const gx = (i * 9 + 5) % S;
    const gy = (i * 5 + 3) % S;
    ctx.beginPath();
    ctx.moveTo(gx, gy + 2);
    ctx.lineTo(gx + 1, gy - 1);
    ctx.stroke();
  }
  // 稀疏小花
  for (const [fx, fy] of [[6, 10], [20, 18], [10, 26]]) {
    ctx.fillStyle = "#F9E79F";
    ctx.fillRect(fx, fy, 2, 2);
  }
}

function drawWhiteTile(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.whiteTile.fill;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = C.whiteTile.line;
  ctx.lineWidth = 0.5;
  [0, 16].forEach((ox) => {
    [0, 16].forEach((oy) => {
      ctx.strokeRect(ox + 0.5, oy + 0.5, 15, 15);
    });
  });
}

function drawPath(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.path.fill;
  ctx.fillRect(0, 0, S, S);
  // 石板路
  const stones: [number, number, number][] = [
    [8, 6, 8], [22, 6, 7], [6, 16, 9], [18, 16, 7],
    [10, 26, 8], [24, 24, 6], [3, 18, 5], [28, 10, 5],
  ];
  stones.forEach(([cx, cy, r]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = C.path.cobble;
    ctx.fill();
    ctx.strokeStyle = C.path.dark;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  });
  // 石板间隙的小碎石
  ctx.fillStyle = C.path.light;
  [[12, 3], [26, 2], [2, 10], [30, 20]].forEach(([gx, gy]) => {
    ctx.fillRect(gx, gy, 2, 2);
  });
}

const GROUND_DRAWERS: Array<(ctx: CanvasRenderingContext2D) => void> = [
  drawWood,      // 0: wood_floor
  drawTile,      // 1: tile_floor
  drawStone,     // 2: stone_floor
  drawGrass,     // 3: grass
  drawWhiteTile, // 4: white_tile
  drawPath,      // 5: path
];

/** 地面 tile 序号 → 名称 */
export const GROUND_INDEX: Record<number, string> = {
  0: "wood_floor", 1: "tile_floor", 2: "stone_floor",
  3: "grass", 4: "white_tile", 5: "path",
};

// ─── 墙壁瓦片绘制 ───────────────────────────────────────

function drawWallTop(ctx: CanvasRenderingContext2D): void {
  // 外缘（暗）、墙面（亮）、阴影
  ctx.fillStyle = C.wallTop;
  ctx.fillRect(0, 0, S, 6);
  ctx.fillStyle = C.wallFace;
  ctx.fillRect(0, 6, S, 23);
  ctx.fillStyle = C.wallShadow;
  ctx.fillRect(0, 27, S, 5);
  // 顶面高光线
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(0, 0, S, 2);
}

function drawWallBottom(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.wallFace;
  ctx.fillRect(0, 0, S, 23);
  ctx.fillStyle = C.wallTop;
  ctx.fillRect(0, 23, S, 6);
  ctx.fillStyle = C.wallShadow;
  ctx.fillRect(0, 0, S, 3);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(0, 23, S, 2);
}

function drawWallLeft(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.wallTop;
  ctx.fillRect(0, 0, 6, S);
  ctx.fillStyle = C.wallFace;
  ctx.fillRect(6, 0, 24, S);
  ctx.fillStyle = C.wallShadow;
  ctx.fillRect(28, 0, 4, S);
  ctx.fillStyle = "rgba(255,255,255,0.1)";
  ctx.fillRect(0, 0, 2, S);
}

function drawWallRight(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.wallFace;
  ctx.fillRect(0, 0, 24, S);
  ctx.fillStyle = C.wallTop;
  ctx.fillRect(24, 0, 6, S);
  ctx.fillStyle = C.wallShadow;
  ctx.fillRect(0, 0, 4, S);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(24, 0, 2, S);
}

const WALL_DRAWERS: Array<(ctx: CanvasRenderingContext2D) => void> = [
  drawWallTop,    // 0: top
  drawWallBottom, // 1: bottom
  drawWallLeft,   // 2: left
  drawWallRight,  // 3: right
];

// ─── 物品图标绘制 ──────────────────────────────────────

function shadow(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(16, 27, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number,
  w: number, h: number, r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// 0: desk — 课桌
function drawDesk(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // 桌面
  ctx.fillStyle = C.furniture;
  roundRect(ctx, 4, 10, 24, 14, 2);
  ctx.fill();
  ctx.fillStyle = C.furnLight;
  roundRect(ctx, 4, 10, 24, 3, 2);
  ctx.fill();
  // 桌腿
  ctx.fillStyle = C.furnDark;
  ctx.fillRect(6, 22, 3, 5);
  ctx.fillRect(23, 22, 3, 5);
}

// 1: seat — 椅子
function drawSeat(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // 座面
  ctx.fillStyle = C.metal;
  roundRect(ctx, 9, 14, 14, 9, 2);
  ctx.fill();
  ctx.fillStyle = C.metalLight;
  roundRect(ctx, 9, 14, 14, 3, 2);
  ctx.fill();
  // 椅腿
  ctx.fillStyle = C.metalDark;
  ctx.fillRect(10, 21, 2, 5);
  ctx.fillRect(20, 21, 2, 5);
  // 椅背
  ctx.fillStyle = C.metal;
  ctx.fillRect(8, 8, 2, 9);
}

// 2: pc — 电脑
function drawPC(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // 显示器
  ctx.fillStyle = C.black;
  roundRect(ctx, 7, 8, 18, 14, 2);
  ctx.fill();
  ctx.fillStyle = C.screen;
  roundRect(ctx, 9, 10, 14, 9, 1);
  ctx.fill();
  ctx.fillStyle = C.screenGlow;
  ctx.fillRect(10, 11, 4, 1);
  // 底座
  ctx.fillStyle = C.metalDark;
  ctx.fillRect(13, 22, 6, 3);
}

// 3: bed — 床
function drawBed(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // 床架
  ctx.fillStyle = C.furniture;
  roundRect(ctx, 2, 8, 28, 20, 2);
  ctx.fill();
  // 枕头
  ctx.fillStyle = C.white;
  roundRect(ctx, 4, 10, 8, 6, 2);
  ctx.fill();
  // 被子
  ctx.fillStyle = C.sheet;
  roundRect(ctx, 13, 10, 15, 16, 2);
  ctx.fill();
  ctx.fillStyle = C.sheetLight;
  roundRect(ctx, 13, 10, 15, 3, 2);
  ctx.fill();
}

// 4: piano — 钢琴 (三角)
function drawPiano(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  ctx.fillStyle = C.black;
  ctx.beginPath();
  ctx.moveTo(4, 24);
  ctx.lineTo(4, 14);
  ctx.lineTo(10, 6);
  ctx.lineTo(22, 6);
  ctx.lineTo(28, 10);
  ctx.lineTo(28, 24);
  ctx.closePath();
  ctx.fill();
  // 琴键
  ctx.fillStyle = C.white;
  ctx.fillRect(6, 20, 20, 5);
  // 黑键
  for (let k = 0; k < 5; k++) {
    ctx.fillStyle = C.black;
    ctx.fillRect(8 + k * 4, 20, 2, 3);
  }
  // 高光
  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.fillRect(6, 7, 12, 2);
}

// 5: easel — 画架
function drawEasel(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // A 形支架
  ctx.strokeStyle = C.furniture;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(6, 8);
  ctx.lineTo(16, 22);
  ctx.lineTo(26, 8);
  ctx.stroke();
  // 横杆
  ctx.fillStyle = C.furnDark;
  ctx.fillRect(10, 14, 12, 2);
  // 画布
  ctx.fillStyle = C.white;
  ctx.fillRect(12, 8, 8, 7);
  ctx.strokeStyle = C.furnDark;
  ctx.lineWidth = 0.5;
  ctx.strokeRect(12, 8, 8, 7);
}

// 6: board — 黑板/白板
function drawBoard(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // 边框
  ctx.fillStyle = C.metal;
  roundRect(ctx, 4, 6, 24, 20, 2);
  ctx.fill();
  // 板面
  ctx.fillStyle = C.boardGreen;
  roundRect(ctx, 6, 8, 20, 16, 1);
  ctx.fill();
  // 粉笔字痕迹
  ctx.fillStyle = "rgba(255,255,255,0.25)";
  ctx.fillRect(9, 11, 8, 1);
  ctx.fillRect(10, 14, 12, 1);
  // 板擦槽
  ctx.fillStyle = C.metalLight;
  ctx.fillRect(6, 24, 20, 2);
}

// 7: tree — 樱花树
function drawTree(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // 树干
  ctx.fillStyle = C.trunk;
  ctx.fillRect(14, 16, 4, 16);
  // 树冠
  ctx.fillStyle = C.pink;
  ctx.beginPath();
  ctx.arc(16, 11, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.pinkLight;
  ctx.beginPath();
  ctx.arc(12, 9, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.arc(13, 7, 3, 0, Math.PI * 2);
  ctx.fill();
}

// 8: bench — 长椅
function drawBench(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // 座面
  ctx.fillStyle = C.furniture;
  roundRect(ctx, 4, 12, 24, 8, 2);
  ctx.fill();
  ctx.fillStyle = C.furnLight;
  roundRect(ctx, 4, 12, 24, 2, 2);
  ctx.fill();
  // 椅腿
  ctx.fillStyle = C.furnDark;
  ctx.fillRect(6, 18, 3, 5);
  ctx.fillRect(23, 18, 3, 5);
  // 靠背横条
  ctx.fillStyle = C.furniture;
  ctx.fillRect(5, 8, 2, 7);
  ctx.fillRect(25, 8, 2, 7);
}

// 9: shelf — 书架
function drawShelf(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // 框架
  ctx.fillStyle = C.furniture;
  ctx.fillRect(6, 4, 20, 26);
  // 隔板
  ctx.fillStyle = C.furnLight;
  ctx.fillRect(6, 10, 20, 2);
  ctx.fillRect(6, 18, 20, 2);
  ctx.fillRect(6, 26, 20, 2);
  // 书本
  const books: [number, number, string][] = [
    [9, 5, C.red], [14, 5, C.blue], [18, 5, C.green],
    [8, 13, C.sheet], [12, 13, C.pink], [17, 13, C.red],
    [9, 21, C.green], [14, 21, C.blue], [19, 21, C.pink],
  ];
  books.forEach(([bx, by, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(bx, by, 3, 4);
    ctx.fillStyle = "rgba(255,255,255,0.2)";
    ctx.fillRect(bx, by, 1, 4);
  });
}

// 10: vending — 自动贩卖机
function drawVending(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // 机身
  ctx.fillStyle = C.metal;
  roundRect(ctx, 6, 4, 20, 26, 2);
  ctx.fill();
  ctx.fillStyle = C.metalLight;
  roundRect(ctx, 6, 4, 20, 3, 2);
  ctx.fill();
  // 玻璃展示窗
  ctx.fillStyle = "rgba(180,220,255,0.4)";
  roundRect(ctx, 8, 9, 16, 12, 1);
  ctx.fill();
  // 商品
  [[10, 11, C.red], [16, 11, C.green], [13, 15, C.blue], [19, 15, C.pink]].forEach(([vx, vy, vc]) => {
    ctx.fillStyle = vc as string;
    ctx.fillRect(vx as number, vy as number, 3, 3);
  });
  // 取物口
  ctx.fillStyle = C.metalDark;
  ctx.fillRect(12, 25, 8, 3);
}

// 11: counter — 柜台
function drawCounter(ctx: CanvasRenderingContext2D): void {
  shadow(ctx);
  // 台面
  ctx.fillStyle = C.furnLight;
  roundRect(ctx, 2, 10, 28, 10, 2);
  ctx.fill();
  // 柜体
  ctx.fillStyle = C.furniture;
  ctx.fillRect(4, 18, 24, 8);
  // 面板格
  ctx.fillStyle = C.furnDark;
  ctx.fillRect(6, 19, 8, 6);
  ctx.fillRect(18, 19, 8, 6);
}

// 12: door — 门
function drawDoor(ctx: CanvasRenderingContext2D): void {
  // 门框
  ctx.fillStyle = C.furnDark;
  ctx.fillRect(6, 2, 20, 28);
  // 门板
  ctx.fillStyle = C.furniture;
  ctx.fillRect(8, 4, 16, 24);
  ctx.fillStyle = C.furnLight;
  ctx.fillRect(8, 4, 4, 24);
  // 门把手
  ctx.fillStyle = C.metalLight;
  ctx.beginPath();
  ctx.arc(20, 18, 2, 0, Math.PI * 2);
  ctx.fill();
}

// 13: window — 窗户
function drawWindow(ctx: CanvasRenderingContext2D): void {
  // 窗框
  ctx.fillStyle = C.furnDark;
  ctx.fillRect(4, 4, 24, 24);
  // 玻璃
  ctx.fillStyle = "rgba(160,210,240,0.5)";
  ctx.fillRect(6, 6, 20, 20);
  // 十字格
  ctx.fillStyle = C.furnDark;
  ctx.fillRect(15, 6, 2, 20);
  ctx.fillRect(6, 15, 20, 2);
  // 高光
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(7, 7, 7, 7);
}

const ITEM_DRAWERS: Array<(ctx: CanvasRenderingContext2D) => void> = [
  drawDesk,     // 0
  drawSeat,     // 1
  drawPC,       // 2
  drawBed,      // 3
  drawPiano,    // 4
  drawEasel,    // 5
  drawBoard,    // 6
  drawTree,     // 7
  drawBench,    // 8
  drawShelf,    // 9
  drawVending,  // 10
  drawCounter,  // 11
  drawDoor,     // 12
  drawWindow,   // 13
];

/** 物品类型 → spritesheet 帧索引 */
export const ITEM_FRAME: Record<string, number> = {
  desk: 0,
  seat: 1,
  pc: 2,
  bed: 3,
  piano: 4,
  easel: 5,
  board: 6,
  tree: 7,
  bench: 8,
  shelf: 9,
  vending: 10,
  counter: 11,
  door: 12,
  window: 13,
};

// ─── 生成入口 ──────────────────────────────────────────

/** 将一组 drawFn 绘制到 Canvas 并注册为 Phaser spritesheet */
function makeTexture(
  scene: Phaser.Scene,
  key: string,
  drawers: Array<(ctx: CanvasRenderingContext2D) => void>,
): Promise<void> {
  return new Promise((resolve) => {
    const count = drawers.length;
    const canvas = document.createElement("canvas");
    canvas.width = count * TS;
    canvas.height = TS;
    const ctx = canvas.getContext("2d")!;

    drawers.forEach((draw, i) => {
      ctx.save();
      ctx.translate(i * TS, 0);
      ctx.scale(2, 2); // 逻辑 32px → 物理 64px
      draw(ctx);
      ctx.restore();
    });

    const img = new Image();
    img.onload = () => {
      if (!scene.textures.exists(key)) {
        try { scene.textures.addSpriteSheet(key, img, { frameWidth: TS, frameHeight: TS }); } catch { /* 场景已销毁 */ }
      }
      resolve();
    };
    img.src = canvas.toDataURL();
  });
}

/**
 * 生成全部贴图纹理并注入 Phaser。
 * 在 BootScene.create() 中调用，完成后 start("MapScene")。
 */
export async function generateAllTextures(scene: Phaser.Scene): Promise<void> {
  // 合并地面 + 墙壁到同一 spritesheet: frames [0-5] 地面, [6-9] 墙壁
  await makeTexture(scene, "tiles", [...GROUND_DRAWERS, ...WALL_DRAWERS]);
  await makeTexture(scene, "items", ITEM_DRAWERS);
}
