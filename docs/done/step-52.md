# Step 52 — 工作流引擎 + Plan 模型

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-26 |
| Phase | Phase 14.2 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 52 |
| 状态 | ✅ done |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/plan_orm.py` | **新建** | `PlanRow` ORM：id, team_id, task, steps (JSON), status, world_id, created_at |
| `backend/src/engines/team/__init__.py` | **新建** | 包初始化 |
| `backend/src/engines/team/decomposer.py` | **新建** | `TaskDecomposer`：LLM 分解任务 + 规则兜底（按角色模板生成子任务） |
| `backend/src/engines/team/planner.py` | **新建** | `PlanManager`：跟踪步骤进度、处理 `update_plan` tool、每 tick 检查推进 |
| `backend/src/engines/team/engine.py` | **新建** | `TeamEngine`：编排工作流——分解→创建 World→驱动执行→同步 Plan DB |
| `backend/src/api/teams.py` | 修改 | +`POST /api/teams/{id}/execute`、`GET /api/teams/{id}/plan`、`GET /api/teams/{id}/plan/history`；修复 suggest_roles 解析非数组响应 |
| `backend/src/db.py` | 修改 | +1 行注册 plan_orm |
| `backend/tests/test_teams_api.py` | 修改 | +5 个 Plan 测试（execute/plan/幂等）+ 注册 plan_orm |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/team.ts` | 修改 | +`PlanStep`、`TeamPlan` 类型 |
| `frontend/src/api/teams.ts` | 修改 | +`useExecuteTeam`、`useTeamPlan`（5s 轮询） |
| `frontend/src/pages/TeamDashboard.tsx` | 修改 | Team 卡片加「▶ 执行」按钮 + 状态指示（执行中/已完成） |

## 决策记录

- **Plan 持久化到 plans 表**（而非内存+events）：用户可能分多次完成任务，重启不能丢 Plan。一个 Team 同时只有一个活跃 Plan。
- **TeamEngine 复用 WorldEngine**：不重写模拟逻辑。创建临时 World 跑 GroupChat，TeamEngine 只做编排——分解任务→创建 World→每个 tick 同步 Plan→结束。
- **TaskDecomposer 双路径**：LLM 优先（prompt 含 Agent 角色信息），不可用时规则兜底（按角色模板 1:1 生成子任务 + 全员整合步骤）。
- **Plan 进度检测用关键词启发式**（非 LLM）：每个 tick 检查 Agent 消息中是否提及步骤标题关键词，匹配则推进 25% 进度。简单但可工作——LLM 判定留到 Step 54 诊断引擎。

## 接口变更

- 新增：`POST /api/teams/{id}/execute`、`GET /api/teams/{id}/plan`、`GET /api/teams/{id}/plan/history`
- `POST /api/teams/suggest-roles`：修复 LLM 返回非数组时没走规则兜底的 bug
- 无 BREAKING 变更

## 测试结果

- [x] 后端 teams API 21/21 — ✅
- [x] 后端全量 302/302 — ✅
- [x] 前端 232/232（21 files） — ✅
- [x] TypeScript 零错误 — ✅

## 已知问题

- 进度检测用简单关键词匹配，不如 LLM 判定精准（Step 54 诊断引擎会增强）
- 执行中的 Team 没有暂停/取消 UI（Step 53 看板会补）

## 对下一步的提示

- Step 53（Team 看板 UI）依赖本步的 `useTeamPlan` hook 和 Plan 数据结构
- `world_id` 已创建但暂未在前端展示——Step 53 看板可以链接到沙盒观察执行
