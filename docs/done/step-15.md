# Step 15 — 叙事引擎

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-18 |
| Phase | Phase 6.1 |
| Plan 章节 | [development-plan.md](../development-plan.md) §6.1 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/narrative/engine.py` | 新建 | NarrativeEngine + NarrativeStyle + NarrativeRequest/Response |
| `backend/src/engines/narrative/templates.py` | 新建 | 4 种叙事风格的 prompt 模板 |
| `backend/src/engines/narrative/__init__.py` | 修改 | 导出引擎和类型 |
| `backend/tests/test_narrative_engine.py` | 新建 | 9 个测试：4 种风格 + 边界情况 + 事件格式化 |

## 决策记录

- **Prompt 模板内置：** 和 PersonaBuilder 同模式——模板字符串内嵌在代码中，不引入 Jinja2。

- **标题解析用简单规则：** `_parse_narrative()` 识别"标题：xxx"、"标题: xxx"、"## xxx" 三种格式。LLM 不返回标题时用首 30 字自动生成。

- **事件格式化：** `_format_events()` 按 tick 编号 + 描述逐行排列，生成可读时间线文本，注入 prompt 的 `{events}` 占位符。

- **NarrativeStyle 用 StrEnum：** 方便 JSON 序列化（前端直接消费），避免字符串拼写错误。

- **mock 用 plain dict messages：** 和 PersonaBuilder 不同，`NarrativeEngine._build_prompt` 只构建一个 user message（不区分 system/user），因为 prompt 模板本身已包含角色指令。

## 接口变更

```python
# 新增类型
class NarrativeStyle(StrEnum): STORY | DIARY | LETTER | PODCAST
class NarrativeRequest(style, agent_id, events, persona, target?)
class NarrativeResponse(title, content, style, agent_id, generated_at)

# 新增引擎
class NarrativeEngine:
    def __init__(self, model_client)
    async def generate(req: NarrativeRequest) -> NarrativeResponse
```

无破坏性变更。

## 测试结果

- [x] STORY 风格生成 + 标题解析 — ✅
- [x] DIARY 风格生成 — ✅
- [x] LETTER 风格生成 + target 填充 — ✅
- [x] PODCAST 风格生成 — ✅
- [x] 空事件列表 — ✅
- [x] persona.narrative 为空时回退 name — ✅
- [x] LLM 不返回标题时自动生成 — ✅
- [x] `_format_events` 时间线格式 — ✅

```
168 passed in 1.87s (9 new + 159 existing, 0 regressions)
```

## 对下一步的提示

- Phase 6 只有这一个 Step。API 端点（POST /api/narratives/*）在主 plan §5.1 路由表中列出，但尚未实现。
- 叙事引擎的结构和 PersonaBuilder 一致——可以复用相同的 model_client 注入模式。
