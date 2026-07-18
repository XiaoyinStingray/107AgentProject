# Step 13 — World 路由

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18 |
| Phase | Phase 5.2 |
| Plan 章节 | [development-plan.md](../development-plan.md) §5.3 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/worlds.py` | 新建 | World CRUD + start/pause/inject 端点 + WorldStore |
| `backend/tests/test_worlds_api.py` | 新建 | 10 个测试：CRUD + 控制端点 |

## 决策记录

- **WorldStore 同 AgentStore 模式：** 内存字典，P0 简化。两者通过 FastAPI Depends 注入，World 端点访问 AgentStore 以查找引用的 Agent。

- **`start` 端点注册到 SSE：** 调用 `api.sse.register_world()` 使 SSE 端点能通过 `get_world_engine()` 找到活跃 World。前端连接 `/api/worlds/{id}/stream` 时自动触发流式 tick。

- **DB session 生命周期：** `_build_world_engine` 创建 session 并传给 WorldEngine，由 engine 持有 session 引用。P0 不做显式 session close（SQLite 进程结束自动回收）。

- **空 scenario → 默认"新生报到"：** 创建 World 时若 scenario 为空（无 name），自动使用第一个内置场景。

## 接口变更

```python
# 新增 API 端点
POST   /api/worlds              → WorldResponse (201)
GET    /api/worlds              → list[WorldResponse]
GET    /api/worlds/{id}         → WorldResponse | 404
POST   /api/worlds/{id}/start   → {"status": "started"} | 400/404/409
POST   /api/worlds/{id}/pause   → {"status": "paused"} | 404
POST   /api/worlds/{id}/inject  → {"status": "injected"} | 400/404
```

无破坏性变更。

## 测试结果

- [x] POST 创建 + 默认场景 — ✅
- [x] GET 空列表 / 创建后列表 — ✅
- [x] GET 单个 / 404 — ✅
- [x] start 无 Agent → 400 — ✅
- [x] start missing → 404 — ✅
- [x] pause idle → 200 — ✅
- [x] inject 未运行 → 400 — ✅

```
159 passed in 1.89s (10 new + 149 existing, 0 regressions)
```

## 对下一步的提示

- Step 14 (main.py 组装) 是 Phase 5 收尾：挂载 `agents.router` + `worlds.router` + `sse.sse_router` + CORS + lifespan。
- Swagger UI 在 Step 14 完成后通过 `/docs` 可访问。
