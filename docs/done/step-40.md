# Step 40 — 目标追逐 (#10)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-24 |
| Phase | Phase 12.2 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 40 |
| 状态 | ✅ done |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/agent.py` | 修改 | Goal 加 `progress: float = 0.0` + `in_progress` 状态 |
| `backend/src/engines/world/state.py` | 修改 | `_handle_set_goal` 支持同名目标更新（防重复）+ 重置 progress |
| `backend/src/engines/world/engine.py` | 修改 | 新增 `_update_goal_progress()` — tick 结束时扫描 thought/message，keyword 匹配 goal description → progress += 0.1；≥1.0 → achieved；>0 且 <1.0 → in_progress |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/agent/GoalPanel.tsx` | **新建** | Goal 列表 + 进度条 + 状态徽章（active/in_progress/achieved/abandoned） |
| `frontend/src/pages/SoloTheater.tsx` | 修改 | 左栏加入 GoalPanel card，显示当前 Agent 的目标和进度 |
| `frontend/src/types/agent.ts` | 修改 | Goal 接口加 `progress: number` + `in_progress` 状态 |
| `frontend/src/mocks/agents.ts` | 修改 | Mock Goal 补 `progress: 0` |

### 目标生命周期

```
set_goal("写完高数作业") → active, progress=0
  → tick 中 Agent 提及"高数作业" → progress += 0.1
  → progress > 0 → in_progress
  → progress += 0.1 × N
  → progress >= 1.0 → achieved ✅
```

## 决策记录

- **Keyword 匹配而非 LLM 判定：** 用 goal.description 中的 2+ 字符子串匹配 Agent 输出的 thought/message 文本，简单高效，不增加 LLM 调用。
- **progress 步进 0.1：** 每个 tick 最多 +0.1（非 0.25），让进度条有"累积感"。需要 Agent 持续关注目标约 10 ticks 才能达成。
- **同名目标防重复：** `_handle_set_goal` 检测到同 description 的目标时更新而非追加，防止 Agent 反复 set_goal 导致列表膨胀。

## 接口变更

- `Goal.status` 新增可选值 `"in_progress"`
- `Goal.progress` 新增必填字段 `float`（0.0–1.0，默认 0.0）

## 测试结果

- [x] TypeScript — ✅ 零错误
- [x] 前端 13/13 通过，203/203 通过 — ✅
- [x] 后端 212/214 通过（2 个已有 env 问题） — ✅

## 补充记录（2026-07-24）

追加了三项增强，使目标系统真正可用：

1. **SSE 实时推送** — `_update_goal_progress` 返回 `goal_update` SSE 事件，SoloTheater 通过 `goalOverrides` Map 动态合并到 `enrichedAgent`，GoalPanel 实时显示进度
2. **Goal 持久化** — `_sync_agent_goals_to_db` 在 pause/reset 时将 WorldEngine 中的 goal 状态写回 agents 表
3. **完成反馈 + 新目标提示** — `_build_goal_context` 向 World context 注入已达成 goal 摘要，鼓励 Agent 设定新目标

### 补充文件

| 文件 | 改动 |
|------|------|
| `backend/src/engines/world/engine.py` | `_update_goal_progress` → 返回 goal_update 事件；`_post_process_tick` 合并 |
| `backend/src/engines/world/state.py` | `_build_world_context` 追加 `_build_goal_context()` — 达成/进行中的目标提示 |
| `backend/src/api/worlds.py` | `_sync_agent_goals_to_db` — pause/resume/reset 时回写 goal 到 agents 表 |
| `frontend/src/types/events.ts` | SSEEventType 加 `goal_update` |
| `frontend/src/types/agent.ts` | 导出 `GoalStatus` 类型 |
| `frontend/src/components/world/EventFeed.tsx` | EVENT_VISUALS + INFRASTRUCTURE_EVENTS 加 goal_update |
| `frontend/src/pages/SoloTheater.tsx` | `goalOverrides` + `enrichedAgent` — SSE 动态更新 GoalPanel |

## 对下一步的提示

- Step 40-S（动态计划 #11）标记跳过
- Step 41（决策回放 + 群体动力学）可独立推进，不依赖 Goal 系统
