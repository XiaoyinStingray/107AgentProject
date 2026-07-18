# Step 11 — AutoGen → SSE 翻译

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18 |
| Phase | Phase 4.1 |
| Plan 章节 | [development-plan.md](../development-plan.md) §4.1 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/sse.py` | 新建 | SSE 端点 + World 注册表 |
| `backend/src/engines/world/engine.py` | 修改 | 新增 `tick_stream()` + `_stream_solo_tick()` + `_stream_group_tick()` + `_stream_message_to_event()` |
| `backend/tests/test_sse.py` | 新建 | 9 个测试：注册表、SSE 格式、端点、流式 tick |

## 决策记录

- **流式粒度选择"逐 Agent 发言"：** Plan 建议逐消息流推送，A（逐 tick 批量）和 B（逐 AutoGen 内部消息）之间折中选择了"一次蹦一个思考气泡"——`run_stream()` 按 Agent 轮流发言的自然边界推送。前端看到: Agent A 说话 → 即时弹出 → Agent B 接话 → 即时弹出。

- **`tick_stream()` 与 `tick()` 并行存在：** `tick()` 用于程序化批量推进（测试、batch 模式），`tick_stream()` 用于 SSE 实时推送。两者互不干扰——流式版本只推送 TextMessage（Agent 发言），不做 tool call 拦截和关系分析（留给 tick()）。

- **World 注册表为内存字典：** `_active_worlds: dict[str, WorldEngine]` 是 P0 简化。Phase 5 FastAPI 组装时替换为 DB-backed 或 Redis。

- **SSE 格式遵循标准：** `event: {type}\ndata: {json}\n\n`，前端 `EventSource` 可原生解析。第一条消息为 `connected` 事件用于确认连接。

## 接口变更

```python
# 新增（engines/world/engine.py）
WorldEngine.tick_stream() -> AsyncGenerator[SimEvent, None]

# 新增（api/sse.py）
sse_router: APIRouter                                  # prefix="/api/worlds"
register_world(world_id, engine) / unregister_world / get_world_engine

GET /api/worlds/{world_id}/stream                      # SSE 端点 → StreamingResponse
```

无破坏性变更。

## 测试结果

- [x] World 注册表：注册→获取、404、注销 — ✅
- [x] SSE 格式正确 & 事件序列化 — ✅
- [x] SSE 端点返回 200 + text/event-stream — ✅
- [x] connected 事件正确推送 — ✅
- [x] 缺失 world 返回 404 — ✅
- [x] tick_stream 单人模式产生 tick_boundary — ✅

```
140 passed in 1.40s (9 new + 131 existing, 0 regressions)
```

## 已知问题

- `_stream_group_tick()` 只在有真 LLM + 多 Agent 时才能完整验证。Mock 模式下 GroupChat 需要 multi-agent mock setup（复杂度高，留给集成测试）。
- `_stream_message_to_event` 目前只推送 `TextMessage`——ToolCallRequestEvent 等未处理。后续可在不破坏流式体验的前提下加。

## 对下一步的提示

- Phase 4 只有这一个 Step。下一步进入 Phase 5（FastAPI 服务层），Step 12 开始定义 API 路由。
- `sse_router` 可在 `main.py` 中直接挂载：`app.include_router(sse_router)`。
- `register_world()` 在 World 创建 API（Step 13）中调用，SSE 端点通过 `get_world_engine()` 获取活跃的引擎。
