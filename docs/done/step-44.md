# Step 44 — 干预台完善 (#43, #48)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-26 |
| Phase | Phase 12.6 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 44 |
| 状态 | ✅ done |

## 产出

### #43 事件注入增强 — 效果预览 + 类型传递

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/DirectorIntervention.tsx` | 修改 | 表单下方新增「👁️ 效果预览」卡片，实时显示注入事件的类型/目标/描述；注入时传递 type + targetAgentId 到后端 |
| `frontend/src/api/worlds.ts` | 修改 | `useInjectEvent` 参数新增可选 `type`/`targetAgentId`，乐观更新缓存 |

### #48 干预历史持久化

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/intervention_orm.py` | **新建** | `InterventionRow` SQLite ORM（id, world_id, type, target_agent_id, description, created_at） |
| `backend/src/db.py` | 修改 | `init_db()` 注册 intervention_orm |
| `backend/src/api/worlds.py` | 修改 | ① `inject_event` 保存到 interventions 表，返回完整干预数据（含 target_agent_name）② 新增 `GET /{id}/interventions` 端点 |
| `frontend/src/types/intervention.ts` | 修改 | +`InterventionResponse` 类型（零破坏） |
| `frontend/src/api/queryKeys.ts` | 修改 | +`interventionKeys` |
| `frontend/src/api/worlds.ts` | 修改 | +`useWorldInterventions(worldId)` hook；`useInjectEvent` 乐观更新：`onSuccess` 中 `setQueryData` 直接插入缓存头部 |
| `frontend/src/pages/DirectorIntervention.tsx` | 修改 | 历史从 API 加载（替代 useState mock）；未选 World 时引导选择；badge P3→P2 |

### 测试适配

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/intervention/intervention-components.test.tsx` | 修改 | 共享可变数组模拟乐观更新；新增效果预览测试和无 World 选择提示测试；移除清空按钮相关测试 |
| `backend/tests/test_worlds_api.py` | 修改 | `_sync_create_tables` 注册 intervention_orm |

## 决策记录

- **保守增量策略：** 不改 `InjectionEventType` 的 4 种类型、不改 `InjectionRecord.status` 三态、不改任何 mock 工具函数。所有改动纯增量。
- **移除清空按钮：** 用户反馈"隐藏不清后端数据"的设计奇怪。干预历史是数据库持久化记录，不应随意批量清空，直接删除按钮。
- **乐观更新替代 invalidate：** 用户反馈注入后有延迟。改用 `setQueryData` 在 `onSuccess` 中直接插入缓存——注入点击后立即出现在历史列表。

## 接口变更

| 变更 | BREAKING? |
|------|-----------|
| `POST /api/worlds/{id}/inject` 返回体新增 `intervention` 字段（原 `intervention_id` 改为嵌套） | ⚠️ 返回体变更，但前端同步适配 |
| `POST /api/worlds/{id}/inject` 请求体新增可选 `type`/`target_agent_id` | 否——后端兜底 |
| 新增 `GET /api/worlds/{id}/interventions` | 否——纯新增 |
| `useInjectEvent` 参数新增可选 `type`/`targetAgentId` | 否——向后兼容 |

## 测试结果

- [x] 前端 227/227 全通过（20 files） — ✅
- [x] 后端 worlds API 14/16 通过（2 预存 OpenAI 凭证失败） — ✅
- [x] TypeScript 零错误 — ✅
- [x] 人工验收 — ✅

## 已知问题

- 2 个预存后端测试失败（`test_start_without_agents_returns_400`、`test_start_and_reset_record_simulation`），根因是测试环境无 OpenAI 凭证，与 Step 44 无关

## 对下一步的提示

- Step 44 完成后可继续 Step 46（竞技场增强）或 Step 47（LLM 成本与性能优化）
- `GET /api/worlds/{id}/interventions` 端点已在 Swagger 可见
