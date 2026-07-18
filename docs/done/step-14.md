# Step 14 — main.py 组装 + 全局 registry

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18 |
| Phase | Phase 5.3 |
| Plan 章节 | [development-plan.md](../development-plan.md) §5.4 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/main.py` | 修改 | 挂载 3 个 router（agents / worlds / sse） |

## 决策记录

- **只挂载已实现的路由：** Plan 列出了 agents、worlds、simulations、narratives、arenas、sse、export 共 7 个路由。当前仅挂载 agents + worlds + sse（3 个已实现），其余 Phase 6/8/9 实现后追加。

- **无单独"全局 registry"文件：** Plan 设计的 `active_worlds` 全局字典已分布在 `api/sse.py`（SSE 注册表）和 `api/worlds.py`（WorldStore）中，无需单独模块。

## 接口变更

```
app.include_router(agents_router)   # /api/agents/*
app.include_router(worlds_router)   # /api/worlds/*
app.include_router(sse_router)      # /api/worlds/{id}/stream
app.get("/health")                  # 保持不变
```

无破坏性变更。`/health` 端点不变。CORS 中间件和 lifespan 保持不变。

## 测试结果

```
159 passed in 2.13s (0 new, 0 regressions — 纯组装，无新增逻辑)
```

## 已知问题

- Swagger UI (`/docs`) 可访问，但 `POST /api/worlds/{id}/start` 的 `_build_world_engine` 依赖真 LLM，Swagger 直接调会因无 API key 而失败。
- `simulations`、`narratives`、`arenas`、`export` 路由尚未实现，不在当前路由表中。

## 阶段闭合

Phase 5 (FastAPI 服务层) 完成。后端 API 体系就绪——前端可通过 REST + SSE 与引擎交互。
