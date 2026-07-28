# Step 66 — 特效 + 导演模式

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-28 |
| Phase | Phase 16.5 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 66 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/scene/DirectorPanel.tsx` | **新建** | 上帝之声广播 + 天气切换（☀/🌸/🌧）+ 全员氛围一键设 |
| `frontend/src/game/effects/EmoteBurst.ts` | **新建** | 情绪粒子爆发：8-14 个彩色粒子从 Agent 周身射出 + angry 屏幕微震 |
| `frontend/src/game/sprites/AgentSprite.ts` | 修改 | `setEmotion()` 非 neutral 触发 `emoteBurst()` |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | `setWeather()` 动态切换 + `broadcastGodVoice()` 全员气泡 |
| `frontend/src/pages/GameScene.tsx` | 修改 | weather 状态 + 导演操作 handlers + DirectorPanel 渲染 |

## 技术决策

1. **天气热切换**：`setWeather(type)` 停止旧粒子 tween → 重建新类型粒子。`mapData.weather` 原地修改，场景 JSON 不持久化。
2. **粒子爆发差异化**：angry/excited 14 粒（更强烈），其余 8 粒。angry 额外触发 `camera.shake(200, 0.003)`。
3. **上帝之声**：遍历所有 `agentSprites` → 每个创建独立 `ActionBubble` → `show()`。效果为全员同时弹同一句话。
4. **全员氛围**：React `setAgents` 批量改 emotion → 每个 Agent 的 `setEmotion()` 各自触发粒子爆发。
5. **暂不实现的剧本/分支**：移至 66-S。

## 测试结果

- [x] 前端 263/263（26 files）✅
- [x] TypeScript 零错误 ✅
- [x] 后端 361/361 ✅
