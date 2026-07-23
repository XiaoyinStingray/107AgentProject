# Step 35 — 持久化 + 鲁棒性

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-23 |
| Phase | Phase 10.7 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 35 |
| 状态 | ✅ done |

## 产出

### 35a. Agent/World SQLite 持久化

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/agent_orm.py` | **新建** | `AgentRow` ORM 模型 — agents 表（persona/background/goals/emotional_state JSON 序列化存储） |
| `backend/src/models/world_orm.py` | **新建** | `WorldRow` ORM 模型 — worlds 表（scenario/agent_ids JSON 序列化 + status/tick 状态） |
| `backend/src/db.py` | 重写 | 延迟引擎初始化（`_get_engine()` / `_get_session_factory()`）；`_LazySession` 代理；`reset_db_state()` 测试辅助；`init_db()` 注册 4 个 ORM 表 |
| `backend/src/api/agents.py` | 重写 | 移除 `AgentStore` 内存 dict；全部路由改为 `AsyncSession` CRUD（`select(AgentRow)` / `db.add()` / `db.commit()`）；`_rebuild_agent_from_row()` 从 DB 行重建 LifeAgent |
| `backend/src/api/worlds.py` | 重写 | 移除 `WorldStore` 内存 dict；CRUD 全部走 SQLite；`_rebuild_agents_from_db()` 按 agent_ids 从 DB 加载；`_sync_world_to_db()` 状态变更回写；`_build_world_engine()` 从 DB 构建 WorldEngine |
| `backend/src/api/export.py` | 迁移 | 移除 `WorldStore`/`AgentStore` 引用；`_collect_agent_names()` 改为从 `AgentRow` SQLite 查询；`export_report_markdown/json` 从 `WorldRow` 读取 World 元数据 |
| `backend/src/api/arenas.py` | 迁移 | 移除 `AgentStore` 引用；`_load_agent()` 从 `AgentRow` SQLite 查询 + `_rebuild_agent_from_row()` 重建；debate/interview/pitch 三个端点均走 SQLite |
| `backend/src/api/narratives.py` | 迁移 | 移除 `AgentStore`/`WorldStore` 引用；`_generate_narrative()` 从 `AgentRow` 取 persona、从 `Event` ORM 取世界事件 |

### 35b. LLM 鲁棒性

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/llm/fallback.py` | **新建** | `call_with_fallback()` 异步包装器 — `asyncio.wait_for()` 超时 + `Exception` 捕获；返回 `FallbackResult(content=DEFAULT_ACTION_TEXT)`；`settings.agent_timeout_seconds` 配置超时 |
| `backend/src/engines/world/streaming.py` | 修改 | `_stream_solo_tick()` 已有 `asyncio.wait_for` + `TimeoutError` 捕获；`_stream_group_tick()` 有 `Exception` 捕获 + `stream.aclose()` 清理；Mixin 类型声明补全（`world: Any` 等 stub 属性）解决 Pyright 报错 |

### 35c. 测试适配

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_agents_api.py` | 重写 | 适配 SQLite CRUD：使用 `init_db()` + `reset_db_state()` fixture；测试 CRUD 全链路（create/list/get/delete） |
| `backend/tests/test_worlds_api.py` | 重写 | 适配 SQLite CRUD：测试 create/list/get/start/pause/delete 全链路 |
| `backend/tests/test_export.py` | 重写 | 适配 SQLite 数据源：先创建 Agent + World 到 DB，再测试 Markdown/JSON 导出 |

## 决策记录

- **延迟引擎初始化：** `db.py` 使用 `_get_engine()` / `_get_session_factory()` 延迟创建 SQLAlchemy 引擎和会话工厂，避免 import 时绑定 event loop（pytest-asyncio 要求）。`_LazySession` 代理保证 `async_session()` 在测试覆盖 `settings.database_url` 后仍能获取最新 factory。
- **JSON 序列化存储：** Agent 的 persona/background/goals/emotional_state 和 World 的 scenario/agent_ids 以 JSON 字符串存入 SQLite 列（`String` 类型），通过 `json.dumps/loads` 转换。避免了 SQLite 对复杂嵌套 JSON 的限制，同时保持 ORM 简单性。
- **Agent 重建策略：** `_rebuild_agent_from_row()` 从 DB 行反序列化 persona → `AgentFactory.create_from_persona()` 重建 LifeAgent（不调用 LLM），再恢复 emotional_state/energy/created_at/updated_at。这保证了重启后 Agent 可完整恢复。
- **World 状态同步：** `_sync_world_to_db()` 在 start/pause/reset 等控制操作后回写 status/tick/scenario 到 SQLite。运行时 WorldEngine 仍持有内存中的 WorldResponse 实例（性能考虑），关键状态变更才同步回 DB。
- **`reset_db_state()` 测试辅助：** 每个测试文件在 fixture 中调用 `reset_db_state()` 重置全局引擎/工厂变量，确保测试间隔离（不同测试可能使用不同的临时 DB 路径）。
- **Mixin 类型声明：** `WorldStreamingMixin` 添加 `world: Any` 等 host-class 属性 stub，解决 Pyright 对 Mixin 模式的类型检查报错。运行时这些属性由 WorldEngine 多继承提供。

## 接口与兼容性

- **BREAKING：移除 `AgentStore` / `WorldStore`：** 所有引用这两个类的代码（arenas.py、narratives.py、export.py）已迁移到 SQLite CRUD。`from api.agents import AgentStore` 等旧导入将失败。
- **新增 ORM 表：** `agents` 和 `worlds` 表在 `init_db()` 时自动创建（`Base.metadata.create_all`）。首次启动会从空表开始，不影响已有的 `events` 和 `memories` 表。
- **`_rebuild_agent_from_row()` 公开为模块级函数：** arenas.py 和 narratives.py 通过 `from api.agents import _rebuild_agent_from_row` 复用 Agent 重建逻辑，避免重复代码。
- **`call_with_fallback` 暂未集成到 streaming.py：** `streaming.py` 的 `_stream_solo_tick` 已有独立的 `asyncio.wait_for` + 异常捕获逻辑（Step 33 实现），与 `call_with_fallback` 功能重叠。`fallback.py` 作为通用工具库供后续 Step 47（LLM 优化）统一集成。

## 测试结果

- [x] 后端全量测试 — ✅ 214 passed

## 验收记录

- [x] Agent SQLite 持久化（创建→重启→仍在列表）— ✅ `AgentRow` + `init_db()` + CRUD 路由
- [x] World SQLite 持久化（创建→重启→仍可查询）— ✅ `WorldRow` + `_sync_world_to_db()`
- [x] `lifelab.db` 存在 agents/worlds 表 — ✅ `init_db()` 注册 4 个 ORM
- [x] GET/DELETE agents 从 SQLite 读写 — ✅ `select(AgentRow)` / `delete(AgentRow)`
- [x] GET/DELETE worlds 从 SQLite 读写 — ✅ 同上
- [x] `fallback.py` 存在 `call_with_fallback` — ✅ 超时 + 异常双兜底
- [x] streaming.py Mixin 类型修复 — ✅ Pyright stub 属性
- [x] `db.py` 延迟初始化 — ✅ `_get_engine()` + `_LazySession`
- [x] 无 `AgentStore`/`WorldStore` 残留引用 — ✅ grep 确认零匹配
- [x] 214 测试全部通过 — ✅

## 已知问题

- **BUG-006：** M4/M5/M6 前端页面仍使用 Mock 数据，新创建 Agent 不出现在竞技场/叙事工厂/控制台列表中。根因是这些页面尚未完成 Step 36（API 层收敛），Agent 列表从 Mock/本地 Store 获取而非 `useAgents()` hook。

## 对下一步的提示

- Step 36（API 层收敛）应统一前端 Agent 数据源为 `useAgents()` hook，消除 M4/M5/M6 的 Mock 数据依赖。
- 同时可抽取前端共享组件（Agent 选择器等）和常量，减少页面间重复代码。
- `call_with_fallback` 可在 Step 47（LLM 优化）中统一集成到 streaming.py 替换现有的 `asyncio.wait_for` 逻辑。
