# Step 53 — Team 看板 UI（含 Step 51–52 迭代）

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-27 |
| Phase | Phase 14.1–14.5（合并交付） |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 51–55 |
| 状态 | ✅ done |

> 实际开发中 Step 51–55 被合并为一个迭代周期。以下按功能维度记录最终产出，而非按原 Plan Step 拆分。

## 产出总览

### 一、Team 组建

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/team_orm.py` | **新建** | `TeamRow` ORM |
| `backend/src/api/teams.py` | **新建** | CRUD + 角色推荐（LLM + MBTI 规则兜底） |
| `frontend/src/types/team.ts` | **新建** | Team / TeamRole / PlanStep / TeamPlan 等 |
| `frontend/src/api/teams.ts` | **新建** | useTeams / useCreateTeam / useExecuteTeam / useEvaluateTeam 等 |
| `frontend/src/pages/TeamDashboard.tsx` | **新建** | 创建 Team + 列表 + 看板视图 |
| `frontend/src/data/menuData.ts` | 修改 | +M9 section |
| `frontend/src/components/layout/Sidebar.tsx` | 修改 | +M9 图标 |
| `frontend/src/App.tsx` | 修改 | +`/team` 路由 |

### 二、工作流引擎 + Plan 模型

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/plan_orm.py` | **新建** | `PlanRow` ORM（含 report 列） |
| `backend/src/engines/team/__init__.py` | **新建** | 包初始化 |
| `backend/src/engines/team/decomposer.py` | **新建** | TaskDecomposer（LLM + 规则兜底） |
| `backend/src/engines/team/planner.py` | **新建** | PlanManager + LLM 协调器（YES/NO/DRIFT 三态判定） |
| `backend/src/engines/team/engine.py` | **新建** | TeamEngine（创建 World + 挂 PlanManager + DB 同步） |
| `backend/src/engines/agent_factory/factory.py` | 修改 | LifeAgent 加 `replace_tools()` 方法 |
| `backend/src/engines/agent_factory/tools.py` | 修改 | 新 tool：`submit_deliverable` + `finish_task` + `TEAM_AGENT_TOOLS` |
| `backend/src/engines/world/state.py` | 修改 | +`_build_team_context()` + `_handle_submit_deliverable` handler |
| `backend/src/engines/world/engine.py` | 修改 | Team 模式跳过关系/冲突检测 |
| `backend/src/engines/world/messages.py` | 修改 | +`submit_deliverable`/`finish_task` 描述；Team 模式跳身份检测；`_build_group_task` 注入历史对话；删 `[:500]` 截断 |
| `backend/src/engines/world/streaming.py` | 修改 | Team 模式注入跨 tick 对话历史 |
| `backend/src/api/sse.py` | 修改 | Team Plan 推进 + `plan_updated`/`coordinator_nudge`/`report_ready` 事件 |
| `backend/src/db.py` | 修改 | 注册 team_orm + plan_orm；plans 表加 report 列迁移 |

### 三、看板 UI

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/team/LiveChat.tsx` | **新建** | 实时对话面板（接收父组件 events） |
| `frontend/src/pages/team/HealthPanel.tsx` | **新建** | 右侧任务进展：进度条 + 步骤状态 + 协调器提示 |
| `frontend/src/types/events.ts` | 修改 | SSEEventType 加 `plan_updated`/`coordinator_nudge`/`report_ready` |
| `frontend/src/components/world/EventFeed.tsx` | 修改 | 同上 |
| `frontend/src/pages/DirectorIntervention.tsx` | 修改 | 过滤 Team: 前缀 World |

### 四、复盘报告 + 评估

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/teams.py` | 修改 | +`POST /api/teams/{id}/evaluate`（LLM 分析 Plan + 事件） |
| `frontend/src/pages/TeamDashboard.tsx` | 修改 | 报告展示 + ⬇下载 + 📊评估按钮 + 评估结果展示 |

### 五、测试

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_teams_api.py` | **新建** / 多次追加 | 26 个测试（CRUD + 角色推荐 + execute + plan + 幂等） |
| `backend/tests/test_worlds_api.py` | 修改 | 注册 plan_orm |
| `frontend/src/components/control/control-components.test.tsx` | 修改 | +react-router-dom mock |
| `frontend/src/components/intervention/intervention-components.test.tsx` | 修改 | 适配 useWorldInterventions mock |

## 关键设计决策

- **LLM 协调器替代纯规则推进**：每 3 tick LLM 判定阶段完成（YES/NO/DRIFT），连续 3 次 DRIFT 强制推进
- **Team 工具集**：`send_message` + `think_aloud` + `submit_deliverable` + `finish_task`（无 observe/set_goal）
- **跨 tick 对话连贯**：`_build_group_task` 注入最近 10 条历史，agent 不丢失上下文
- **Plan 持久化**：每 tick 同步 DB，退出重入状态不丢
- **报告持久化**：PlanRow.report 列，重入可查看
- **左右分栏**：左 2/3 实时对话、右 1/3 任务进展
- **evaluate 端点**：LLM 分析 Plan 产出 + 事件流 → 协作质量评价

## 已知问题

- BUG-022 成就统计数字不显示
- BUG-019 侧边栏跳转问题（预存）
- 删除的 `[:500]` 截断 + 智能引号修复可能影响沙盒模式（302 测试通过确认无回归）

## 测试结果

- [x] 后端 302/302 — ✅
- [x] 前端 232/232（21 files） — ✅
- [x] TypeScript 零错误 — ✅
