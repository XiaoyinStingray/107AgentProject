# Step 73 — 全项目 Bug 清零

> **日期:** 2026-07-31 | **估时:** 4h | **状态:** ✅

---

## 概述

CHECK-2 人工验收驱动的全量 Bug 修复轮次。覆盖对话气泡、音频、天气粒子、拖拽交互、渲染层级等问题。

## 修复清单

### 一、对话与气泡类

| Bug | 根因 | 修复 |
|-----|------|------|
| 暂停后仍有情绪弹出 | 暂停未阻止 emoji 弹出调度 | 暂停时取消情绪弹出定时器 |
| 连续消息气泡重叠 | 旧气泡未在新消息到达时清除 | `queueDialogue` 创建新气泡前销毁旧气泡 |
| 切换场景气泡残留 | `ActionBubble` 实例未被追踪 | 新增 `activeBubbles` Set 追踪所有气泡；`destroyScene()` 统一 `hide()` |
| 事件通知文字残留 | `showEventNotification` 创建的 Text 未追踪 | 新增 `eventNotifications` 数组；`destroyScene()` 统一清理 |

### 二、音频类

| Bug | 根因 | 修复 |
|-----|------|------|
| 暂停恢复后人物不继续说话 | `DialoguePlaybackQueue` 恢复逻辑缺陷 | 重构为 `processing`/`nextTimer`/`generation` 模式，确保恢复时正确推进 |
| 场景卸载后残留声音 | 队列未在 shutdown 时清空 | `destroyScene()` 调用 `queue.clear()` |

### 三、天气与粒子类

| Bug | 根因 | 修复 |
|-----|------|------|
| 天气切换后旧粒子残留 | `setWeather()` 只停 tween 不销毁 GameObject | 新增 `weatherParticles` 数组独立追踪；`setWeather()` 先 destroy 再清空 |
| 樱花大道雨天无粒子 | `setWeather()` 在 `mapData` 为 null 时直接 return，天气变更丢失 | 新增 `pendingWeather` 字段；`buildScene` 初始化时优先读取 |
| 樱花大道晴天掉花瓣 | `sakura.json` 的 `weather: "sakura"` 触发了天气粒子系统 | 改为 `"weather": "clear"` |

### 四、拖拽交互类

| Bug | 根因 | 修复 |
|-----|------|------|
| 拖动时人物乱动 | `AutonomousMover` 在拖拽期间仍持续运行 | `dragstart` 时 `stop()` mover；`dragend` 后 `start()` |
| 拖到物品上人物变透明 | 前景层 depth=20 覆盖 Agent depth=15 | Agent 基础 depth 提升到 25 |
| 人物可穿过物品 | `isWalkable()` 只检查墙壁，不检查物品占位 | 新增 `isItemTile()` 方法；`isWalkable()` 同时检查墙壁+物品 |

### 五、渲染层级

| Bug | 根因 | 修复 |
|-----|------|------|
| Agent 被前景层（树冠）遮挡 | 前景 depth=20 + alpha=0.35 > Agent depth=15 | 统一调整层级：Agent→25, EmoteBurst→28, ActionBubble→30 |

## 涉及文件

| 文件 | 操作 |
|------|------|
| `frontend/src/game/scenes/MapScene.ts` | 新增 `activeBubbles`/`weatherParticles`/`eventNotifications`/`pendingWeather` 追踪；拖拽 mover 控制；天气/气泡/通知生命周期管理 |
| `frontend/src/game/sprites/AgentSprite.ts` | depth 15→25；emoji 弹窗重影修复（tween 追踪 + alpha/scale 重置 + emoji 字体栈） |
| `frontend/src/game/sprites/ActionBubble.ts` | depth 25→30 |
| `frontend/src/game/effects/EmoteBurst.ts` | depth 25→28 |
| `frontend/src/game/dialogue.ts` | 新增 `fetchWhisperDialogue`（后回退，保留代码） |
| `frontend/src/data/scenes/sakura.json` | weather `"sakura"` → `"clear"`（去掉花瓣粒子） |
| `frontend/src/game/audio/DialoguePlaybackQueue.ts` | 重构为 `processing`/`nextTimer`/`generation` 模式（用户修改） |
| `frontend/src/game/audio/AgentVoiceEngine.ts` | 回退为简单 `number` 音量参数（用户修改） |

## 验收

- [x] 暂停后无情绪 emoji 弹出
- [x] 连续消息气泡正常切换，无重叠
- [x] 切换场景时所有气泡/事件通知消失
- [x] 暂停恢复后 Agent 继续说话
- [x] 天气切换无粒子残留；樱花大道无花瓣飘落
- [x] 拖拽时人物不抖动；拖到物品上不变透明
- [x] Agent 不被前景层（树冠）遮挡
- [x] 物品阻挡 Agent 移动，不可穿过
- [x] 前端测试 5/5 通过
