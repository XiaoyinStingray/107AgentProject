# Step 51 — Team 组建

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-26 |
| Phase | Phase 14.1 |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step 51 |
| 状态 | ✅ done |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/team_orm.py` | **新建** | `TeamRow` ORM：id, name, description, agent_ids (JSON), roles (JSON), status, created_at |
| `backend/src/api/teams.py` | **新建** | `POST/GET/DELETE /api/teams` + `GET /api/teams/{id}` + `POST /api/teams/suggest-roles`（LLM + MBTI 规则兜底） |
| `backend/src/db.py` | 修改 | +1 行注册 team_orm |
| `backend/src/main.py` | 修改 | +2 行注册 teams router |
| `backend/tests/test_teams_api.py` | **新建** | 16 个测试：CRUD 12 + 角色推荐 2 + 边界 2 |
| `backend/src/api/narratives.py` | 修改 | `get_narrative_engine` 无凭证时返回 503（而非 crash） |
| `backend/src/api/teams.py` | 修改 | `suggest_roles`：LLM 优先 → MBTI 规则兜底（16 种人格→角色映射） |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/team.ts` | **新建** | `TeamRole`、`SuggestedRole`、`TeamCreate`、`TeamSummary`、`TeamDetail`、`AgentBrief` |
| `frontend/src/api/teams.ts` | **新建** | `useTeams`、`useCreateTeam`、`useDeleteTeam`、`useSuggestRoles` |
| `frontend/src/api/queryKeys.ts` | 修改 | +`teamKeys` |
| `frontend/src/pages/TeamDashboard.tsx` | **新建** | 创建表单（选 Agent → 智能推荐角色 → 确认创建）+ Team 列表 + 删除 |
| `frontend/src/data/menuData.ts` | 修改 | +M9 section（空 items，直接导航 `/team`）；#21 群体动力学从 M3 移到 M6 |
| `frontend/src/components/layout/Sidebar.tsx` | 修改 | +M9 图标映射 |
| `frontend/src/App.tsx` | 修改 | +`/team` 路由（懒加载） |
| `frontend/src/pages/ControlPanel.tsx` | 修改 | +`useLocation` + `useEffect` 响应 `#item-21` hash → 自动切 dynamics tab |
| `frontend/src/components/control/control-components.test.tsx` | 修改 | +`react-router-dom` mock（ControlPanel 新增 useLocation） |
| `frontend/src/components/control/GroupDynamics.tsx` | 修改 | +下载 .md 按钮（BUG-021） |

### 基础设施

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/config.py` | 修改 | `.env` 路径从 `backend/` 改为项目根目录 |

## 决策记录

- **Agent × Team 多对多**：用 JSON 数组存 agent_ids，不建关联表——与 World 的 agent_ids_json 策略一致。
- **角色推荐双路径**：LLM 优先，不可用时用 16 种 MBTI→角色规则映射兜底。保证功能在无 API Key 环境也能用。
- **M9 无子菜单项**：与 M1–M8 不同，M9 侧边栏不展开子项列表。子能力（Kanban/诊断/复盘）留到后续 Step 在页面内部 Tab 切换。
- **#21 菜单项移位置**：群体动力学报告功能实现在 M6 控制台，原本菜单挂在 M3 群体沙盒下导致入口错误。移到 M6 控制台菜单。

## 接口变更

- 新增端点：`POST/GET /api/teams`、`GET/DELETE /api/teams/{id}`、`POST /api/teams/suggest-roles`
- `POST /api/narratives/report`（已有端点）：LLM 不可用时从 crash 改为 503 + 明确错误信息
- 无 BREAKING 变更

## 附带 Bug 修复

| Bug | 描述 | 修复 |
|-----|------|------|
| 群体动力学 500 | `get_narrative_engine` 调用 `create_model_client()` 无凭证 crash | try/except → 503 |
| 群体动力学入口错位 | 侧边栏 #21 在 M3（/sandbox）但实现在 M6（/control） | #21 从 M3 移到 M6 + ControlPanel 加 hash 响应 |
| 角色推荐 500 | `suggest_roles` 调 LLM 无凭证崩溃 | LLM 优先 → MBTI 规则兜底 |

## 测试结果

- [x] 后端 teams API 16/16 — ✅
- [x] 后端 worlds API 14/16（2 预存 OpenAI） — ✅
- [x] 前端 232/232（21 files） — ✅
- [x] TypeScript 零错误 — ✅
- [x] 人工验收：创建 Team → 智能推荐角色 → 列表展示 → 删除 — ✅

## 已知问题

- 2 个预存 OpenAI 凭证失败（test_worlds_api.py），与 Step 51 无关
- `suggest-roles` 规则兜底返回的角色基于 MBTI 静态映射，不如 LLM 推荐精准（标注了"规则推荐"）
- 侧边栏跳转问题（预存 BUG-019）

## 对下一步的提示

- Step 52（工作流引擎）依赖本步的 `teams` 表和 `TeamEngine` 入口
- Team 的 `description` 字段承载任务描述，Step 52 的 TaskDecomposer 以此作为分解输入
- M10/M11 侧边栏入口预留（menuData 可追加 section）
