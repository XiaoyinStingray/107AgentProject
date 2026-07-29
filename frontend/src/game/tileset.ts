/**
 * Life Lab tileset — 纹理由 AI 生成（Retro Diffusion rd-tile）。
 *
 * spritesheet 结构：
 *   "tiles"  → assets/tiles.png (640×64 = 10 frames) — 地面[0-5] + 墙壁[6-9]
 *   "items"  → assets/items.png (896×64 = 14 frames) — 物品[0-13]
 *
 * 帧索引映射：与旧程序化版本保持一致，6 个场景 JSON 无需修改。
 */

/** 地面 tile 序号 → 名称 */
export const GROUND_INDEX: Record<number, string> = {
  0: "wood_floor", 1: "tile_floor", 2: "stone_floor",
  3: "grass", 4: "white_tile", 5: "path",
};

/** 物品类型 → spritesheet 帧索引 */
export const ITEM_FRAME: Record<string, number> = {
  desk:    0,  // 640×64 strip: col 0
  seat:    1,
  pc:      2,
  bed:     3,
  piano:   4,
  easel:   5,
  board:   6,
  tree:    7,
  bench:   8,
  shelf:   9,
  vending: 10,
  counter: 11,
  door:    12,
  window:  13,
};

/** 地面名称 → tiles.png 帧索引（0-5，对应 tiles.png 前 6 列） */
export const GROUND: Record<string, number> = {
  wood_floor: 0,
  tile_floor: 1,
  stone_floor: 2,
  grass: 3,
  white_tile: 4,
  path: 5,
};
