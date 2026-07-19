# Step 22 — 竞技场页面 (M4)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-19 |
| Phase | Phase 7.7 |
| Plan 章节 | [development-plan.md](../development-plan.md) §7.3.7 / Phase 8 接口约束 |
| 状态 | ✅ done |

## 产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/arena.ts` | 新建 | ArenaMode、ArenaConfig、ArenaResult、transcript 等 Step 22/26 对齐类型 |
| `frontend/src/mocks/arena.ts` | 新建 | 辩论、面试、路演三种确定性 Mock 脚本与 `buildMockArenaResult()` |
| `frontend/src/mocks/arena.test.ts` | 新建 | Mock 构建函数三模式 happy path 与边界测试 |
| `frontend/src/components/arena/ArenaSetup.tsx` | 新建 | 双 Agent、模式、主题选择和开始条件 |
| `frontend/src/components/arena/ArenaTopicPicker.tsx` | 新建 | 三模式预设主题与可编辑自定义输入 |
| `frontend/src/components/arena/ArenaMatch.tsx` | 新建 | 三轮六条发言的逐条播放视图 |
| `frontend/src/components/arena/ArenaScoreBreakdown.tsx` | 新建 | 论点、表达、应变、人设一致性四维评分条 |
| `frontend/src/components/arena/ArenaResultPanel.tsx` | 新建 | 胜者、四维评分、裁判理由和完整 transcript |
| `frontend/src/components/arena/arena-components.test.tsx` | 新建 | 三个展示组件的渲染与交互测试 |
| `frontend/src/pages/Arena.tsx` | 新建 | M4 hash 分流、页面状态、Mock 播放和结果编排 |
| `frontend/src/pages/Arena.test.tsx` | 新建 | 完整状态流、Store、hash、无后端和 Step 16 路由回归测试 |
| `frontend/src/App.tsx` | 修改 | `/arena` 从 Step 16 通用占位页接入 `Arena` |

## 决策记录

- **Step 22 只完整实现功能 #22：** `/arena` 与 `#item-22` 提供 1v1 Mock 前端；#23–#28 保留正确名称和优先级的建设中反馈，不提前实现未规划的真实逻辑。
- **Mock 隔离 Step 26：** 本步不请求 `/api/arenas`，不依赖 AutoGen、真 LLM、数据库或 SSE；真实竞技引擎完成后再替换数据源。
- **未来接口兼容：** `ArenaMode` 使用 `debate / interview / pitch`，`ArenaResult` 保持 `winner_id / scores / judge_reasoning / transcript`，分数范围为 0–40。
- **确定性三轮 Mock：** 每种模式固定三轮、双方每轮各发言一次，确保前端测试稳定；Phase 8 的“每次结果不同”留给 Step 26 真 LLM 验证。
- **融合两版优势：** 保留分层组件、三种可运行模式、动态 Agent、hash 边界与完整测试；吸收另一版的预设题目、独立裁判阶段和四维评分展示。
- **页面本地状态：** setup/running/judging/result、配置、播放进度与结果使用 `useState`；只读取 Step 17 `useAgentStore`，不新增全局状态。
- **Agent 来源：** 合并 `MOCK_AGENTS` 与铸造厂创建的 Store Agent，并按 ID 去重。
- **动画最后接入：** 仅复用现有 `fade-in`、`slide-in` Token，并支持 `motion-reduce:animate-none`；未修改 Tailwind 配置。
- **无新增依赖：** `package.json` 与 lock 文件均未修改。

## 接口变更

```typescript
type ArenaMode = "debate" | "interview" | "pitch";

interface ArenaConfig {
  agent_a_id: string;
  agent_b_id: string;
  mode: ArenaMode;
  topic: string;
  rounds: number;
}

interface ArenaResult {
  winner_id: string;
  scores: Record<string, number>;
  judge_reasoning: string;
  transcript: ArenaTranscriptEntry[];
}

interface ArenaPresentationResult extends ArenaResult {
  score_breakdowns: Record<string, ArenaScoreBreakdown>;
}
```

- `ArenaResult` 外层字段与 plan 保持不变；多维评分放在 Step 22 展示层扩展 `ArenaPresentationResult`，未修改共享类型。
- ⚠️ **BREAKING：** 修改 Step 16 产出 `App.tsx`，`/arena` 从通用 `PlaceholderPage` 变为真实 `Arena` 页面；通用占位组件及其他路由保持不变，Step 16 回归已通过。

## 组件树

```text
App
└── Layout
    └── /arena → Arena
        ├── 无 hash / #item-22
        │   ├── setup → ArenaSetup
        │   │   ├── AgentSlot A
        │   │   ├── AgentSlot B
        │   │   ├── ArenaMode × 3
        │   │   ├── ArenaTopicPicker
        │   │   └── Start
        │   ├── running / judging → ArenaMatch
        │   │   ├── CompetitorCard × 2
        │   │   └── ArenaTranscriptEntry × 0–6
        │   └── result → ArenaResultPanel
        │       ├── ScoreCard × 2
        │       │   └── ArenaScoreBreakdown × 4
        │       ├── JudgeReasoning
        │       └── FullTranscript + Reset
        └── #item-23–28 → EmptyState（保留菜单占位）
```

## 测试结果

- [x] 最新主线基线预检：Vitest `3 files / 25 passed`，生产构建通过
- [x] Layer 1 — Mock 单元测试：`11 passed`，覆盖三种模式、预设主题、四维分数一致性及输入边界
- [x] Layer 1 — 组件测试：`6 passed`，覆盖选择器、预设/自定义主题、裁判阶段、四维结果与重置
- [x] Layer 1 — 页面/回归测试：`19 passed`，覆盖完整播放、三模式结果、Store、hash、定时器清理与 Step 16 路由
- [x] 前端全量：Vitest `5 files / 57 passed`
- [x] TypeScript + 生产构建：`npm run build` 通过，2403 modules
- [x] Layer 2 — Mock 独立运行：后端 8000 未运行，临时 Vite `GET /arena` 返回 HTTP 200
- [x] Layer 2 — 无真实 API：完整流程中 `fetch` 未调用
- [x] Step 16 回归：首页、M1、M2、M3、M5 与 `/arena` 路由挂载通过
- [x] Step 20/21 回归：`world-components.test.tsx` 8 项保持通过
- [x] Step 23 回归：`narrative-components.test.tsx` 13 项保持通过
- [x] 真 LLM 手动验证：N/A，真实裁判输出质量属于 Step 26

## 视觉走查

- [x] 融合前版本已完成暗色主题、设置/比赛/结果、1280×720 与 1920×1080 手动走查
- [ ] 融合新增的预设主题、裁判阶段与四维评分，待用户在融合分支最终走查确认
- [x] Mock 模式可独立浏览 — 无后端可运行

## 已知问题

- `docs/bugs.md` BUG-001 React Router Future Flag warning 保持不变；本步未发现新的产品 bug。
- Vite 主包 628.27 kB（gzip 195.42 kB），超过 500 kB 提示阈值；最新主线融合前已为 623.73 kB，该累计问题不影响当前功能，建议 Step 27/28 进行路由懒加载和代码分割。
- 当前竞技结果为确定性 Mock；真实随机结果、AutoGen 裁判和 `/api/arenas` 留给 Step 26。

## 对下一步的提示

- **Step 23（叙事页面 M5）：** 已在最新主线完成，本次融合已通过其 13 项回归测试。
- **Step 26（竞技引擎）：** 接入时保持本步 `ArenaResult` 外层字段，核对后端 transcript 单条消息格式后替换 Mock 数据源。
- **Step 27/28（打磨与联调）：** 将当前同步路由改为 `React.lazy()` + `Suspense`，处理累计 bundle warning，并回归全部一级路由。
