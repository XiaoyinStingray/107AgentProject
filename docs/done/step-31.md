# Step 31 — Arenas + Events + Relationships + Simulations API

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-20 |
| Phase | Phase 10.3 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 31 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/arenas.py` | 新建 | Arena API (POST /debate, GET /{id}, GET /) + 内存结果存储 |
| `backend/src/api/simulations.py` | 新建 | Simulations API (GET /, GET /{id}) + `create_simulation`/`finish_simulation` 工具函数 |
| `backend/src/api/worlds.py` | 修改 | 加 GET /{id}/events (SQLite) + GET /{id}/relationships (活跃 WorldEngine) |
| `backend/src/main.py` | 修改 | 注册 arenas_router + simulations_router |
| `backend/src/engines/agent_factory/factory.py` | 修改 | 删除 `_sanitize_agent_name`；AutoGen name 改为 `agent_{id后8位}` |
| `backend/tests/test_agent_factory.py` | 修改 | 适配新 name 策略（中文名不再透传到 AutoGen） |

## 决策记录

- **AutoGen name 简化：** 原 `_sanitize_agent_name` 试图保留中文名经 sanitize 后作为 AutoGen name，但导致参与辩论的两方可能同名（都是 `__`）触发 `ValueError: participant names must be unique`。改为 `agent_{id后8位}`——内部唯一、用户不可见、零维护成本。
- **Transcript 截断问题：** `[:500]` 硬截断导致辩论内容不完整，但核心链路（创建→发言→评分→返回）已通。记入 Step 46 #22a。

- **Arena 只有 debate 模式：** `run_interview()` 和 `run_pitch()` 未实现（Step 46 补），当前返回 400 不允许调用。
- **Simulations 是独立文件：** plan 中作为 31c 子项，实际创建了独立 `api/simulations.py`。提供 `create_simulation()` 和 `finish_simulation()` 工具函数，供 WorldEngine 在 start/finish 时调用（Step 33 接入）。
- **Relationships 读活跃引擎：** 从 `sse._active_worlds` 取 WorldEngine 实例 → 读 `engine.relationships` dict。World 未运行或已结束时返回空 `{nodes: [], edges: []}`。
- **Events 复用 Step 30 查询模式：** 直接读 SQLite events 表，支持 `tick_from`/`tick_to`/`type` 过滤。

## 接口变更

- 新增 7 个 API 路由（见下方）
- 新增 `ArenaCreateRequest` / `ArenaResultResponse` / `SimulationRecord` 请求/响应体
- 无共享 Pydantic model 变更

## 测试结果

- [x] 后端全量测试 — ✅ 194 passed
- [x] OpenAPI schema 验证 — ✅ 7 条新路由已注册

## 新增路由一览

```
POST   /api/arenas/debate              运行 1v1 辩论
GET    /api/arenas/{id}                获取竞技结果
GET    /api/arenas                     列出竞技历史
GET    /api/worlds/{id}/events         查询历史事件（tick_from/tick_to/type 过滤）
GET    /api/worlds/{id}/relationships  关系网络快照
GET    /api/simulations                列出模拟记录
GET    /api/simulations/{id}           模拟详情
```

## 已知问题

- 无——纯后端 API 层，无前端改动
- Arena 结果存储在内存 dict，Step 35 统一切 SQLite
- Simulations 记录目前无生产方——Step 33 World start 时调用 `create_simulation()` 接入

## 对下一步的提示

- Step 32 需要 SoloTheater 前端切到真实 SSE——依赖本步的 events API 做断线补偿
