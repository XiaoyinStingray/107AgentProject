# Step 33 — 群体沙盒 SSE 打通 + 竞争博弈资源模型

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-22 |
| Phase | Phase 10.5 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 33 |
| 状态 | ✅ done |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/worlds.py` | 修改 | World 创建、启动、暂停、重置、历史事件与关系快照接口联通 |
| `backend/src/api/world_helpers.py` | 新建 | 场景解析辅助逻辑 |
| `backend/src/api/sse.py` | 修改 | 群体 World 连续 Tick SSE 推流与状态事件 |
| `backend/src/api/simulations.py` | 修改 | World 运行记录接入 simulation 生命周期 |
| `backend/src/models/world_control.py` | 新建 | World 控制响应 Pydantic 模型 |
| `backend/src/models/relationship.py` | 新建 | 关系节点、边与快照响应模型 |
| `backend/src/engines/agent_factory/factory.py` | 修改 | 暴露 Selector 模型客户端并提供带姓名的角色描述 |
| `backend/src/engines/world/engine.py` | 修改 | WorldEngine 编排拆分、身份上下文、资源与 Tick 生命周期接入 |
| `backend/src/engines/world/messages.py` | 新建 | SelectorGroupChat、点名路由、身份检查与自然结束条件 |
| `backend/src/engines/world/streaming.py` | 新建 | AutoGen 流式消息到 SimEvent 的转换与控制标记清理 |
| `backend/src/engines/world/state.py` | 新建 | 世界状态、Action 应用、关系更新与事件持久化 |
| `backend/src/engines/world/resources.py` | 新建 | 期末周有限座位等竞争资源上下文 |
| `backend/src/engines/world/relationships.py` | 修改 | 关系变化识别与快照所需状态对齐 |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/GroupSandbox.tsx` | 修改 | Mock 沙盒切换为真实 REST 控制 + SSE 数据流 |
| `frontend/src/api/worlds.ts` | 修改 | World 生命周期、事件与关系快照 React Query hooks |
| `frontend/src/api/queryKeys.ts` | 修改 | World events/relationships 查询 key |
| `frontend/src/stores/useSSEStore.ts` | 修改 | SSE 事件、关系状态和 500 条缓存窗口 |
| `frontend/src/hooks/useSSE.ts` | 修改 | 真实 SSE 连接、去重与断线补偿 |
| `frontend/src/hooks/useThrottledEvents.ts` | 新建 | 1x/2x 展示节奏控制 |
| `frontend/src/data/sandboxScenarios.ts` | 新建 | 沙盒场景选项数据 |
| `frontend/src/types/relationships.ts` | 新建 | 关系快照与增量状态 TS 类型 |
| `frontend/src/components/world/RelationshipGraph.tsx` | 修改 | 关系快照首次水合 + SSE 增量更新 |
| `frontend/src/components/world/RelationshipGraphCanvas.tsx` | 新建 | 关系图 Canvas 渲染 |
| `frontend/src/components/world/relationshipGraphLayout.ts` | 新建 | 关系图布局计算 |
| `frontend/src/components/world/EventFeed.tsx` | 修改 | 真实 SSE 事件展示与 Tick 筛选 |
| `frontend/src/components/world/SandboxHeader.tsx` | 修改 | 暂停、继续、速度和重置控制 |
| `frontend/src/components/world/SandboxSetup.tsx` | 修改 | 真实 Agent/场景选择与 World 创建入口 |
| `frontend/src/mocks/sandbox.ts` | 修改 | Mock 仅保留为独立测试数据，不进入生产链路 |

### 测试

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/world_engine_fixtures.py` | 新建 | WorldEngine 的 Mock LLM 与真 SQLite 测试基座 |
| `backend/tests/test_world_engine_runtime.py` | 新建 | 身份、Selector、持久化与 Tick 集成测试 |
| `backend/tests/test_group_chat_termination.py` | 新建 | 自然结束、控制标记隐藏和 Tick 边界测试 |
| `backend/tests/test_sse.py` 等 | 修改 | World/SSE/关系/Agent 工厂回归覆盖 |
| `frontend/src/pages/GroupSandbox.test.tsx` | 新建 | World 创建、启动和页面状态测试 |
| `frontend/src/stores/useSSEStore.test.ts` | 新建 | SSE 去重、关系增量与缓存测试 |
| `frontend/src/components/world/RelationshipGraph.test.tsx` | 新建 | 关系图状态与布局测试 |
| `frontend/src/components/world/world-components.test.tsx` | 修改 | 沙盒组件交互回归测试 |

## 决策记录

- **真实链路替换 Mock：** GroupSandbox 通过 REST 创建/控制 World，再由 `useSSE(worldId)` 消费真实 Agent 事件；Mock 数据继续独立存在，仅服务测试和无后端演示。
- **WorldEngine 按职责拆分：** 原 `engine.py` 超过 State 2 的 300 行限制，拆为 message、streaming、state、resources 模块，公开 API 保持由 `WorldEngine` 统一提供。
- **竞争采用资源上下文驱动：** 期末周有限座位等状态进入 Agent 上下文，由 Persona 差异产生竞争、合作或放弃行为，再交给关系演化分析，不新增独立“竞争引擎”。
- **关系图先快照后增量：** 首次进入调用 REST 关系快照，随后由 `relationship_change` SSE 事件更新，避免只看连接后的局部关系。
- **Selector 替代固定 RoundRobin：** 明确点名由本地代码直接路由，歧义场景交给 Selector，避免 ABCABC 强制轮转造成角色串台。
- **自然结束 + 硬上限：** Agent 在对话自然收束时输出内部 `[END_TICK]`；AutoGen 终止当前 Tick，事件转换前移除该标记。同时保留 `Agent 数 × 3` 轮硬上限。
- **每轮身份锁：** 系统提示明确内部标识与姓名映射，并要求以历史消息 `source` 为上一位发言者的唯一依据；明显身份矛盾的消息不推送、不持久化。

## 接口与兼容性

- 新增 `WorldControlResponse`、`RelationshipSnapshotResponse` 及对应前端关系类型；没有修改 Phase 0 已有共享类型。
- World 控制、历史事件和关系快照均沿用 `plan-state2.md` 的 `/api/worlds/{world_id}/...` 路径。
- **BREAKING（内部行为）：** 群体聊天从固定 RoundRobin 改为 Selector + 自然结束，单个 Tick 的发言顺序和数量不再固定。
- **回溯修改：** 修改了 Step 05、09–13、20–21、29–32 的既有产出；已通过全量后端测试、前端测试和生产构建验证兼容性。

## 测试结果

- [x] 群聊身份、点名路由、自然结束专项测试 — ✅ 19 passed
- [x] 后端全量测试（Mock LLM + 真 SQLite）— ✅ 212 passed，1 个既有 Starlette/httpx 弃用警告
- [x] 前端全量测试 — ✅ 203 passed（13 files）
- [x] TypeScript 类型检查 + Vite 生产构建 — ✅ 成功
- [x] 真实 DeepSeek 手动验收 — ✅ 群体对话、身份对应与自然结束无异常
- [x] 人工 CHECK-2 — ✅ 2026-07-22 用户确认通过

## 当前限制

- 前端 SSE Store 只保留最近 500 条消息；暂停状态事件也会占用窗口，较早 Tick 可能从实时页面消失，但 SQLite 历史事件仍保留。历史分页/水合留待 Step 35–36。
- WorldStore 仍是内存实现，后端重启会结束当前活动 World；持久化由 Step 35 完成。
- Vite 生产包仍有大于 500 kB 的既有 chunk warning，留待 Step 38 优化。
- Prompt 和后处理能显著降低身份串台，但真实 LLM 输出仍有随机性，后续端到端测试应继续覆盖跨轮次指代。

## 对下一步的提示

- Step 34 可直接复用本步已稳定的 World、SSE 与关系数据，为叙事、竞技和干预模块提供真实输入。
- 接入其他多人 LLM 链路时，应继续使用“明确点名本地路由 + Selector 处理歧义 + 自然结束硬兜底”的模式。
- Step 35 应优先解决 World/Agent 持久化、LLM timeout/fallback 和历史事件恢复。
