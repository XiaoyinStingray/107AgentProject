# Step 06 — Tool 注册体系

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 2.2 |
| Plan 章节 | [development-plan.md](../development-plan.md) §2.2 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/agent_factory/tools.py` | 新建 | 4 个通用 tool stub + 3 个 tool 集合 |
| `backend/src/engines/agent_factory/factory.py` | 修改 | `create_from_description` 和 `create_from_persona` 注入 `DEFAULT_AGENT_TOOLS` |
| `backend/src/engines/agent_factory/__init__.py` | 修改 | 导出 `DEFAULT_AGENT_TOOLS` |
| `backend/tests/test_agent_tools.py` | 新建 | 12 个测试：tool 函数、集合结构、LifeAgent 集成、并发 |

## 决策记录

- **所有 Tool 当前是 stub：** 4 个 tool（send_message, think_aloud, set_goal, observe）返回占位字符串。实际效果由 World Engine（Step 09）拦截 tool call 后应用。这种设计解耦了 tool 定义和 world 状态更新。

- **AutoGen 0.7 直接接受 async function：** 无需 `FunctionTool` 包装。AutoGen 从函数签名（type hints + docstring）自动生成 LLM tool schema。与 Plan 的写法完全一致，无需适配。

- **`DEFAULT_AGENT_TOOLS` 已集成：** Step 05 预留的 `tools` 接口已在本步填充。AgentFactory 现在创建的所有 LifeAgent 都携带 4 个默认 tool。

## 接口变更

| 变更 | 类型 |
|------|------|
| `AgentFactory.create_from_description(desc)` 创建的 LifeAgent 现在携带 `tools=DEFAULT_AGENT_TOOLS` | 行为变更 |
| `DEFAULT_AGENT_TOOLS = [send_message, think_aloud, set_goal, observe]` | 新增常量 |

## 测试结果

- [x] 4 个 tool 函数各返回合法字符串 — ✅
- [x] DEFAULT_AGENT_TOOLS 包含 4 个 callable — ✅
- [x] STUDY_SCENE_TOOLS 包含所有默认 tool — ✅
- [x] LifeAgent 经过 factory 创建后携带 tools — ✅
- [x] 4 个 tool 可并发调用 — ✅

```
48 passed in 0.40s (12 new + 36 existing, 0 regressions)
```

## 已知问题

- Tool 是 stub，实际 world 效果（消息传递、关系更新、事件生成）需等 Step 09（WorldEngine.tick()）实现后才有意义。
- scene-specific tools（study, skip_class 等）尚未实现，`STUDY_SCENE_TOOLS` 目前和 `DEFAULT_AGENT_TOOLS` 内容相同。

## 对下一步的提示

- Step 07 (记忆检索器) 是 Phase 2 的最后一个 Step。完成后 Phase 2 验收标准全部达标。
- Step 07 需要 SQLite + aiosqlite 操作，需要引入 ORM Model 或直接用 raw SQL。
