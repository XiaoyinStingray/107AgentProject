# Step 41 — 决策回放 + 角色冲突 + 群体动力学 (#13, #19, #21)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-26 |
| Phase | Phase 12.2 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 41 |
| 状态 | ✅ done |

## 产出

### #13 决策回放

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/worlds.py` | 修改 | `GET /{world_id}/events` 新增 `agent_id` 查询参数 |
| `frontend/src/components/agent/ThoughtBubble.tsx` | 修改 | 新增 `onClick` prop，气泡可点击 |
| `frontend/src/components/agent/ThoughtStream.tsx` | 修改 | 新增 `onEventClick` prop，传递给 ThoughtBubble |
| `frontend/src/pages/GroupSandbox.tsx` | 修改 | 新增 `replayEvent` 状态 + 决策回放详情弹窗 |

### #19 角色冲突检测

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/world/conflict.py` | **新建** | 冲突检测模块：关键词反义匹配 + 冲突事件生成 |
| `backend/src/engines/world/engine.py` | 修改 | `_post_process_tick` 集成 `_detect_conflict()` |
| `frontend/src/types/events.ts` | 修改 | SSEEventType 新增 `conflict_detected` |
| `frontend/src/types/sandbox.ts` | 修改 | TimelineTick 新增 `hasConflict` |
| `frontend/src/components/world/Timeline.tsx` | 修改 | 冲突节点红色高亮 |
| `frontend/src/components/world/EventFeed.tsx` | 修改 | 新增 ConflictMeta 组件显示冲突详情 |

### #21 群体动力学报告

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/narrative/templates.py` | 修改 | 新增 `REPORT_PROMPT` 模板 |
| `backend/src/engines/narrative/engine.py` | 修改 | NarrativeStyle 新增 `REPORT` + 模板映射 |
| `backend/src/api/narratives.py` | 修改 | 新增 `POST /report` 端点 |
| `frontend/src/types/control.ts` | 修改 | ControlTab 新增 `dynamics` |
| `frontend/src/mocks/control.ts` | 修改 | CONTROL_TABS 新增 dynamics 条目 |
| `frontend/src/api/narratives.ts` | 修改 | 新增 `useGenerateReport` hook + ReportResponse 类型 |
| `frontend/src/components/control/GroupDynamics.tsx` | **新建** | 群体动力学报告组件 |
| `frontend/src/pages/ControlPanel.tsx` | 修改 | 新增 dynamics Tab 渲染 |

### 测试

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_conflict_detection.py` | **新建** | 13 个冲突检测单元测试 |
| `frontend/src/components/control/control-components.test.tsx` | 修改 | Tab 数量 4→5 更新 |

## 决策记录

1. **冲突检测用关键词反义匹配**：P2 阶段可接受，不增加 LLM 调用开销
2. **决策回放前端为主**：后端仅需补充 `agent_id` 过滤参数，核心交互在前端
3. **复用 NarrativeEngine 架构**：REPORT 风格与现有 5 种风格共用同一套生成逻辑

## 接口变更

- `GET /api/worlds/{world_id}/events` 新增可选参数 `agent_id: str | None`
- `POST /api/narratives/report` 新端点：`{ world_id: str } → ReportResponse`
- SSEEventType 新增 `"conflict_detected"`

## 测试结果

- [x] 后端冲突检测 13/13 通过 ✅
- [x] 前端 227/227 通过 ✅

## 对下一步的提示

- Step 42（叙事工厂完善）可独立推进
- 冲突检测算法可后续升级为 LLM 语义分析
