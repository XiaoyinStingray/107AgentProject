# Step 34 — 叙事 + 竞技 + 干预联通

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-22 |
| Phase | Phase 10.6 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 34 |
| 状态 | 🚧 in-progress（代码完成，人工验收待测） |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/narratives.py` | 修改 | 新增 `POST /api/narratives/podcast` 端点 |
| `backend/src/api/arenas.py` | 修改 | 新增 `POST /api/arenas/interview` 和 `POST /api/arenas/pitch` 端点 |
| `backend/src/engines/arena/engine.py` | 修改 | 裁判解析重构（JSON→文本提取回退）；去掉 transcript `[:500]` 截断；注入辩论/面试/路演专用 system prompt（禁止 think_aloud）；清空 Agent 上下文防止泄漏；transcript speaker 映射为 persona.name |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/api/narratives.ts` | **新建** | `useGenerateStory/Diary/Letter/Podcast` React Query mutation hooks |
| `frontend/src/api/arenas.ts` | **新建** | `useRunDebate`, `useArenaResult`, `useArenas` + `adaptArenaResult` 适配器 |
| `frontend/src/api/queryKeys.ts` | 修改 | 追加 `narrativeKeys`, `arenaKeys` |
| `frontend/src/api/worlds.ts` | 修改 | 追加 `useInjectEvent` mutation hook |
| `frontend/src/pages/NarrativeFactory.tsx` | 修改 | Mock→API（4 种风格全走真实后端）；新增 World 选择器；移除 `setTimeout` mock 生成延迟 |
| `frontend/src/pages/Arena.tsx` | 修改 | debate 走 `POST /arenas/debate`；新增辩论加载中视图（⚔️ 动画）；interview/pitch 暂保留 Mock 动画 |
| `frontend/src/pages/DirectorIntervention.tsx` | 修改 | Mock→`POST /worlds/{id}/inject`；新增活跃 World 选择器（含 running + paused）；新增错误提示 |
| `frontend/src/hooks/useSSE.ts` | 修改 | worldId 变化时 `clear()` 防止跨页面 SSE 事件泄漏 |
| `backend/src/engines/world/state.py` | 修改 | `inject_event` 将事件加入 `_pending_injects` 队列 |
| `backend/src/engines/world/engine.py` | 修改 | `tick_stream` 先 yield 注入事件再开始 tick |

### 测试

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/narrative/narrative-components.test.tsx` | 修改 | Mock API hooks + World 选择步骤 |
| `frontend/src/pages/Arena.test.tsx` | 修改 | Mock `useRunDebate` + `adaptArenaResult`；辩论文本匹配更新 |
| `frontend/src/components/intervention/intervention-components.test.tsx` | 修改 | Mock `useWorlds` + `useInjectEvent`；async 注入流程适配 |
| `backend/tests/test_arena_engine.py` | 修改 | `test_parse_invalid_json` 适配新版 raw text 回退行为 |

## 决策记录

- **4 种叙事风格全走 API：** podcast 之前只有 Mock 是因为后端缺端点（NarrativeEngine 已有 PODCAST style）。补了 `POST /api/narratives/podcast` 后前端直接用 `useGeneratePodcast`。
- **Arena 辩论上下文隔离：** 在 `run_debate` 中先用 `_reset_agent_contexts` 清空 AutoGen 消息历史，再用 `inject_context` 注入辩论专用 system prompt（禁止 think_aloud/observe 等工具），避免 LifeAgent 默认"内心独白"指令泄漏到竞技场景。
- **裁判解析两级回退：** `_parse_judge_result` 先尝试 JSON → 失败则从中文 Markdown 文本提取分数（正则匹配 `×/10` 模式，按正方/反方分段加总）→ 原始文本作为 reasoning 完整保留，不再丢弃。
- **transcript speaker 实名化：** `run_debate` 中用 `agent_name_map` 将 AutoGen 内部标识映射为 `persona.name`，前端 `adaptArenaResult` 可直接匹配显示。
- **注入事件实时推送：** `inject_event` 写入 `_pending_injects` 队列，`tick_stream` 在每轮 tick 开始前先 yield 注入事件，确保前端 SSE 流能实时看到注入。
- **干预台接受暂停 World：** `activeWorlds` 过滤 `running || paused`（而非仅 `running`），暂停的模拟也可注入事件。
- **SSE 跨页面清理：** `useSSE` 在 `worldId` 变化时调用 `clear()`，防止从群体沙盒切到单人剧场时旧事件残留。

## 接口与兼容性

- 新增 `POST /api/narratives/podcast`、`POST /api/arenas/interview`、`POST /api/arenas/pitch` 端点。
- Arena `transcript[].speaker` 从 AutoGen 内部名改为 `persona.name`（**BREAKING** 内部行为：依赖 transcript speaker 格式的消费者需更新）。
- `_parse_judge_result` 返回的 `reasoning` 在 JSON 解析失败时从错误消息改为原始裁判文本（最长 800 字符）。
- 其他接口无变更，Phase 0 共享类型无修改。

## 测试结果

- [x] 后端全量测试 — ✅ 212 passed
- [x] 前端全量测试 — ✅ 203 passed（13 files）
- [x] TypeScript 类型检查 — ✅ 通过

## 当前限制

- **辩论内容质量：** 辩论 prompt 已优化（禁止内心独白 + 限制字数），但 AutoGen RoundRobinGroupChat 的 task prompt 在首轮后可能被忽略。LLM 仍有偶尔输出元分析或超长发言的倾向。这需要 Step 46 的系统性优化（辩论专用 prompt 模板 + 裁判分维度评分）。
- **Arena interview/pitch：** 后端骨架已实现（`run_interview`/`run_pitch`），但前端仍走 Mock 动画——prompt 和裁判标准尚未针对面试/路演场景校准，留待 Step 46。
- **沙盒暂停后切界面状态丢失：** `worldId` 存储在 `GroupSandbox` 组件 state 中，导航离开后丢失。返回时进入 setup 页面，无法自动恢复正在运行的模拟。需要将活跃 World ID 持久化到 URL 参数或全局 store，留待 Step 35。
- **干预台历史不持久化：** 注入记录仅存于前端本地 state，刷新后恢复为 Mock 数据。后端 `interventions` 表 + CRUD API 留待 Step 44。
- **SSE 断线恢复后的状态水合：** `useSSE` 重连时通过 REST 补发事件，但 Agent 状态面板和关系图仅从 SSE 增量更新，首次水合依赖 REST 快照（已在 Step 33 实现）。

## 对下一步的提示

- Step 35（持久化 + 鲁棒性）应优先解决 World/Agent SQLite 存储、LLM timeout/fallback、和历史事件恢复。
- Step 35 还应处理沙盒状态跨页面保持（URL 参数或全局 activeWorldId store）。
- 接入 Arena interview/pitch 真实链路时应复用本步已稳定的 debate 模式（上下文清空 + 专用 prompt + 裁判回退解析）。
