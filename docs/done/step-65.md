# Step 65 — 时间轴 + 快照（存档系统）

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-28 |
| Phase | Phase 16.4 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 65 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/checkpoint_orm.py` | **新建** | CheckpointRow：scene_id + name + agents_json + created_at，上限 30/场景 |
| `backend/src/api/scenes.py` | 修改 | `GET/POST /api/scenes/{id}/checkpoints` + `DELETE`；`POST /api/scenes/{id}/interact` |
| `backend/src/db.py` | 修改 | 注册 checkpoint_orm |
| `frontend/src/api/scenes.ts` | 修改 | `useCheckpoints` / `useCreateCheckpoint` / `useDeleteCheckpoint` hooks |
| `frontend/src/api/queryKeys.ts` | 修改 | +`sceneKeys.checkpoints` |
| `frontend/src/components/scene/CheckpointPanel.tsx` | **新建** | 暂停/继续 + 保存存档（命名） + 加载 + 删除 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | `pauseSimulation()`/`resumeSimulation()`；BUG-023 修复；`_loadingMap` 防重入 |
| `frontend/src/pages/GameScene.tsx` | 修改 | 暂停状态 + 存档操作 + CheckpointPanel 渲染 |
| `docs/bugs.md` | 修改 | BUG-023 标记已修复 |

## 技术决策

1. **存档代替自动快照**：用户手动保存，避免内存爆炸。暂停 → 保存 → 加载 → 继续。比自动 tick 快照更可控。
2. **暂停仅停止前端模拟**：`AutonomousMover.stop()` + `dialogueTimer.paused = true` + `tweens.killTweensOf()`。无 LLM/SSE 依赖，比 World 引擎暂停简单可靠。
3. **SQLite 持久化**：`agents_json` TEXT 列存完整 AgentSpriteData[]，上限 30 个，新建时检查 `count >= MAX`。
4. **加载 = 替换**：加载存档直接 `setAgents(cp.agents)` 替换当前全部 Agent 状态 + 同步 localStorage。
5. **BUG-023 根因**：`buildScene()` 中 `if (this.pendingAgents)` — TypeScript falsy 检查，但 `pendingAgents` 可能为空数组 `[]`（falsy），导致跳过。改为 `const agents = this.pendingAgents ?? []; this.pendingAgents = null; if (agents.length > 0)` 显式处理。

## 测试结果

- [x] 前端 263/263（26 files）✅
- [x] TypeScript 零错误 ✅
- [x] 后端 361/361 ✅
