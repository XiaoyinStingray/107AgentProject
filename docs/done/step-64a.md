# Step 64a — 点击 + 拖拽交互

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-28 |
| Phase | Phase 16.3 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 64a |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/scene/AgentPanel.tsx` | **新建** | 右侧滑出面板：名字/emoji/颜色/位置/动作/情绪 + 情绪切换 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | `placeAgents()` 注册 Phaser 交互：pointerdown/up/drag/dragend |
| `frontend/src/game/GameCanvas.tsx` | 修改 | 启用 Phaser input；`onAgentClick`/`onAgentMove` callback → React |
| `frontend/src/pages/GameScene.tsx` | 修改 | `selectedAgentId` 状态 + AgentPanel 挂载 + callback 处理 |
| `docs/plan-state3.md` | 修改 | Step 64 拆分为 64a（点击+拖拽）+ 64b（右键+双击） |

## 技术决策

1. **Phaser input 重新启用**：`keyboard: false, mouse: true, touch: true`。只启用指针事件，不引入键盘。
2. **点击 vs 拖拽区分**：`pointerdown→pointerup` 距离 < 8px = 点击，≥ 8px = 拖拽。拖拽松手吸附到最近 tile（`Math.round(x/64)`）。
3. **Phaser → React 事件桥**：`game.events.emit("agent-clicked"/"agent-moved")` → GameCanvas 通过 `cbRef` 调用 React callback。避免直接引用的闭包陈旧问题。
4. **交互区域**：`Phaser.Geom.Circle(r=36)` 匹配 AgentSprite 的圆形视觉区域。
5. **拖拽范围限制**：吸附到 tile 后 clamp 到场景边界（0..W-1, 0..H-1）。
6. **AgentPanel 叠在 UI 层**：`fixed right-4 top-24`，不占用 Phaser canvas 空间。

## 测试结果

- [x] 前端 239/239（24 files）✅
- [x] TypeScript 零错误 ✅
- [x] 后端 316/316 ✅
