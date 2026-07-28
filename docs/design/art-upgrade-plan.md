# M11 美术升级方案 — AI 像素素材管线

> 状态：📝 方案阶段 | 日期：2026-07-29 | 关联：Step 62 / Phase 16

---

## 目标

将当前纯程序化 Canvas 纹理替换为 AI 生成的 64×64 像素素材，逼近商业 RPG 游戏视觉质量。

## 方案选型

**选择：方案 B — AI 生图 + 切片提取管线**

| | 方案 A: SVG | 方案 B: AI 像素（✅） |
|---|---|---|
| 工具 | Inkscape/Figma | Retro Diffusion / FrameRonin MCP / SpriteBrew |
| 视觉效果 | 矢量 UI 风 | RPG 像素游戏风 |
| 工作量 | 手绘 24 种素材 | Prompt → 生成 → 切片 |
| 可扩展性 | 低（手绘每张都慢） | 高（换 prompt 即可） |

## 素材清单（24 种，64×64 px）

### 地面瓦片（6 种）

| # | ID | 场景 | 描述 |
|---|-----|------|------|
| 1 | wood_floor | 📚🎨 | 深色木地板，水平木纹，暖棕 |
| 2 | tile_floor | 🏠 | 米色瓷砖，隐网格线 |
| 3 | stone_floor | 🔬 | 灰色石板，天然纹理 |
| 4 | grass | 🌸 | 绿色草地，稀疏小花 |
| 5 | white_tile | 🏫🔬 | 白色瓷砖，微光泽 |
| 6 | path | 🌸 | 不规则石板小路 |

### 墙壁瓦片（4 种）

| # | ID | 用途 |
|---|-----|------|
| 7 | wall_top | 上墙（远侧） |
| 8 | wall_bottom | 下墙（近侧） |
| 9 | wall_left | 左墙 |
| 10 | wall_right | 右墙 |

### 物品精灵（14 种）

| # | ID | 描述 |
|---|-----|------|
| 11 | desk | 木质课桌 |
| 12 | seat | 椅子 |
| 13 | pc | 台式电脑 |
| 14 | bed | 宿舍单人床 |
| 15 | piano | 三角钢琴 |
| 16 | easel | 画架+画布 |
| 17 | board | 黑板，有粉笔痕 |
| 18 | tree | 樱花树，粉色树冠 |
| 19 | bench | 公园长椅 |
| 20 | shelf | 书架，彩色书籍 |
| 21 | vending | 自动贩卖机 |
| 22 | counter | 服务台/柜台 |
| 23 | door | 木门+把手 |
| 24 | window | 窗户+玻璃反光 |

## 生成管线

```
Step 1: AI 生成
  工具: FrameRonin MCP / Retro Diffusion rd-tile
  输出: 单个 64×64 PNG 或 tileset 长条 PNG

Step 2: 切片（如生成的是 tileset 大图）
  工具: Spritesheet Cutter (浏览器) / SpriteSheet-Maker (Python GUI)
  输出: 24 个独立 64×64 PNG

Step 3: 拼合 spritesheet
  格式: 和现有 makeTexture() 输出一致（横向排列，frameWidth=64, frameHeight=64）
  工具: 任意图片拼接工具（或 Canvas 脚本）

Step 4: 替换纹理加载
  改 tileset.ts: 删除 draw 函数 → load.image() 加载 PNG
  改 BootScene.ts: 删除 generateAllTextures → preload() 加载素材
  改 avatars.ts: 同上

Step 5: 删除旧程序化代码
  清理 tileset.ts 中的 GROUND_DRAWERS / WALL_DRAWERS / ITEM_DRAWERS
```

## Prompts

### 统一风格前缀

```
top-down RPG view, pixel art, 64x64, school theme,
warm lighting, consistent palette, 16-bit SNES style,
clean outlines, transparent background (for items)
```

### 地面

```
1. dark wooden floor plank, horizontal grain, warm brown tones,
   seamless tileable 64x64, top-down RPG pixel art, SNES style

2. beige ceramic tile floor, subtle grid lines, indoor,
   seamless tileable 64x64, top-down RPG pixel art

3. gray stone floor, natural rough texture,
   seamless tileable 64x64, top-down RPG pixel art

4. green grass lawn, small scattered flowers, outdoor,
   seamless tileable 64x64, top-down RPG pixel art

5. clean white ceramic tile floor, bright, subtle shine,
   seamless tileable 64x64, top-down RPG pixel art

6. cobblestone path, irregular stones, outdoor walkway,
   seamless tileable 64x64, top-down RPG pixel art
```

### 墙壁

```
7-10. brown wooden wall edge [top/bottom/left/right],
      interior room border, 64x64, top-down RPG pixel art
```

### 物品

```
11. wooden school desk, flat surface, top-down, 64x64 pixel art SNES
12. wooden chair behind desk, top-down, 64x64 pixel art SNES
13. desktop computer monitor+keyboard, top-down, 64x64 pixel art SNES
14. dormitory single bed pillow+blanket, top-down, 64x64 pixel art
15. grand piano white keys, top-down, 64x64 pixel art SNES
16. wooden painting easel with canvas, top-down, 64x64 pixel art
17. classroom blackboard chalk marks, wall-mounted, 64x64 pixel art
18. cherry blossom sakura tree pink canopy, top-down, 64x64 pixel art
19. wooden park bench, top-down, 64x64 pixel art SNES
20. bookshelf colorful books, top-down, 64x64 pixel art SNES
21. vending machine glass front drinks, top-down, 64x64 pixel art
22. reception counter desk, top-down, 64x64 pixel art SNES
23. wooden door with handle, top-down, 64x64 pixel art SNES
24. window glass reflection wooden frame, top-down, 64x64 pixel art
```

## 验收标准

- [ ] 24 张素材全部生成并切片
- [ ] 拼合为现有 spritesheet 格式
- [ ] Phaser 加载并正确渲染（替代现有程序化纹理）
- [ ] 六场景视觉效果不低于当前程序化版本
- [ ] 前端测试全量通过
- [ ] 无新增外部运行时依赖（素材为静态 PNG）
