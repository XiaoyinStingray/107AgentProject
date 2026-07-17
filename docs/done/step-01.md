# Step 01 — Pydantic 类型定义

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-17 |
| Phase | Phase 0.2 |
| Plan 章节 | [development-plan.md](../development-plan.md) §0.2 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/agent.py` | 新建 | BigFive, DecisionStyle, Persona, Background, Goal, EmotionalState, AgentCreate, AgentResponse |
| `backend/src/models/world.py` | 新建 | Scenario, WorldCreate, WorldResponse |
| `backend/src/models/event.py` | 新建 | SimEvent, ThoughtEvent, AgentMessageEvent, AgentActionEvent |
| `backend/src/models/memory.py` | 新建 | MemoryCreate, MemoryResponse |
| `backend/src/models/simulation.py` | 新建 | SimulationResponse |
| `backend/src/models/__init__.py` | 重写 | 导出所有模型 |

## 决策记录

- **SSE 事件子类：** Plan 只定义了 `SimEvent`，实际 add 了 `ThoughtEvent`, `AgentMessageEvent`, `AgentActionEvent` 三个子类。Phase 4（SSE 桥接）需要区分不同类型——子类比 `type` 字符串更类型安全。
- **Field descriptions：** 所有字段加了中文 `description`，方便自动生成 API 文档和 AI 理解数据模型。
- **`model_json_schema` 验证：** 确认所有模型都能生成 JSON Schema（FastAPI 生成 OpenAPI 文档时用到）。

## 接口变更

无。这是首批类型定义，没有前置依赖。

## 测试结果

- [x] 默认构造 `Persona()` 生效 — ✅
- [x] 完整构造 + 嵌套模型 — ✅
- [x] `AgentCreate.description` min_length 校验 — ✅
- [x] `AgentResponse` 组装 — ✅
- [x] `model_dump()` 序列化 — ✅
- [x] 事件类型（SimEvent/ThoughtEvent/ActionEvent）— ✅
- [x] Memory + Simulation 模型 — ✅
- [x] `model_json_schema()` 生成 — ✅

## 已知问题

无。

## 对下一步的提示

- Step 02 需要创建 `backend/src/config.py` + `backend/src/db.py` + `frontend/src/types/*.ts`。
- 前端 TS 类型严格对应这里的 Pydantic 模型，字段顺序和命名保持 1:1。
