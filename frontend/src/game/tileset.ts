/**
 * Life Lab tileset — 纹理由 AI 生成（Retro Diffusion rd-tile）。
 *
 * spritesheet 结构：
 *   "tiles"       → assets/tiles.png       (640×64,  10 frames: ground 0-5 + walls 6-9)
 *   "items"       → assets/items.png       (2048×64, 32 frames)
 *   "decors"      → assets/decors.png      (640×64,  10 frames)
 *   "backgrounds" → assets/backgrounds.png (384×64,   6 frames)
 *   "foregrounds" → assets/foregrounds.png (256×64,   4 frames)
 */

/** 场景背景墙 → backgrounds.png 帧索引 */
export const BG_FRAME: Record<string, number> = {
  library: 0, dorm: 1, classroom: 2, art: 3, lab: 4, sakura: 5,
};
/** 前景覆盖 → foregrounds.png 帧索引 */
export const FG_FRAME: Record<string, number> = {
  ceiling_lamp: 0, tree_canopy: 1, window_light: 2, bookshelf_top: 3,
};

/** 地面 tile 序号 → 名称 */
export const GROUND_INDEX: Record<number, string> = {
  0: "wood_floor", 1: "tile_floor", 2: "stone_floor",
  3: "grass", 4: "white_tile", 5: "path",
};

/** 物品类型 → spritesheet 帧索引 */
export const ITEM_FRAME: Record<string, number> = {
  // 原 14 种 (0-13)
  desk:    0,  seat:    1,  pc:      2,  bed:     3,
  piano:   4,  easel:   5,  board:   6,  tree:    7,
  bench:   8,  shelf:   9,  vending: 10, counter: 11,
  door:    12, window:  13,
  // 新家具 (14-19)
  locker: 14, trash_can: 15, round_table: 16,
  water_fountain: 17, cabinet: 18, podium: 19,
  // 新物品 (20-23)
  plant: 20, lamp: 21, sofa: 22, whiteboard: 23,
  // 户外 (24-28)
  flower_bed: 24, lantern: 25, fountain: 26,
  bush: 27, books_stack: 28,
  // 场景专属 (29-31)
  microscope: 29, music_stand: 30, globe: 31,
};

/** 地板装饰 → decors.png 帧索引 */
export const DECOR_FRAME: Record<string, number> = {
  rug_round: 0, rug_rect: 1, mat_entry: 2, line_tape: 3,
};
/** 墙面装饰 → decors.png 帧索引 */
export const WALL_DECOR_FRAME: Record<string, number> = {
  poster: 4, bulletin: 5, painting: 6,
  clock_wall: 7, certificate: 8, curtain: 9,
};

/** 地面名称 → tiles.png 帧索引（0-5 旧 + 10-15 新） */
export const GROUND: Record<string, number> = {
  wood_floor: 0, tile_floor: 1, stone_floor: 2,
  grass: 3, white_tile: 4, path: 5,
};
