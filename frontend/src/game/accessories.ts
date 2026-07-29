/**
 * Agent 配饰系统 — AI 生成的像素配饰叠加到波兰球上。
 *
 * 每个配饰定义：文件、锚点偏移（相对球心）、缩放、渲染层级。
 * 球体半径 CIRCLE_R = 36（72px 直径），配饰原图 64×64。
 */

export interface AccessoryDef {
  id: string;
  /** 相对球心的 X 偏移 (px) */
  ox: number;
  /** 相对球心的 Y 偏移 (px) — 负值=头上, 正值=下方 */
  oy: number;
  /** 显示缩放（原图 64px → 若干 px） */
  scale: number;
  /** 叠加顺序：0=球体后, 1=球前/面后, 2=面部上 */
  layer: number;
  /** 旋转角度（度），通过 setAngle 应用 */
  rotation?: number;
}

/** 所有可用配饰 */
export const ACCESSORIES: AccessoryDef[] = [
  // ── 头顶类 ──
  { id: "bow_red",       ox: 0,  oy: -30, scale: 0.55, layer: 2 },
  { id: "bow_blue",      ox: 0,  oy: -30, scale: 0.55, layer: 2 },
  { id: "bow_pink",      ox: 0,  oy: -30, scale: 0.55, layer: 2 },
  { id: "crown",         ox: 0,  oy: -32, scale: 0.60, layer: 2 },
  { id: "grad_cap",      ox: 0,  oy: -34, scale: 0.55, layer: 2 },
  { id: "cat_ears",      ox: 0,  oy: -34, scale: 0.40, layer: 1 }, // 猫耳尖露出球顶
  // ── 棒球帽（略偏左/右） ──
  { id: "cap_red",       ox: 2,  oy: -32, scale: 0.55, layer: 2 },
  { id: "cap_blue",      ox: -2, oy: -32, scale: 0.55, layer: 2 },
  // ── 面部/颈部类 ──
  { id: "glasses_round", ox: 0,  oy: 0,   scale: 0.50, layer: 2 }, // 架在眼睛位置
  { id: "headphones",    ox: 26, oy: 10,  scale: 0.50, layer: 2 }, // 手持右侧
  // ── Layer 0: 球体后面 ──
  { id: "wings_white",   ox: 0,  oy: 0,   scale: 0.55, layer: 0 }, // 天使翅膀
  // ── Layer 1: 球前/面后 ──
  { id: "halo",          ox: 0,  oy: -42, scale: 0.48, layer: 1 }, // 光环浮顶
  { id: "bunny_ears",    ox: 0,  oy: -36, scale: 0.42, layer: 1 }, // 兔耳
  { id: "horns_red",     ox: 0,  oy: -34, scale: 0.40, layer: 1 }, // 恶魔角
  // ── Layer 2: 面部上 ──
  { id: "wizard_hat",    ox: 0,  oy: -36, scale: 0.55, layer: 2 }, // 魔法尖帽
  { id: "top_hat",       ox: 0,  oy: -36, scale: 0.55, layer: 2 }, // 高顶礼帽
  { id: "chef_hat",      ox: 0,  oy: -36, scale: 0.50, layer: 2 }, // 厨师帽
  { id: "straw_hat",     ox: 0,  oy: -34, scale: 0.62, layer: 2 }, // 宽檐草帽
  { id: "beanie",        ox: 0,  oy: -34, scale: 0.55, layer: 2 }, // 针织帽
  { id: "flower_crown",  ox: 0,  oy: -30, scale: 0.55, layer: 2 }, // 花环
  { id: "headband",      ox: 0,  oy: -30, scale: 0.48, layer: 2 }, // 运动发带
  { id: "arrow",         ox: 0,  oy: 0,   scale: 0.55, layer: 2, rotation: -35 }, // 丘比特箭斜插
  { id: "sunglasses",    ox: 0,  oy: 0,   scale: 0.50, layer: 2 }, // 墨镜
  { id: "bowtie",        ox: 0,  oy: 24,  scale: 0.40, layer: 2 }, // 领结
];

/** 每个 Agent 获得配饰的概率 (0-1) */
export const ACCESSORY_CHANCE = 0.6;

/** 根据 ID 查找配饰定义（可能不存在） */
export function getAccessory(id: string): AccessoryDef | undefined {
  return ACCESSORIES.find((a) => a.id === id);
}

/** 为 Agent 随机选取配饰 ID（或 undefined = 不戴）。
 *  应在 Agent 首次部署时调用一次，结果存入持久化数据。 */
export function pickAccessoryId(): string | undefined {
  if (Math.random() > ACCESSORY_CHANCE) return undefined;
  return ACCESSORIES[Math.floor(Math.random() * ACCESSORIES.length)].id;
}
