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

---

## 依赖闭环补充验证（2026-07-29）

### 背景

T2 最初完成时，其依赖步骤 T1 尚未合入。T1 完成后，按
`READ → DESIGN → CHECK-1 → IMPLEMENT → TEST → CHECK-2 → DONE`
重新检查 Phase 14 Team 的创建、执行、完成态、报告持久化、评估与下载闭环。

### 补充产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `requirements.txt` | 修改 | 登记 `pytest-cov>=6.0`，保证其他开发者可复现 Team 覆盖率验证 |
| `backend/tests/test_team_engine.py` | 修改 | 补充完成态同步、报告持久化及显式结束测试 |
| `backend/tests/test_teams_api.py` | 修改 | 补充持久化报告恢复及基于报告内容评估测试 |
| `backend/tests/test_e2e_team.py` | 修改 | 修正真实 E2E 描述，并增加 Mock World 的完成事件与报告持久化闭环 |
| `frontend/src/pages/TeamDashboard.tsx` | 修改 | 执行失败改为页面级可见提示；报告下载链接挂载 DOM 并延迟释放 Blob URL |
| `frontend/src/pages/team/__tests__/TeamDashboard.test.tsx` | 修改 | 补充执行、评估、报告下载和执行失败回归测试 |

### 补充决策记录

- **真实 LLM 与 Mock 闭环分层验证：** 真实 Team E2E 验证 Agent 创建、组队、执行和 Plan；Mock World E2E 以确定性方式验证
  `connected → agent_action → plan_updated → session_end → report_ready`
  事件顺序及报告持久化，避免覆盖率测试重复消耗 API。
- **不扩大为 T1 架构重构：** `engines/team/diagnostics.py` 与 `report.py` 已存在并有单元测试，但当前运行链路仍由
  `PlanManager.build_report()` 生成报告。本次只验证现有生产闭环，不强行接入或删除未接线模块。
- **按“发现一个、修复一个、测试一个”处理：** 自动化测试发现 Team 执行失败无可见反馈；人工验收发现下载按钮未触发真实浏览器下载。两项均先形成最小修复，再分别执行定向回归。
- **依赖声明可复现：** `pytest-cov` 写入项目依赖，而不是只安装在当前虚拟环境。

### 补充接口与回溯修改

- 未修改 Phase 0 定义的共享 Pydantic/TypeScript 类型。
- 未修改后端 API 路径、请求结构、响应结构或 SSE 事件类型。
- ⚠️ **BREAKING（回溯修改记录）：** 修改了已完成 Step 53 的
  `TeamDashboard.tsx` 和 Step T1 的 Team 测试产出，并重新执行对应定向测试、前端全量回归及生产构建。
  这里的 `BREAKING` 仅用于 STEP.md 的向后修改审计，不表示对外接口不兼容。

### 补充测试结果

- [x] 后端定向测试：`31 passed, 1 warning`，包含真实 Team LLM E2E
- [x] Team 引擎覆盖率：`84.74%`，达到 T1 要求的 `≥80%`
- [x] Team 覆盖率测试：`74 passed`
- [x] 后端全量回归：`443 passed, 2 deselected, 12 warnings`
- [x] 前端 Team 定向测试：`28 passed`
- [x] 前端全量回归：`284 passed`（28 个测试文件）
- [x] TypeScript + Vite 生产构建：通过
- [x] `git diff --check`：通过（仅 Windows LF/CRLF 提示）
- [x] 人工验收：后端不可达时执行错误可见，重启后旧错误清除并可正常执行
- [x] 人工验收：评估结果可见，Markdown 报告可下载，刷新后完成态和持久化报告可恢复

> 后端全量回归中的 2 个 deselected 分别为已单独通过的真实 Team LLM E2E，以及与本次 T2
> 依赖闭环无关、会重复消耗 API 的真实 Bench E2E。

### 补充已知问题

- 12 条后端警告包括既有 `StarletteDeprecationWarning`，以及 T1 测试中同步函数继承
  `pytest.mark.asyncio` 的测试标记警告；均不影响本次结果。
- Vite 构建成功，但游戏化 `GameScene` 分包约 `1.52 MB`，仍有 chunk size warning，留给后续性能打磨。
- `npm install` 报告 7 个既有依赖漏洞；本次未执行可能产生破坏性升级的 `npm audit fix --force`。
- `diagnostics.py`、`report.py` 与当前生产运行链路的接线关系需要由后续 Team 架构整理统一决定。
