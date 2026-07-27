# Step T2 — Phase 14 Bug 修补

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-27 |
| Phase | Phase 14（测试线） |
| Plan 章节 | [plan-state3.md](../plan-state3.md) §Step T2 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/bugs.md` | 修改 | 更新 BUG-001、003、005、019、022 的状态、根因、修复和验证记录 |
| `frontend/src/App.tsx` | 修改 | 启用 React Router v7 future flags，消除控制台兼容性警告 |
| `frontend/src/App.test.tsx` | 新建 | 覆盖应用路由 future flags 的回归测试 |
| `frontend/src/components/layout/feature-route-boundary.test.tsx` | 修改 | 测试路由同步启用 future flags |
| `frontend/src/components/archive/archive-components.test.tsx` | 修改 | 同步路由配置，并断言成就统计真实数值 |
| `frontend/src/pages/AgentModule.test.tsx` | 修改 | 测试路由同步启用 future flags |
| `frontend/src/pages/Arena.test.tsx` | 修改 | 测试路由同步启用 future flags |
| `frontend/src/pages/GroupSandbox.test.tsx` | 修改 | 测试路由同步启用 future flags |
| `frontend/src/pages/agent-foundry/TemplateBrowser.test.tsx` | 修改 | 测试路由同步启用 future flags |
| `frontend/src/api/achievements.ts` | 修改 | 将后端 snake_case 成就统计映射为现有前端 camelCase 类型 |
| `frontend/src/api/achievements.test.ts` | 新建 | 覆盖成就 API 字段映射 |
| `frontend/src/api/client.ts` | 修改 | 解析结构化 API 错误，并为后端不可达提供明确错误码和提示 |
| `frontend/src/api/client.test.ts` | 新建 | 覆盖结构化错误、旧版 detail 和网络失败 |
| `backend/src/llm/errors.py` | 新建 | 统一分类 OpenAI 兼容客户端的认证、限流、超时和连接错误 |
| `backend/src/main.py` | 修改 | 注册 LLM 错误处理中间件 |
| `backend/tests/test_llm_errors.py` | 新建 | 覆盖 LLM 异常分类和中间件响应 |
| `backend/tests/test_agents_api.py` | 修改 | 增加无效 DeepSeek API Key 的 API 集成回归测试 |
| `backend/src/engines/world/state.py` | 修改 | 注入事件保留事件类型、目标 Agent 和描述，并返回待持久化事件 |
| `backend/src/api/worlds.py` | 修改 | 校验干预请求、传递类型/目标，并将注入事件持久化用于重连回放 |
| `backend/tests/test_world_engine.py` | 修改 | 覆盖注入事件类型、目标、顺序和去重 |
| `backend/tests/test_worlds_api.py` | 修改 | 覆盖干预校验、事件持久化和 REST 回放 |
| `backend/src/engines/team/engine.py` | 修改 | 修复 Team tick 中异步进度检查未 await 及消息类型标注错误 |
| `backend/src/api/teams.py` | 修改 | 按真实步骤计算完成度，并兼容尚未生成 report 的计划 |
| `backend/tests/test_team_engine.py` | 新建 | 覆盖 TeamEngine tick 的异步进度检查 |
| `backend/tests/test_teams_api.py` | 修改 | 覆盖 Team 评估进度、空 report 和 Mock LLM 隔离 |

## 决策记录

- **BUG-003 采用最小闭环修复：** 保证导演干预的类型、目标、描述、SSE 顺序及持久化回放正确，不在 T2 中扩展四种干预类型的复杂行为语义。
- **BUG-005 使用模拟异常验证：** 通过 OpenAI 兼容客户端的异常类型测试 DeepSeek Key 无效场景，不修改本地 `.env`，也不消耗真实 API。
- **BUG-019 标记 `wontfix`：** `/narratives#item-29` 表示 M5 默认的“小说化叙事”子功能，页面、顶层导航和深链接均正常，移除 hash 没有功能收益。
- **成就统计在前端边界归一化：** 保持后端 snake_case 响应和既有前端 camelCase 类型不变，在 API 层完成映射，避免扩大共享类型修改范围。
- **按“修复一个、测试一个”推进：** 每项修复先执行针对性回归，再执行后端、前端和生产构建全量回归。

## 接口变更

- 未修改 Phase 0 定义的共享 Pydantic/TypeScript 类型。
- `WorldEngine.inject_event()` 增加可选 `event_type`、`target_agent_ids` 参数并返回 `SimEvent`；原单参数调用仍兼容。
- 前端 `ApiError` 增加可选 `code` 字段；旧版 FastAPI `detail` 错误响应仍兼容。
- LLM 错误新增稳定响应结构：`error` + `message`，认证失败返回 HTTP 401。
- ⚠️ **BREAKING（回溯修改记录）：** 本步修正了已完成步骤 14、16、33、36、44、45、51–55 的产出文件。这里的 `BREAKING` 表示按 STEP.md 对向后修改进行审计，不表示对外 API 已发生不兼容变更；相关模块均已执行全量回归。

## 测试结果

- [x] BUG-001：React Router future warning 消失，应用及测试路由回归通过
- [x] BUG-003：注入事件类型、目标、待发送顺序、无重复、数据库持久化和重连回放通过
- [x] BUG-005：认证、限流、超时、连接异常分类及 Agent API 集成回归通过
- [x] BUG-019：确认 `/narratives#item-29` 功能正常并记录 `wontfix` 原因
- [x] BUG-022：成就统计字段映射及 UI 数值渲染通过
- [x] Phase 14：TeamEngine await、评估完成度和空 report 回归通过
- [x] 后端全量测试：`316 passed, 1 warning`
- [x] 前端全量测试：`239 passed`（24 个测试文件）
- [x] TypeScript + Vite 生产构建：通过，无超过 500 kB 的 chunk warning
- [x] `git diff --check`：通过（仅 Windows LF/CRLF 提示）
- [x] 浏览器控制台：M5、M7、M8 无 warning/error
- [x] 人工验收：导演干预从 M7 注入后可在 M3 查看，刷新后记录仍存在

## 已知问题

- 后端全量测试仍有 1 条既有 `StarletteDeprecationWarning`，来源为 TestClient/httpx 兼容层，不影响本步功能。
- BUG-019 按产品决策保留为 `wontfix`，不是未处理缺陷。
- 四类导演干预目前共享“事件注入”最小语义；更复杂的类型专属行为不属于 T2。

## 对下一步的提示

- 后续修改 `WorldEngine.inject_event()` 时必须继续保留事件类型、目标 Agent、持久化和 SSE 首条发送顺序。
- 前端新增 API 错误展示时优先使用 `ApiError.code`，同时保留对普通字符串和 FastAPI `detail` 的兼容。
- 后续成就字段若扩展，应继续在 `frontend/src/api/achievements.ts` 的 API 边界统一做 snake_case → camelCase 映射。
- T2 已关闭当前登记的缺陷；Phase 15 开发中新发现的问题进入 T4，不回填到本步。
