# M12 场景复杂化 & 配饰扩展 — TODO List

> 日期：2026-07-29 | 前序：M11 AI素材管线 | 当前：12×8 tile / 6地面 / 14物品 / 10配饰

---

## Phase 1: 场景复杂化 🏗️

### 1.1 地图尺寸升级

当前 12×8 (768×512px) → **目标 16×12 (1024×768px)**

| # | 任务 | 涉及文件 | 说明 |
|---|------|----------|------|
| 1 | `COLS`/`ROWS` 常量改为 16/12 | `GameCanvas.tsx` | 同时改 Phaser 画布尺寸 |
| 2 | 所有 6 个场景 JSON 改为 16×12 | `data/scenes/*.json` | 重写 ground 网格 + 物品坐标 |
| 3 | `SPAWN_SLOTS` 坐标适配 | `GameScene.tsx` | 5 个 Agent 投放位均分到 16×12 |
| 4 | MapScene fallback 值 `??12`/`??8` → `??16`/`??12` | `MapScene.ts` | 边界检查和拖拽限制 |
| 5 | 旧 localStorage 数据兼容处理 | `GameScene.tsx` | 读取旧 12×8 存档时重置到新尺寸 |

### 1.2 地面瓦片扩展

当前 6 种地面 → **目标 12+ 种**

| # | 素材名称 | 场景用途 | Prompt 关键词 |
|---|----------|----------|---------------|
| 6 | `carpet_red` | 🎨 艺术中心 | red carpet floor, plush textile, theater |
| 7 | `tatami` | 🏠 宿舍 | tatami mat floor, straw texture, japanese |
| 8 | `marble` | 🔬 实验室 | white marble floor, polished stone, veins |
| 9 | `brick` | 🌸 户外 | red brick pavement, weathered, outdoor |
| 10 | `concrete` | 🏫 教室 | gray concrete floor, smooth industrial |
| 11 | `dark_wood` | 📚 图书馆 | dark hardwood floor, polished, elegant |

### 1.3 装饰层 — 地板花纹

新增 "decor" 层，叠加在地面上，只覆盖部分 tile（如地毯、花纹）。用独立 spritesheet `decor.png`，在 `groundLayer` 之上以 sprite 方式放置。

| # | 素材 | 说明 |
|---|------|------|
| 12 | `rug_round` | 圆形地毯（图书馆阅读区） |
| 13 | `rug_rect` | 长方形地毯（教室讲台前） |
| 14 | `mat_entry` | 入口脚垫（宿舍/实验室门口） |
| 15 | `line_tape` | 地面标线（实验室安全线/舞台标记） |

### 1.4 新增物品类型

当前 14 种物品 → **目标 22+ 种**

| # | ID | 描述 | Prompt 关键词 |
|---|-----|------|---------------|
| 16 | `plant` | 盆栽绿植 | potted plant green leaves, 64x64 pixel art |
| 17 | `lamp` | 落地灯 | floor lamp warm light, 64x64 pixel art |
| 18 | `sofa` | 双人沙发 | two-seat sofa cushions, 64x64 pixel art |
| 19 | `table` | 圆桌/方桌 | round wooden table, 64x64 pixel art |
| 20 | `whiteboard` | 白板（替代黑板用） | whiteboard markers, modern, 64x64 pixel art |
| 21 | `locker` | 储物柜 | metal locker cabinet, 64x64 pixel art |
| 22 | `trash` | 垃圾桶 | trash can bin, 64x64 pixel art |
| 23 | `clock` | 挂钟 | wall clock round, 64x64 pixel art |

### 1.5 多 tile 结构物

用 2×2 或更大 tile 组成大型物件，增强场景的丰富感。

| # | 结构 | tile 数 | 适用场景 |
|---|------|---------|----------|
| 24 | 大型书架墙 | 1×3 竖排 | 📚 图书馆 |
| 25 | 实验台 | 2×1 横排 | 🔬 实验室 |
| 26 | 舞台区域 | 3×2 | 🎨 艺术中心 |
| 27 | 双层床 | 1×2 | 🏠 宿舍 |
| 28 | 讲台+白板组合 | 2×1 | 🏫 教室 |
| 29 | 樱花大树 | 2×2 | 🌸 樱花大道 |

### 1.6 墙壁样式多样化

当前墙壁是一个通用样式 → **每场景独立墙壁素材**

| # | 场景 | 墙壁风格 |
|---|------|----------|
| 30 | 📚 图书馆 | 深色木质墙板 + 书架嵌入 |
| 31 | 🏠 宿舍 | 浅色壁纸墙 + 踢脚线 |
| 32 | 🏫 教室 | 白色墙壁 + 下方护墙板 |
| 33 | 🎨 艺术中心 | 深红幕布/画廊白墙 |
| 34 | 🔬 实验室 | 白色瓷砖墙 + 金属边框 |
| 35 | 🌸 樱花大道 | 低矮灌木篱笆（替代墙壁） |

### 1.7 环境氛围增强

| # | 效果 | 实现方式 |
|---|------|----------|
| 36 | 场景特定背景色 | 覆写 Phaser bg `#1a1a2e` → 每场景不同底色 |
| 37 | 灯光粒子（室内） | 浮动微尘/光点粒子效果 |
| 38 | 水波纹（户外池塘） | 简单的 tilesprite 动画 |
| 39 | 窗帘/挂饰 | 墙壁内侧的装饰 sprite |

---

## Phase 2: 配饰扩展 🎀

### 2.1 新配饰清单（AI 生成，Retro Diffusion）

当前 10 种 → **目标 22 种**

#### 天使/恶魔系
| # | ID | 位置 | 说明 |
|---|-----|------|------|
| 40 | `halo` | `ox:0, oy:-36, layer:1` | 天使光环，浮在头顶后方 |
| 41 | `wings_white` | `ox:0, oy:2, layer:0` | 白色天使翅膀，球体背后 |
| 42 | `horns_red` | `ox:0, oy:-28, layer:1` | 红色恶魔角 |
| 43 | `arrow_cupid` | `ox:-14, oy:-8, layer:2, rot:-35°` | 丘比特箭斜插，需要旋转 |

#### 帽子系
| # | ID | 位置 | 说明 |
|---|-----|------|------|
| 44 | `wizard_hat` | `ox:0, oy:-32, layer:2` | 魔法师尖帽，紫色+星星 |
| 45 | `top_hat` | `ox:0, oy:-32, layer:2` | 黑色高顶礼帽 |
| 46 | `chef_hat` | `ox:0, oy:-32, layer:2` | 白色厨师帽 |
| 47 | `straw_hat` | `ox:0, oy:-30, layer:2` | 草帽，宽檐 |
| 48 | `beanie` | `ox:0, oy:-30, layer:2` | 针织毛线帽 |

#### 装饰系
| # | ID | 位置 | 说明 |
|---|-----|------|------|
| 49 | `flower_crown` | `ox:0, oy:-28, layer:1` | 花环，球体上方环绕 |
| 50 | `headband` | `ox:0, oy:-30, layer:2` | 运动发带 |
| 51 | `bunny_ears` | `ox:0, oy:-32, layer:1` | 兔耳朵，细长竖立 |
| 52 | `star_pin` | `ox:-10, oy:-22, layer:2` | 星星发夹，偏一侧 |
| 53 | `bowtie` | `ox:0, oy:15, layer:2` | 领结，球体下方 |
| 54 | `sunglasses` | `ox:0, oy:0, layer:2` | 墨镜，覆盖眼睛 |
| 55 | `mask` | `ox:0, oy:0, layer:2` | 眼罩/面具 |

### 2.2 配饰系统增强

| # | 任务 | 说明 |
|---|------|------|
| 56 | `AccessoryDef` 加 `rotation?: number` | 支持斜插配饰（箭头、发夹等） |
| 57 | `AgentSprite` 配饰创建时应用 `.setAngle()` | 渲染旋转 |
| 58 | 多配饰支持：每个 Agent 可戴 1-2 个 | 头顶+面部共存（如帽子+墨镜） |
| 59 | AgentPanel 显示当前配饰名称 | UI 可视化 |

---

## Phase 3: 视觉品质提升 🎨

### 3.1 渲染质量

| # | 任务 | 说明 |
|---|------|------|
| 60 | `pixelArt: false → true` | GameCanvas 开启像素完美渲染 |
| 61 | `antialias: true → false` | 像素素材不需要抗锯齿 |
| 62 | tile 尺寸 64→128 或保持 64 | 评估：更大 tile = 更精细但需要重新生成素材 |

### 3.2 光照/阴影

| # | 任务 | 说明 |
|---|------|------|
| 63 | 物品阴影统一（当前每个物品单独 shadow ellipse） | 改为统一阴影层 |
| 64 | Agent 脚底阴影增强 | 当前是简单 ellipse，可换为软阴影 sprite |

### 3.3 粒子/动画

| # | 任务 | 说明 |
|---|------|------|
| 65 | 场景加载时物品淡入动画 | 替代瞬间出现 |
| 66 | 天气效果加强（樱花已有，加雨滴/雪） | `startWeather` 扩展 |

---

## 影响评估

| 维度 | 变更量 |
|------|--------|
| 新增素材（AI 生成） | ~20 地面/物品 + ~12 配饰 = **~32 张 PNG** |
| 新增/修改代码文件 | ~8 个（JSON×6 + GameCanvas + MapScene + accessories + AgentSprite + GameScene） |
| JSON 重写 | 6 个场景的地面网格 + 物品坐标全部重写（工作量最大） |
| 向后兼容 | 旧 localStorage 数据需迁移或重置 |

---

## 建议执行顺序

```
先做配饰扩展 (Phase 2) — 改动小、风险低、立刻可见
  ↓
再扩地图尺寸 (1.1) — 一次性改完所有 JSON
  ↓
加地面/物品素材 (1.2-1.4) — 填充更大的地图空间
  ↓
墙壁+装饰层 (1.5-1.6) — 精细打磨
  ↓
视觉品质 (Phase 3) — 锦上添花
```
