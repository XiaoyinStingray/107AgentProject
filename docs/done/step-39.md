# Step 39 — Agent Remix + 模板库 (#6, #7)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-24 |
| Phase | Phase 12.1 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 39 |
| 状态 | ✅ done |

## 产出

### 后端：Remix 与只读模板库

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/remix.py` | **新建** | Remix 请求、约束、预览草稿、差异和响应模型 |
| `backend/src/models/agent_template.py` | **新建** | 只读模板的 Pydantic 模型 |
| `backend/src/engines/persona/remixer.py` | **新建** | LLM Remix、格式重试、保留字段和目标 trait 强制校验 |
| `backend/src/engines/persona/template_library.py` | **新建** | 加载并缓存静态模板 JSON |
| `backend/src/engines/persona/data/agent_templates.json` | **新建** | 6 类、36 个 Agent 描述种子模板 |
| `backend/src/api/templates.py` | **新建** | `GET /api/templates` |
| `backend/src/api/agents.py` | 修改 | 新增 Remix 端点，并复用 Agent 数量上限检查 |
| `backend/src/main.py` | 修改 | 注册模板路由 |
| `backend/tests/test_persona_remixer.py` | **新建** | Remix 单元测试：成功、重试、约束、异常与边界 |
| `backend/tests/test_agent_templates.py` | **新建** | 模板数量、分类、唯一性与 API 返回测试 |
| `backend/tests/test_agent_remix_api.py` | **新建** | 真 SQLite + Mock LLM 集成测试 |

### 前端：M1 内部分流、Remix UI 与模板浏览器

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/remix.ts` | **新建** | 与 Remix Pydantic 模型对齐的 TS 类型 |
| `frontend/src/types/agentTemplate.ts` | **新建** | 模板 TS 类型 |
| `frontend/src/api/mockMode.ts` | **新建** | 集中读取 `VITE_MOCK_API` |
| `frontend/src/api/templates.ts` | **新建** | 模板查询 Hook |
| `frontend/src/api/agents.ts` | 修改 | 增加 Remix mutation，并让 Agent API 支持显式 Mock 模式 |
| `frontend/src/api/queryKeys.ts` | 修改 | 增加模板 query key |
| `frontend/src/mocks/agentApi.ts` | **新建** | 可独立运行的 Agent 创建、删除与 Remix Mock |
| `frontend/src/mocks/agentTemplates.ts` | **新建** | 与真实模板结构一致的 Mock 模板 |
| `frontend/src/pages/AgentModule.tsx` | **新建** | M1 hash 分流及模板描述的一次性预填 |
| `frontend/src/pages/agent-foundry/RemixControls.tsx` | **新建** | 修改指令、trait slider 与保留字段控件 |
| `frontend/src/pages/agent-foundry/RemixPreview.tsx` | **新建** | 预览差异与确认创建 |
| `frontend/src/pages/agent-foundry/RemixPanel.tsx` | **新建** | Remix 状态和 API 交互容器 |
| `frontend/src/pages/agent-foundry/TemplateBrowser.tsx` | **新建** | 分类筛选、“编辑后创建”和“直接创建” |
| `frontend/src/pages/agent-foundry/remixOptions.ts` | **新建** | Remix 控件选项常量 |
| `frontend/src/pages/AgentFoundry.tsx` | 修改 | 增加可选 `initialDescription`，复用原自然语言创建链路 |
| `frontend/src/App.tsx` | 修改 | Agent 模块懒加载入口切换为 `AgentModule` |
| `frontend/.env.example` | **新建** | 标明 `VITE_MOCK_API=false`，未增加 npm 依赖 |
| `frontend/src/mocks/agentApi.test.ts` | **新建** | Agent Mock API 测试 |
| `frontend/src/pages/AgentFoundry.test.tsx` | **新建** | 模板描述预填测试 |
| `frontend/src/pages/AgentModule.test.tsx` | **新建** | hash 分流和路由状态清理测试 |
| `frontend/src/pages/agent-foundry/RemixPanel.test.tsx` | **新建** | Remix 预览、创建、校验和错误反馈测试 |
| `frontend/src/pages/agent-foundry/TemplateBrowser.test.tsx` | **新建** | 分类、编辑后创建和直接创建测试 |
| `frontend/src/pages/Arena.test.tsx` | 修改 | 测试 Mock 适配，避免新增 Agent Hook 影响既有用例 |

## 决策记录

- **Remix 采用 preview → create 两阶段：** preview 调用 LLM 生成草稿；create 持久化用户确认的同一份草稿，不重复调用 LLM。
- **关键约束由代码保证：** 用户要求保留的字段会从源 Agent 恢复，slider 目标值会精确覆盖 LLM 输出；新 Agent 使用新 UUID，源 Agent 不被修改。
- **模板存放在后端静态 JSON：** 36 个模板是只读描述种子，不把完整 Persona 硬编码进数据库或代码。
- **模板保留两条创建路径：** “编辑后创建”把描述预填到现有铸造厂供用户修改；“直接创建”保留原计划的一键体验。该补充已同步到 State 2 plan。
- **局部拆分而非执行 38-S：** Step 39 新功能放入 `agent-foundry/` 子组件；未对已有大文件做高风险重构。`builder.py` 未修改；`AgentFoundry.tsx` 仅增加预填 prop。
- **Mock 由环境变量显式开启：** `VITE_MOCK_API=true` 时无需后端即可浏览和交互；没有新增前端包，也没有修改 lockfile。

## 接口变更

- 新增 `POST /api/agents/{agent_id}/remix`：
  - `action="preview"` + `spec` → 返回未持久化的 `draft`、`changes` 和 `summary`
  - `action="create"` + 原 preview `draft` → 返回新建的 `AgentResponse`
- 新增 `GET /api/templates` → `AgentTemplate[]`。
- 新增 Remix/模板 Pydantic 与 TS 类型；**未修改 Phase 0 的 `AgentResponse`、`Persona`、`Background`、`Goal` 或数据库表结构**。
- ⚠️ **BREAKING（流程回溯标记，不是 API 兼容性破坏）：** 扩展了已完成步骤产出的 Agent API、应用路由、M1 前端入口和 `AgentFoundry`。现有 URL、共享类型及默认自然语言创建行为保持兼容；受影响的后端、前端测试均已重跑。

## 测试结果

- [x] Layer 1：Remixer、模板库、Mock API 与组件关键交互测试 — ✅
- [x] Layer 2：真 SQLite + Mock LLM 的 Remix preview/create 集成测试 — ✅
- [x] Step 39 后端定向测试：11 passed — ✅
- [x] 后端全量测试：226 passed，1 个既有 Starlette/httpx warning — ✅
- [x] Ruff：零错误 — ✅
- [x] 前端全量测试：18 个测试文件、220 tests passed — ✅
- [x] 真实 API 生产构建：通过 — ✅
- [x] `VITE_MOCK_API=true` 独立生产构建：通过 — ✅
- [x] OpenAPI：两个新增端点及 `RemixRequest` schema 可见 — ✅
- [x] CHECK-2：用户完成 Remix、模板两种创建路径及预填编辑的手动验收 — ✅

## 组件树

```text
AgentModule
├── AgentFoundry (#item-1)
│   └── initialDescription（模板描述可编辑预填）
├── RemixPanel (#item-6)
│   ├── RemixControls
│   └── RemixPreview
└── TemplateBrowser (#item-7)
    ├── 编辑后创建 → AgentFoundry
    └── 直接创建 → useCreateAgent
```

## 视觉走查

- [x] 暗色主题与现有 M1 页面一致 — ✅
- [x] 分类筛选、loading、错误和成功反馈正常 — ✅
- [x] “编辑后创建”正确预填且不会自动创建 — ✅
- [x] “直接创建”路径保持可用 — ✅
- [x] Mock 模式可独立浏览 — ✅
- [x] 用户手动验收 — ✅

## 已知问题

- `AgentFoundry.tsx` 为 Step 38-S 已知的大文件（当前 346 行）。本步仅做经确认的最小 prop 扩展；未扩大为高风险重构。
- 后端全量测试仍有 1 个既有 Starlette/httpx 弃用 warning，不影响 Step 39。

## 对下一步的提示

- Step 40 可以按计划独立开发；Step 39 没有修改目标/计划相关共享类型。
- 使用真实 API 时保持 `VITE_MOCK_API=false`；只做前端独立演示时可设为 `true`。
- 后续若模板需要运营编辑或用户自定义，再单独设计数据库写入和权限；本步模板保持只读。
