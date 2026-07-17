# Step 03 — Persona Builder

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 1.1 |
| Plan 章节 | [development-plan.md](../development-plan.md) §1.1 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/llm/client.py` | 新建 | LLM 客户端工厂——从 settings 创建 AutoGen OpenAIChatCompletionClient |
| `backend/src/llm/__init__.py` | 修改 | 导出 `create_model_client` |
| `backend/src/engines/persona/builder.py` | 新建 | PersonaBuilder 核心：自然语言 → PersonaBuildResult |
| `backend/src/engines/persona/__init__.py` | 修改 | 导出 PersonaBuilder、PersonaBuildResult、MOCK_PERSONA_JSON |
| `backend/tests/test_persona_builder.py` | 新建 | 13 个测试：happy path、重试、Markdown fence、边界情况 |

## 决策记录

- **name 字段放在 PersonaBuildResult 而非 Persona：** 现有 `Persona` 模型（Phase 0 产出）没有 `name` 字段。LLM 返回的 name 被提取到 `PersonaBuildResult.name`。下游（Step 05 AgentFactory）可通过 result.name 获取，不破坏 Phase 0 类型。是否需要把 name 加入 Persona 模型留到 Step 05 决定。

- **model_client 类型为 Any：** Plan 要求输入 `ChatCompletionClient`，但为了让测试 Mock 更简单，参数类型设为 `Any`（duck typing）。运行时由 `llm/client.py` 的工厂创建真实 AutoGen 客户端，测试传入 Mock 对象。

- **`llm/client.py` 提前创建：** Plan 把 LLM client 创建放在 Step 03 的隐含范围（PersonaBuilder 需要 client 参数）。按 Step 02 done 的建议，在本步统一创建了 `llm/client.py` 工厂函数。

- **_parse_response 容忍 markdown fences：** LLM 经常把 JSON 包在 ` ```json ``` ` 里返回，`_extract_json()` 会去掉 fences。纯 JSON、带语言标记、不带标记三种情况都覆盖。

## 接口变更

- 新增 `PersonaBuildResult` 类型（非 Pydantic，普通类）：`{ name, persona, background, goals, raw_response }`
- 新增 `PersonaBuilder` 类：`__init__(model_client)` + `async build(description) -> PersonaBuildResult`
- 无 BREAKING 变更。Phase 0 类型未修改。

## 测试结果

- [x] `PersonaBuilder.build("小镇做题家，社交恐惧，想进大厂")` → 返回合法 `PersonaBuildResult` — ✅
- [x] JSON 解析失败时能重试 1 次 — ✅
- [x] Mock LLM 模式下能跑通 — ✅
- [x] Markdown ` ```json ``` ` 包装的 JSON 能正确解析 — ✅
- [x] 空 description → ValueError — ✅
- [x] 两次都失败 → ValueError — ✅
- [x] 最小合法 JSON 不崩溃（使用默认值） — ✅
- [x] `raw_response` 保留 LLM 原始返回 — ✅

```
13 passed in 0.17s
```

## 已知问题

- `Persona` 模型没有 `name` 字段，下游可能需要。（留给 Step 05 决定是否添加）

## 对下一步的提示

- Step 04 是 System Prompt 构建器（`engines/persona/prompt_templates.py`），依赖本步的 `Persona`、`Background`、`Goal` 类型。
- Step 04 是纯函数（Persona + Background + Goals → str），不调 LLM，不需要 model_client。
- `llm/client.py` 已就绪，后续 Phase 需要真 LLM 时直接 `from llm import create_model_client` 即可。
