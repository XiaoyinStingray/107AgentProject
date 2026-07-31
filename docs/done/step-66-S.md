# Step 66-S — LLM 升级 + 情绪引擎 + 内容丰富

> **日期:** 2026-07-30 | **估时:** 5h | **状态:** ✅

---

## 交付内容

### 1. EmotionEngine（前端）

`frontend/src/game/emotion/EmotionEngine.ts` — 五重触发链：

| 触发链 | 机制 | 间隔 |
|--------|------|------|
| 对话触发 | ~60 条关键词正则 → 8 种情绪方向 | 每次气泡弹出 |
| 环境触发 | 场景氛围（6 场景×情绪）+ 物品接近（10 种物品） | 30s |
| 社交共鸣 | 3 tile 内同情绪→放大；happy↔angry→中和 | 每次对话扫描 |
| Decay | 向 neutral 回归 1 格 | 30s |
| 随机事件 | 18 个场景特定事件（停电/随堂测/樱花飘落…） | 30-70s |

附带：事件通知横幅 + 全员闪烁 + 粒子爆发

### 2. 对话系统重写

`frontend/src/game/dialogue.ts` — 三层策略：

| 层 | 实现 |
|----|------|
| 优先 | `POST /api/scenes/{id}/interact` → DeepSeek LLM（UserMessage） |
| 兜底 | 扩展 mock 池（每组合 6-10 句，原 3 句） |
| 极端 | 场景通用 fallback |

`frontend/src/game/scenes/MapScene.ts` — 多轮对话引擎：
- 2-4 轮来回（原单轮）
- 双方暂停移动、面对面 talk 姿态
- 对话结束→各退一步（tween 动画）
- 同时最多 1 组活跃会话

### 3. AutonomousMover 升级

`frontend/src/game/AutonomousMover.ts`：
- 三策略混合：物品寻求 25% + 社交接近 40%（全图搜索）+ 随机漫游 35%
- 情绪影响移动速度：angry 220ms / sad 450ms / tired 500ms
- 注入物品位置 + Agent 位置回调（MapScene 更新）

### 4. 后端

`backend/src/engines/scene/engine.py`：
- `detect_emotion()` — 关键词情绪检测
- `generate_dialogue_llm()` — AutoGen UserMessage → DeepSeek
- `RandomEventEngine` — 18 个场景事件
- `_mock_dialogue()` — 完整 mock 对话池（与前端对齐）

`backend/src/api/scenes.py`：
- `/interact` — LLM 优先 + `source` 字段区分
- `/random-event` — 场景事件端点

### 5. BUG-025 修复

Team World 的 `world_type` 隔离：
- Team engine: `world_type="group"` → `"team"`
- GroupSandbox: `!== "solo"` → `=== "group"`（显式匹配）
- SoloTheater: `!== "group"` → `=== "solo"`（显式匹配）
- DB 迁移：历史 Team World group→team

---

## 涉及文件

| 文件 | 操作 |
|------|------|
| `frontend/src/game/emotion/EmotionEngine.ts` | **新建** |
| `frontend/src/game/dialogue.ts` | 重写（mock 池扩展 + LLM fetch + 防重复） |
| `frontend/src/game/scenes/MapScene.ts` | 重写对话引擎（多轮 + 会话管理） |
| `frontend/src/game/AutonomousMover.ts` | 三策略移动 + 情绪速度 + 全图社交搜索 |
| `frontend/src/game/effects/EmoteBurst.ts` | 冷却 2s→8s |
| `backend/src/engines/scene/engine.py` | LLM 对话 + 随机事件 + 情绪检测 |
| `backend/src/api/scenes.py` | `/interact` LLM 升级 + `/random-event` 端点 |
| `backend/src/engines/team/engine.py` | world_type group→team |
| `backend/src/db.py` | BUG-025 迁移 |
| `frontend/src/pages/GroupSandbox.tsx` | world_type 过滤修正 |
| `frontend/src/pages/SoloTheater.tsx` | world_type 过滤修正 |

---

## 验收

- [x] EmotionEngine 五重触发链全部运行
- [x] 对话 LLM 占比 >80%（DeepSeek V4 Flash）
- [x] 多轮对话（2-4 轮）正常，对话结束后 Agent 正确散开
- [x] 情绪粒子效果不频繁（8s 冷却 + 仅类型变化触发）
- [x] 随机事件通知可见 + Agent 有反应
- [x] 284 前端测试全过，后端编译通过
- [x] BUG-025 Team World 隔离修复
