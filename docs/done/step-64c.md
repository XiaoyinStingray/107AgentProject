# Step 64c — Agent 对话循环（Mock）

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-28 |
| Phase | Phase 16.3 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 64c |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/dialogue.ts` | **新建** | Mock 对话池：5 Agent × 5×4 对话对象 × 6 场景 × 3-6 句 = 200+ 句 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | 接近扫描定时器（4s间隔）+ 冷却管理（8s同对）+ 气泡交替（1.2s延迟回复） |
| `backend/src/api/scenes.py` | 修改 | `POST /api/scenes/{id}/interact` — Mock 占位（66-S 切 LLM） |

## 技术决策

1. **纯前端 Mock 循环**：不调 LLM，不依赖后端。对话内容在 `dialogue.ts` 中按 `(speaker, listener, scene)` 三要素查找，fallback 到通用场景对话。
2. **扫描策略**：每次扫描只触发一对对话（`return` 提前），避免多对同时弹气泡造成视觉混乱。
3. **冷却管理**：`Map<string, number>` 按 `agentId|agentId`（排序后）存储上次对话时间戳，8s 冷却。
4. **对话查找**：用 `sprite.setData("name", d.name)` 存储中文名，`getDialogue(小林, 小红, library)` 查找。
5. **后端接口预留**：`POST /api/scenes/{id}/interact` 返回 scene-level mock 回复，66-S 只需替换实现即可切 LLM。

## 测试结果

- [x] 前端 239/239（24 files）✅
- [x] TypeScript 零错误 ✅
- [x] 后端 316/316 ✅
