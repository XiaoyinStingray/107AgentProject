# Step 30 — Narratives API 路由

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-20 |
| Phase | Phase 10.2 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 30 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/narratives.py` | 新建 | 叙事 API 路由（3 个端点 + 请求/响应体 + NarrativeEngine 单例） |
| `backend/src/main.py` | 修改 | 注册 `narratives_router` |

## 决策记录

- **端点粒度：** 3 个独立端点（`/story`、`/diary`、`/letter`）而非一个 `/{style}` 通用端点。原因：Swagger 文档更清晰，每个端点有独立描述，前端调用意图更明确。
- **请求体简化：** Plan 中 `NarrativeRequest` 是 engine 层类型（含 `events: list[SimEvent]` + `persona: Persona`），API 层用 `NarrativeGenRequest`——只需 `agent_id` + `world_id` + `target`。后端从 AgentStore 取 persona、从 SQLite events 表取事件。
- **事件读 SQLite：** 直接从 `events` 表查询而非从内存 WorldEngine 取。为 Step 31（Events API）做铺垫——两者共享同一查询逻辑。
- **PODCAST 暂未暴露：** Plan 只要求 story/diary/letter 三个端点。PODCAST 模板在 engine 中已就绪，Step 42 按需加 `/podcast` 端点。

## 接口变更

- 新增 3 个 API 端点：`POST /api/narratives/story`、`/diary`、`/letter`
- 请求体 `NarrativeGenRequest`：`{ agent_id, world_id, target? }`
- 响应体 `NarrativeGenResponse`：`{ title, content, style, agent_id, generated_at }`
- 无共享 Pydantic model 变更
- ⚠️ 依赖 AgentStore（内存）取 persona——Agent 重启后丢失则叙事请求返回 404

## 测试结果

- [x] 后端全量测试 — ✅ 194 passed
- [x] OpenAPI schema 验证 — ✅ 3 个路由已注册
- [x] Router import 验证 — ✅ prefix=/api/narratives, routes=[/story, /diary, /letter]

## 已知问题

- 叙事生成需在有 Agent 和 Event 的世界中才能产生有意义的输出——空事件列表返回"（无记录的事件）"
- Step 35 持久化后 Agent 不会因重启丢失，届时叙事 404 问题自然解决

## 对下一步的提示

- Step 31 需要加 `/api/arenas` 路由和 `GET /api/worlds/{id}/events`——后者可复用本步的 SQLite events 查询逻辑
- 前端 NarrativeFactory 目前用 Mock 数据，Step 34 切换到真实 API
