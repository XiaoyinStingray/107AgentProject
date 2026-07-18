# Step 12 — Agent 路由

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18 |
| Phase | Phase 5.1 |
| Plan 章节 | [development-plan.md](../development-plan.md) §5.2 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/agents.py` | 新建 | Agent CRUD 路由 + AgentStore + FastAPI 依赖注入 |
| `backend/src/engines/agent_factory/factory.py` | 修改 | `to_response()` 返回 `AgentResponse`（Pydantic），加 `created_at`/`updated_at` |
| `backend/tests/test_agents_api.py` | 新建 | 9 个测试：CRUD 全流程 + 输入校验 |
| `backend/tests/test_agent_factory.py` | 修改 | 适配 `to_response()` 从 dict → AgentResponse |

## 决策记录

- **AgentStore 为内存字典：** P0 简化，和 Step 11 的 World 注册表同模式。Phase 5.3 main.py 组装时升级为 SQLite-backed。

- **LifeAgent.to_response() 修复：** 之前返回 dict（缺 `created_at`/`updated_at`），现返回完整的 `AgentResponse` Pydantic 模型。Phase 2 code-review 发现的类型缺口已闭合。

- **Pydantic 校验 → 422：** `AgentCreate(description=..., min_length=3)` 在请求体解析阶段由 Pydantic 校验，空/过短描述返回 422（FastAPI 标准），而非 400。

- **FastAPI 依赖覆盖：** 测试中用 `app.dependency_overrides[get_agent_factory]` 注入 Mock，避免调真 LLM。

## 接口变更

```python
# 新增 API 端点
POST   /api/agents         → AgentResponse (201)
GET    /api/agents         → list[AgentResponse]
GET    /api/agents/{id}    → AgentResponse | 404
DELETE /api/agents/{id}    → {"ok": true} | 404

# 修改
LifeAgent.to_response() → AgentResponse  # 原: dict
LifeAgent.created_at / updated_at        # 新增字段
```

## 测试结果

- [x] POST 创建返回 201 + AgentResponse — ✅
- [x] 空描述 → 422 — ✅
- [x] GET 空列表 — ✅
- [x] GET 创建后列表包含 — ✅
- [x] GET 单个 Agent — ✅
- [x] GET 不存在 → 404 — ✅
- [x] DELETE 存在 → 200 + {"ok": true} — ✅
- [x] DELETE 不存在 → 404 — ✅
- [x] to_response 返回完整 AgentResponse（含时间戳） — ✅

```
149 passed in 1.70s (9 new + 140 existing, 0 regressions)
```

## 已知问题

- AgentStore 存内存，重启丢失。Phase 5.3 升级 SQLite persistence。
- Swagger UI 需 Step 14 main.py 组装后才能访问（`/docs`）。

## 对下一步的提示

- Step 13 (World 路由) 同模式：`api/worlds.py` + WorldStore + CRUD。
- Step 14 (main.py 组装) 挂载所有 router + CORS + lifespan。
