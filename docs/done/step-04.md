# Step 04 — System Prompt 构建器

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 1.2 |
| Plan 章节 | [development-plan.md](../development-plan.md) §1.2 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/persona/prompt_templates.py` | 新建 | `build_system_message()` 纯函数 + 辅助函数 |
| `backend/src/engines/persona/__init__.py` | 修改 | 新增 `build_system_message` 导出 |
| `backend/tests/test_prompt_templates.py` | 新建 | 13 个测试：happy path、纯函数、排序、边界 |

## 决策记录

- **Big Five 解释文本而非原始数字：** Plan 原本只显示 0-1 分数。实际实现将每个维度翻译为自然语言描述（如"高度自律，做事有计划有条理"），对 LLM 更有指导意义，也帮助达到 800-1500 字符的目标长度。

- **"行为准则"段追加到身份段末尾：** 在"你是谁"段末尾添加了两句行为指引——"请你在所有互动中严格遵循以上人格设定"和"你不是 AI——你是一个真实的人"。这是为了让 LLM 更好地进入角色。Plan 的 6 段结构未变，只是丰富了每段内容。

- **Prompt 输出超过 800 字符的策略：** 原版简洁输出只有 ~530 字符。通过以下方式自然扩展到 800+：(a) Big Five 每维度附加自然语言解释 (b) 决策风格每项加一句话行为含义 (c) 身份段加行为准则 (d) 背景故事用完整句型呈现而非短语拼接。

## 接口变更

- 新增 `build_system_message(persona, background, goals, recent_memories?, world_context?) -> str`
- 纯函数，无副作用，同输入永远返回同输出
- 无 BREAKING 变更。Phase 0 类型未修改。

## 测试结果

- [x] `build_system_message(persona, bg, goals)` → 800-1500 字符 — ✅
- [x] 同一 Persona 每次返回相同字符串（纯函数） — ✅
- [x] 包含世界上下文时，上下文在末尾 — ✅
- [x] 记忆按 importance 降序排列，取 top-5 — ✅
- [x] 目标按 priority 升序排列 — ✅
- [x] 空 values/goals/memories 不崩溃 — ✅
- [x] 最小 Persona 不崩溃 — ✅
- [x] 背景字段正确出现在身份段 — ✅

```
26 passed (13 builder + 13 prompt_templates), 0.17s
```

## 已知问题

无。

## 对下一步的提示

- **Phase 1 (人格引擎) 完成。** Step 05 开始 Phase 2：Agent 工厂（`engines/agent_factory/`）。
- Step 05 会用到本步的 `build_system_message` + Step 03 的 `PersonaBuilder`，组成完整流水线：自然语言 → PersonaBuildResult → system_message → LifeAgent。
- Step 05 需要 AutoGen `AssistantAgent`，需要真实安装 `autogen-agentchat` 和 `autogen-ext[openai]`。
