# Step 09 — Tick 调度器

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 3.2 |
| Plan 章节 | [development-plan.md](../development-plan.md) §3.2 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/event.py` | 修改 | 新增 `Event` ORM 模型 + `from_sim_event`/`to_response` + JSON 序列化辅助 |
| `backend/src/db.py` | 修改 | `init_db()` 中注册 `models.event`（建 events 表） |
| `backend/src/engines/world/engine.py` | 新建 | WorldEngine：tick/run/solo/group/context/persist/inject |
| `backend/src/engines/world/__init__.py` | 修改 | 新增 `WorldEngine` 导出 |
| `backend/tests/test_world_engine.py` | 新建 | 18 个测试：初始化、世界上下文、事件转换、持久化、tick、run、stub |

## 决策记录

- **Event ORM 串行化：** `target_agent_ids: list[str]` 和 `data: dict` 以 JSON 字符串存入 SQLite（无原生数组/字典类型）。`from_sim_event()` 序列化，`to_response()` 反序列化，带 `try/except` 容错。

- **Solo tick 策略：** 单个 Agent 时用 `on_messages(TextMessage(...))` 驱动 Agent "自言自语"，而非创建单参与者 GroupChat（节省不必要的 Team 开销）。AutoGen 0.7 要求传入 `CancellationToken()`。

- **Group tick 策略：** `RoundRobinGroupChat(participants, max_turns=N*3)` 驱动多 Agent 轮流发言。`team.run(task=...)` 返回 `TaskResult`，通过 `result.messages` 提取各 Agent 消息。

- **`_apply_action` 和 `_update_relationships` 为 stub：** 仅记录日志，完整实现留给 Step 10（关系演化）。计划中的 tick() 流程（注入→交互→应用→关系→持久化）已完整实现骨架。

- **AutoGen 0.7 API 适配（3 处新增偏离 Plan）：**

  | 问题 | Plan 假设 | AutoGen 0.7 实际 |
  |------|-----------|------------------|
  | Solo tick 调用 | `assistant.send_message(...)` | `agent.on_messages([TextMessage(...)], cancellation_token=CancellationToken())` |
  | LLM 响应类型 | `.content` str | `CreateResult(finish_reason, content, usage, cached)` |
  | Team 返回 | 消息流 | `TaskResult` 含 `.messages` 和 `.stop_reason` |

- **Mock LLM 客户端演进：** Step 09 的 `MockModelClient` 需要返回 AutoGen 的 `CreateResult` 对象（含 `RequestUsage`），而非简单字符串。这是 AutoGen 0.7 对 mock 客户端的要求提升。

## 接口变更

```python
# 新增
class WorldEngine:
    def __init__(self, world: WorldResponse, agents: list[LifeAgent], db_session: AsyncSession)
    async def tick() -> list[SimEvent]
    async def run(max_ticks=30) -> list[SimEvent]
    def inject_event(description: str)

# ORM 新增
class Event(Base):  # __tablename__ = "events"
    @classmethod def from_sim_event(event: SimEvent) -> Event
    def to_response() -> SimEvent
```

无破坏性变更。Step 08 的 `engines/world/__init__.py` 新增了一个导出项。

## 测试结果

- [x] WorldEngine 初始化（world + agents）— ✅
- [x] `_build_world_context` 含位置/天气/tick/agent 列表/最近事件 — ✅
- [x] 事件转换 + 错误事件生成 — ✅
- [x] `inject_event` 注入世界事件 — ✅
- [x] `_persist_events` 写入 SQLite + 空列表 noop — ✅
- [x] Solo tick 返回事件流 + 异常不穿透 — ✅
- [x] `tick()` 集成：计数器递增 + 事件追加 — ✅
- [x] `run()` 尊重 max_ticks + pause 中断 — ✅
- [x] Stub 方法不抛异常 — ✅

```
108 passed in 0.97s (18 new + 90 existing, 0 regressions)
```

## 已知问题

- **Solo tick 事件类型：** Mock 模式下 Agent 返回的 `inner_messages` 可能是空列表（取决于 AutoGen 内部行为），此时 `_extract_events_from_response` 返回空列表。真 LLM 联调时需要验证能否正确提取 `thought_stream` 事件。
- **Group tick 未在测试中验证：** 需要真 LLM（DeepSeek 已配置）或复杂的 multi-agent mock。结构已就绪，真 API 联调时可直接使用。
- **`_apply_action` stub：** 在真 LLM 调用时，Agent 会调用 `send_message`/`think_aloud` 等 tool，但 WorldEngine 目前不处理这些 tool call 的实际效果。Step 10 补全。

## 对下一步的提示

- Step 10（关系演化）需要补全 `_apply_action()` 和 `_update_relationships()` 两个 stub。
- `Event` ORM 已在 events 表就绪，Step 10 的关系变更事件直接通过 `Event.from_sim_event()` 持久化。
- Group tick 的 `result.messages` 包含 `ToolCallMessage`——Step 10 解析这些消息来驱动关系更新。
