# M12 集成计划 — 63 张素材投入使用

> 素材 → spritesheet 拼合 → 代码接入 → 场景重设计

---

## 素材清单

| 目录 | 数量 | 用途 | 优先级 |
|------|------|------|--------|
| `accessories_m12/` | 14 | 配饰扩展 | ⭐⭐⭐ |
| `scene_m12/grounds/` | 6 | 新地面材质 | ⭐⭐⭐ |
| `scene_m12/items/` | 4 | 新家具 | ⭐⭐⭐ |
| `scene_m12/furniture/` | 6 | 更多家具 | ⭐⭐ |
| `scene_m12/outdoor/` | 5 | 户外装饰 | ⭐⭐ |
| `scene_m12/special/` | 3 | 场景专属物品 | ⭐⭐ |
| `scene_m12/decors/` | 4 | 地板装饰 | ⭐⭐ |
| `scene_m12/wall_decor/` | 6 | 墙面挂饰 | ⭐⭐ |
| `scene_m12/backgrounds/` | 6 | 场景背景墙 | ⭐ |
| `scene_m12/transitions/` | 5 | 地板过渡 | ⭐ |
| `scene_m12/foregrounds/` | 4 | 前景覆盖 | ⭐ |

---

## Step 1: 配饰扩展（30 min）

**改动**: `accessories.ts` + 复制 PNG

把 14 张新配饰加到 `ACCESSORIES` 数组，每个配设定 `ox/oy/scale/layer`。有些需要特殊处理：

| 配饰 | 特殊处理 |
|------|----------|
| `halo` | layer=1, 球体后方光环 |
| `wings_white` | layer=0, 球体背后翅膀 |
| `arrow` | rotation=-35°, 斜插 |
| `bowtie` | oy=+15, 球体下方领结 |
| `sunglasses` | oy=0, 覆盖眼睛 |

`AccessoryDef` 加 `rotation?: number` 字段，`AgentSprite` 创建时 `.setAngle()`。

**文件**: `accessories.ts`、`AgentSprite.ts`、复制 14 张 PNG 到 `public/assets/accessories/`

---

## Step 2: 扩地图 + 新地面（2 hr）

### 2.1 拼合新 tiles.png

当前 `tiles.png` 是 640×64 (10 帧: 地面 0-5 + 墙壁 6-9)。

新结构：**1024×64 (16 帧)**

| 帧 | 内容 | 来源 |
|----|------|------|
| 0-5 | 原 6 种地面 | 现有 tiles.png |
| 6-9 | 原 4 种墙壁 | 现有 tiles.png |
| 10-15 | **6 种新地面** | `scene_m12/grounds/` |

排列：原 10 帧 + 新 6 帧横向拼接。

### 2.2 更新 tileset.ts

```typescript
GROUND_INDEX 加: 10="carpet_red", 11="tatami", 12="marble", 13="brick", 14="concrete", 15="dark_wood"
GROUND 加反向映射
```

### 2.3 重写 6 个场景 JSON（16×12）

每场景 ground 网格从 12×8 扩到 16×12，增加更多地面混合：

- 📚 library: 深色木地板为主 + tatami 阅读区
- 🏠 dorm: tile_floor 为主 + dark_wood 走廊  
- 🏫 classroom: white_tile 为主 + carpet_red 讲台区
- 🎨 art: dark_wood 为主 + marble 展区
- 🔬 lab: concrete 为主 + white_tile 实验区
- 🌸 sakura: grass 为主 + brick 步道

### 2.4 适配代码

- `GameCanvas.tsx`: COLS=16, ROWS=12
- `MapScene.ts`: fallback 值更新
- `GameScene.tsx`: SPAWN_SLOTS 坐标适配 16×12

---

## Step 3: 物品 spritesheet 扩展（1 hr）

当前 `items.png` 是 896×64 (14 帧)。

新结构：**~1920×64 (30 帧)**

| 帧 | 类型 | 来源 |
|----|------|------|
| 0-13 | 原 14 种物品 | 现有 items.png |
| 14-19 | 新家具 6 | `scene_m12/furniture/` |
| 20-23 | 新物品 4 | `scene_m12/items/` |
| 24-28 | 户外 5 | `scene_m12/outdoor/` |
| 29-31 | 专属 3 | `scene_m12/special/` |

更新 `ITEM_FRAME` 映射，所有场景 JSON 的 `items` 数组增加新物品。

---

## Step 4: 装饰层（1 hr）

新增 `decors` spritesheet，在 `groundLayer` 之上渲染地板花纹。

**拼合**: 4 张 decor + 6 张 wall_decor = 10 帧 `decors.png`

**MapScene 改动**:
- `placeDecors(d)` — 新建装饰层，从 JSON `decors` 数组读取
- 装饰用 `Phaser.GameObjects.Image` 以 sprite 方式放置，不做碰撞检测
- 墙面装饰沿墙放置（tileY=0/H-1, tileX=0/W-1）

---

## Step 5: 景深三层（1.5 hr）

### 5.1 背景层

每场景一张 tileable 背景纹理，用 `this.add.tileSprite(0, 0, W, H, "backgrounds", bgIndex)` 铺满画布，depth=-1。

### 5.2 前景层

前景 sprite 渲染在 Agent 之上（depth 20），室内场景放吊灯影子，户外场景放树冠。

### 5.3 过渡 tile

扩 `tiles.png` 再多 5 帧（或单独 spritesheet），在两种地面交界处放置过渡 tile。这是精细活——需要在 scene JSON 中手动标注过渡位置。

**优先级**: 前景 > 背景 > 过渡（过渡最耗时）

---

## 执行顺序

```
Step 1 (配饰) → 立刻可见，先做
   ↓
Step 2 (扩地图) → 一次性重写所有 JSON，最有冲击力
   ↓
Step 3 (物品扩展) → 往更大的地图里填东西
   ↓
Step 4 (装饰层) → 细节打磨
   ↓
Step 5 (景深) → 最终视觉升级
```

---

## 影响评估

| 文件 | 改动类型 |
|------|----------|
| 6 个 scene JSON | 重写（16×12 ground + 扩 items + 新增 decors） |
| `tileset.ts` | 加新帧映射 |
| `tiles.png` | 重新拼合 (16 帧) |
| `items.png` | 重新拼合 (30 帧) |
| `decors.png` | 🆕 新建 (10 帧) |
| `backgrounds.png` | 🆕 新建 (6 帧) |
| `foregrounds.png` | 🆕 新建 (4 帧) |
| `accessories.ts` | 加 14 个条目 + rotation 字段 |
| `AgentSprite.ts` | rotation 渲染 |
| `BootScene.ts` | 加载新 spritesheet |
| `MapScene.ts` | 背景层 + 装饰层 + 前景层 + 尺寸适配 |
| `GameCanvas.tsx` | COLS/ROWS 常量 |
| `GameScene.tsx` | SPAWN_SLOTS 适配 |
