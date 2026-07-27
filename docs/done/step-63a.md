# Step 63a — Agent 精灵 + 动作（前端）

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-27 |
| Phase | Phase 16.2 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 63a |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/sprites/AgentSprite.ts` | **新建** | Agent 精灵类：72px 圆 + emoji + 名字 + 情绪光环 + 4 动作 |
| `frontend/src/game/sprites/ActionBubble.ts` | **新建** | 头顶气泡：圆角矩形 + 文字 → 弹出动画 → 2.5s 自动淡出 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | +Agent 精灵层（depth 15），`setAgents()` / `getAgentSprite()` / `showAgentBubble()` |
| `frontend/src/game/GameCanvas.tsx` | 修改 | +`agents` prop → 同步到 MapScene |
| `frontend/src/pages/GameScene.tsx` | 修改 | Mock 5 Agent + 场景切换重设位置 + 每个 Agent 独立情绪控制 |
| `frontend/src/game/tileset.ts` | 修改 | 2x 高清升级：`ctx.scale(2,2)` 输出 64×64 物理像素 |
| `frontend/src/game/GameCanvas.tsx` | 修改 | TILE 64px，画布 768×512，`pixelArt: false` 平滑渲染 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | TILE_S 64px |
| `docs/plan-state3.md` | 修改 | Step 63 拆分为 63a（前端精灵）+ 63b（后端 API） |

## 技术决策

1. **Agent 精灵 ~1.1× tile 大小**：圆半径 36px（72px 直径），比 64px tile 略大一圈。名字 16px 字号清晰可读。
2. **4 种动作而非计划的 6 种**：idle（呼吸 scale 1.0↔1.04）、walk（文字弹跳）、sit（0.78x + 下移）、talk（气泡）。emote 和 use_item 留给 Step 64。
3. **情绪光环而非变色**：情绪变化体现在外圈光环颜色+脉冲，主体圆保持个性色不变，避免 Agent 身份混淆。
4. **2x 高清**：贴图逻辑坐标 32px 完全不动，`makeTexture` 内 `ctx.scale(2,2)` 翻倍输出，绘制代码零修改。
5. **Mock 先行**：5 个 Agent（小林/小红/小刚/小雪/阿杰）全部前端 mock，后端 API 留给 63b。

## 测试结果

- [x] 前端 239/239（24 files）✅
- [x] TypeScript 零错误 ✅
- [x] 后端 316/316 ✅
