# Step 64b — 右键耳语 + 双击篡改

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-28 |
| Phase | Phase 16.3 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 64b |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/scene/WhisperBox.tsx` | **新建** | 底部浮动输入框→回车发送→`ActionBubble` 显示耳语 |
| `frontend/src/components/scene/PersonaTamper.tsx` | **新建** | 右侧滑出面板：大五人格 OCEAN 5 滑块 + 应用/取消 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | 右键检测（`pointer.rightButtonDown()`）+ 双击检测（300ms timer）+ `agent-whisper` 事件监听 |
| `frontend/src/game/GameCanvas.tsx` | 修改 | +`onAgentRightClick`/`onAgentDoubleClick`/`onGameReady` props + 事件 bridge |
| `frontend/src/pages/GameScene.tsx` | 修改 | 耳语/篡改状态管理 + `gameRef` 传递 whisper 事件 + 人格 localStorage 持久化 |

## 技术决策

1. **双击 vs 单击分离**：`pointerdown` 检测右键提前返回；`pointerup` 用 300ms timer——第二次点击在窗口内 → `agent-doubleclicked`，超时 → `agent-clicked`。
2. **耳语通过 Phaser 事件传递**：GameScene → `game.events.emit("agent-whisper")` → MapScene 监听 → `ActionBubble.show()`。避免跨组件引用。
3. **Personality mock 先行**：`DEFAULT_PERSONALITY`（OCEAN 均 50-60）用于 mock Agent；真实 Agent 可替换为 API 数据。存储在 `localStorage("m11-personalities")`。
4. **GameCanvas 暴露 game 实例**：`onGameReady(game)` callback，GameScene 持有 `gameRef` 用于 emit 事件。
5. **Personality 类型导出**：`export interface Personality { openness, conscientiousness, extraversion, agreeableness, neuroticism }` — 为后续 API 对接预留。

## 测试结果

- [x] 前端 239/239（24 files）✅
- [x] TypeScript 零错误 ✅
- [x] 后端 316/316 ✅
