# Step 05 — LifeAgent 封装

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 2.1 |
| Plan 章节 | [development-plan.md](../development-plan.md) §2.1 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/agent.py` | 修改 | Persona 新增 `name: str = ""` 字段 |
| `backend/src/engines/agent_factory/factory.py` | 新建 | LifeAgent + AgentFactory |
| `backend/src/engines/agent_factory/__init__.py` | 修改 | 导出 LifeAgent、AgentFactory |
| `backend/src/engines/persona/builder.py` | 修改 | `_parse_response` 将 name 写入 `Persona(name=name, ...)` |
| `backend/tests/test_agent_factory.py` | 新建 | 11 个测试：create_from_description、create_from_persona、inject_context 等 |

## 决策记录

- **Persona 新增 `name` 字段：** 讨论后选择方案 A——给 Persona 加 `name: str = ""`。这是加法（有默认值，已有数据不受影响），消除了下游 `hasattr(persona, 'name')` 的 hack。Plan 的 AgentFactory 本来就用 `persona.name`，现在类型安全了。

- **AutoGen 0.7 API 适配（3 处偏离 Plan）：**

  | Plan 假设 | AutoGen 0.7 实际 | 说明 |
  |-----------|------------------|------|
  | `max_consecutive_auto_reply=3` | `max_tool_iterations=3` | 参数重命名，语义等价 |
  | `agent.system_message = ...` | `agent._system_messages = [SystemMessage(...)]` | 从字符串属性变为 Pydantic 对象列表 |
  | `ag.name = persona.name` | `_sanitize_agent_name(persona.name)` | Agent name 必须是 Python 合法标识符，中文名 OK，但 UUID 中的 `-` 需去掉 |

- **tools 预留接口：** AgentFactory 和 LifeAgent 接受 `tools: list | None = None`，默认传空列表。Step 06 (Tool 注册体系) 完成后，只需修改 `create_from_description` 和 `create_from_persona` 中传 `DEFAULT_AGENT_TOOLS`。

- **_sanitize_agent_name：** 新增辅助函数，处理 agent name 的 Python 标识符约束。去掉连字符、替换特殊字符、确保不以数字开头。

## 接口变更

| 变更 | 类型 | 影响 |
|------|------|------|
| `Persona` + `name` 字段 | ✅ 加法 | 下游 Step 03 (builder) 已同步更新；Step 04 (prompt_templates) 无需改动 |
| `max_consecutive_auto_reply` → `max_tool_iterations` | ⚠️ 参数名变更 | 仅 internal，不暴露给 API |
| `system_message` → `_system_messages` | ⚠️ 内部 API | 仅 LifeAgent.inject_context 访问，已适配 |

## 测试结果

- [x] `create_from_description("内向的程序员")` → LifeAgent — ✅
- [x] LifeAgent 封装了 AutoGen AssistantAgent — ✅
- [x] `persona.name` 与 `PersonaBuildResult.name` 一致 — ✅
- [x] `create_from_persona(agent_id, persona, bg, goals)` → LifeAgent — ✅
- [x] persona.name 为空时用 agent_id 作 fallback — ✅
- [x] `inject_context` 刷新 system prompt — ✅
- [x] `inject_context` 支持记忆注入 — ✅
- [x] 初始情绪状态为 neutral — ✅
- [x] 初始能量为 100 — ✅
- [x] `to_response()` 包含全部字段 — ✅

```
37 passed in 0.42s
```

## 已知问题

- `_system_messages` 是 AutoGen 内部属性（`_` 前缀），未来版本可能变化。如果 AutoGen 提供公开的 system prompt 更新 API 后应迁移。
- LifeAgent 目前不持久化到 SQLite（ORM 模型留给后续 Phase 定义）。

## 对下一步的提示

- **Phase 2 还有 2 个 Step：** Step 06 (Tool 注册体系) 和 Step 07 (记忆检索器)。Phase 2 的验收标准需要 3 个 Step 全部完成后才能满足。
- Step 06 依赖本步的 `LifeAgent.__init__(tools=...)` 预留接口。完成后需回来更新 factory 中的 `DEFAULT_AGENT_TOOLS` 引用。
- AutoGen `AssistantAgent` 的 `system_message` 现在是 `_system_messages: list[SystemMessage]`，后续所有修改系统提示的代码都需要注意这一点。
