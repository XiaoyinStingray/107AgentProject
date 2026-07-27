# Step 62 — 场景引擎

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-27 |
| Phase | Phase 16.1 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 62 |
| 状态 | ✅ done（重写） |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/tileset.ts` | **重写** | 纯程序化纹理生成：6 地面 + 4 墙壁 + 14 物品，Canvas 绘制，零外部依赖 |
| `frontend/src/game/scenes/BootScene.ts` | **重写** | 异步生成纹理 → 启动 MapScene，仅 ~15 行 |
| `frontend/src/game/scenes/MapScene.ts` | **重写** | `this.make.tilemap()` 原生 tilemap；ground + walls 合并单层；物品帧映射；天气粒子 |
| `frontend/src/game/GameCanvas.tsx` | **重写** | 384×256 基础分辨率，Scale.FIT 自适应容器，tile 统一 32px |
| `frontend/src/pages/GameScene.tsx` | 保持 | `/scene` 路由页，场景选择器 + GameCanvas |
| `frontend/src/data/scenes/library.json` | **重写** | 图书馆：木地板 + 瓷砖走道，6书架 4书桌 2电脑 1柜台 |
| `frontend/src/data/scenes/dorm.json` | **重写** | 宿舍：瓷砖地 + 木地板区，4床 4桌 4电脑 2书架 窗户 |
| `frontend/src/data/scenes/classroom.json` | **重写** | 教室：白砖 + 讲台木地板，10课桌×2排 + 10椅 + 黑板 + 讲桌 |
| `frontend/src/data/scenes/art.json` | **重写** | 艺术中心：木地板 + 白砖区，钢琴 4画架 2书架 黑板 柜台 |
| `frontend/src/data/scenes/lab.json` | **重写** | 实验室：白砖 + 两侧石板，8实验台 4电脑 黑板 柜台 书架 |
| `frontend/src/data/scenes/sakura.json` | **重写** | 樱花大道：草地 + 石板弯路，6樱树 3长椅 落樱粒子 |
| `frontend/src/data/menuData.ts` | 修改 | 新增 M11 section（`/scene` 路由） |

## 技术决策

1. **放弃外部 spritesheet → 纯程序化纹理**：Ocean's Nostalgia 素材包的帧布局无法可靠获取。改为 Canvas 全程绘制 32×32 纹理，颜色、形状完全可控，不依赖任何外部资源。
2. **原生 tilemap API**：`this.make.tilemap({data})` + `addTilesetImage()` + `createLayer()`，不再逐 tile 手画 `add.image()`。
3. **墙壁自动计算**：室内场景（`indoor: true`）自动在边界画四面墙，spawn 点留门洞。不需要在每个 JSON 里手写墙壁坐标。
4. **地面纹理多样**：每场景使用多种地面类型（wood/tile/stone/grass/white/path），而非全场景单一颜色。
5. **标题在 UI 侧**：Canvas 内不再覆盖场景名文字，由 React 场景选择器按钮的选中态展示。

## 测试结果

- [x] 前端 239/239（24 files）✅
- [x] TypeScript 零错误 ✅
- [x] 后端 316/316 ✅
- [x] Vite build 通过 ✅
