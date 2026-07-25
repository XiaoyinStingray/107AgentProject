# Step 46 — 竞技场增强 (#22–#24, #26)

| 字段 | 值 |
|------|-----|
| 日期 | 2026-07-25 |
| Phase | Phase 12.8 |
| Plan 章节 | [plan-state2.md](../plan-state2.md) §Step 46 |
| 状态 | ✅ done |

## 产出

### 后端

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/arena.py` | 新建 | 竞技模式、请求、结果、transcript 与战报 Pydantic 模型；阶段分数/排名/晋级字段保持可选 |
| `backend/src/models/arena_orm.py` | 新建 | 竞技结果 SQLite ORM 与完整 JSON 往返转换 |
| `backend/src/db.py` | 修改 | 注册竞技记录 ORM |
| `backend/src/engines/arena/engine.py` | 重构 | 统一 debate/interview/pitch 执行；移除 500 字硬截断；拆出提示词、评分、战报与大乱斗职责 |
| `backend/src/engines/arena/prompts.py` | 新建 | 三种 1v1 模式、大乱斗与裁判提示词 |
| `backend/src/engines/arena/scoring.py` | 新建 | 四维评分解析、重试与降级；大乱斗同轮按总分排序、同分时使用裁判顺序 |
| `backend/src/engines/arena/battle_royale.py` | 新建 | 6+ Agent 分阶段淘汰，按 `ceil(n/2)` 晋级直到冠军 |
| `backend/src/engines/arena/report.py` | 新建 | 生成结构化 Markdown；大乱斗展示按 Agent 去重的淘汰路径、本轮分数和状态 |
| `backend/src/api/arenas.py` | 重构 | 新增 interview、pitch、battle_royale、结果查询、列表筛选和战报端点；成功结果持久化 |
| `backend/tests/test_arena_engine.py` | 修改 | 适配拆分后的引擎 |
| `backend/tests/test_arena_run_debate.py` | 修改 | 覆盖完整 transcript 与新提示词行为 |
| `backend/tests/test_arena_modes.py` | 新建 | 三种 1v1 模式、动态超时与失败不持久化测试 |
| `backend/tests/test_arena_scoring.py` | 新建 | 总分优先、同分裁判决胜与提示词规则测试 |
| `backend/tests/test_arena_battle_royale.py` | 新建 | 淘汰链、阶段元数据与人数边界测试 |
| `backend/tests/test_arena_models.py` | 新建 | 模型、ORM、响应截断和战报测试；覆盖重复发言不得重复计人数 |
| `backend/tests/test_arenas_api.py` | 新建 | 真 SQLite + Mock 引擎的竞技 API 集成测试 |

### 前端

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/types/arena.ts` | 修改 | 与后端竞技请求/响应对齐；阶段元数据为可选增量字段 |
| `frontend/src/api/arenas.ts` | 重构 | 真实竞技 API、React Query hooks 与响应适配 |
| `frontend/src/api/queryKeys.ts` | 修改 | 增加竞技列表与战报 query key |
| `frontend/src/constants/arena.ts` | 新建 | 模式、评分标签、回放间隔等竞技常量 |
| `frontend/src/mocks/arena.ts` | 修改 | 旧竞技 Mock 与新字段对齐 |
| `frontend/src/mocks/arenaApi.ts` | 新建 | 可独立运行的 1v1、大乱斗、列表与战报 Mock；淘汰路径按 Agent 去重 |
| `frontend/src/mocks/arenaApi.test.ts` | 新建 | Mock API、阶段分数、淘汰链与战报测试 |
| `frontend/src/pages/Arena.tsx` | 重构 | M4 hash 分流入口 |
| `frontend/src/pages/arena/DuelArena.tsx` | 新建 | debate/interview/pitch 配置、真实 API 调用、比赛记录逐句回放与结果展示 |
| `frontend/src/pages/arena/BattleRoyaleArena.tsx` | 新建 | 6+ Agent 大乱斗配置与结果页 |
| `frontend/src/pages/arena/ArenaReportView.tsx` | 新建 | 已持久化战报查看、复制与下载 |
| `frontend/src/pages/arena/ArenaComparisonView.tsx` | 新建 | 按 Agent 查询并两列对比历史竞技 |
| `frontend/src/pages/arena/arena-features.test.tsx` | 新建 | 战报与复盘页面交互测试 |
| `frontend/src/components/arena/ArenaMatch.tsx` | 修改 | 明确标注完成结果回放，逐句呈现记录并过渡到裁判汇总 |
| `frontend/src/components/arena/ArenaSetup.tsx` | 修改 | 三种 1v1 模式配置对齐 |
| `frontend/src/components/arena/ArenaScoreBreakdown.tsx` | 修改 | 四项评分标签对齐 |
| `frontend/src/components/arena/BattleRoyaleResult.tsx` | 新建 | 每阶段排名、得分、晋级/淘汰/冠军与完整阶段记录 |
| `frontend/src/components/arena/arena-components.test.tsx` | 修改 | 回放、评分与重复发言去重测试 |
| `frontend/src/pages/Arena.test.tsx` | 重构 | M4 分流、真实/Mock API、回放状态和错误反馈测试 |
| `frontend/src/data/menuData.ts` | 修改 | 开放大乱斗入口 |
| `frontend/src/components/layout/feature-route-boundary.test.tsx` | 修改 | 适配 M4 已开放功能 |

### 文档

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/plan-state2.md` | 修改 | 将默认 3 轮超时验收明确为对话 90s、裁判 30s、整场 120s |

## 决策记录

- **动态超时预算：** 1v1 默认 3 轮需要 6 次 Agent 发言和一次裁判调用；按阶段分别设置对话 90s、裁判 30s、整场 120s，避免原固定 30s 在真实 LLM 下误判超时。
- **完成后回放而非伪实时：** 后端仍一次返回完整结果；前端以约 700ms/条回放 transcript，并明确标注“不是实时生成”，回放后短暂显示裁判汇总再进入结果页。
- **大乱斗赛制保持 `ceil(n/2)`：** 6 人路径为 `6→3→2→1`。同轮排名必须按四项总分降序；仅在总分相同时使用裁判给出的综合顺序破同分。
- **淘汰路径按 Agent 计数：** 同一 Agent 在同一阶段可能产生多条 transcript，路径和战报按 `speaker_id` 去重；完整阶段记录仍保留全部发言。
- **阶段元数据保持可选：** `stage_score`、`stage_rank`、`advanced` 是增量字段。新记录精确展示，旧记录通过下一轮参赛者、冠军和最后已知分数做兼容兜底。
- **局部拆分：** 只拆分竞技场职责，没有执行完整的 Step 38-S 大文件重构；新后端模块均不超过 300 行，新 React 组件不超过 200 行。
- **依赖保持不变：** 未新增 npm 或 Python 包，未修改 lockfile。

## 接口变更

- 新增 `POST /api/arenas/interview`。
- 新增 `POST /api/arenas/pitch`。
- 新增 `POST /api/arenas/battle_royale`。
- 新增 `GET /api/arenas/{arena_id}`。
- 新增 `GET /api/arenas/{arena_id}/report`。
- 扩展 `GET /api/arenas?agent_id=X`。
- `ArenaTranscriptEntry` 新增可选 `stage_score`、`stage_rank`、`advanced`；为非 BREAKING 增量字段。
- ⚠️ **BREAKING（流程回溯标记，不是 API 兼容性破坏）：** 本步修改/重构了已完成 Step 22、26、31、34、36、38 的竞技场组件、引擎、API 与路由产物。旧端点和旧记录保持兼容，相关后端、前端测试均已全量重跑。

## 测试结果

- [x] Layer 1：模式、评分、淘汰链、模型、Mock API 与组件测试 — ✅
- [x] Layer 2：真 SQLite + Mock 引擎 API 集成测试 — ✅
- [x] 后端全量测试：258 passed，1 个既有 Starlette/httpx 弃用 warning — ✅
- [x] 前端全量测试：20 个测试文件、227 passed — ✅
- [x] TypeScript + Vite 生产构建 — ✅
- [x] 生产包最大 chunk 376.23 kB，无 500 kB 警告 — ✅
- [x] CHECK-2：用户完成真实竞技、回放、评分、淘汰路径与战报手动验收 — ✅

## 组件树

```text
Arena
├── DuelArena (#item-22)
│   ├── ArenaSetup
│   ├── ArenaMatch（完成结果逐句回放）
│   └── ArenaResultPanel
│       └── ArenaScoreBreakdown
├── BattleRoyaleArena (#item-23)
│   └── BattleRoyaleResult
├── ArenaReportView (#item-24)
└── ArenaComparisonView (#item-26)
```

## 视觉走查

- [x] 暗色主题与现有 M4 页面一致 — ✅
- [x] 1v1 回放和裁判汇总过渡无功能异常 — ✅
- [x] 大乱斗按真实人数显示 `6→3→2→1` — ✅
- [x] 结果页、战报和复盘入口可用 — ✅
- [x] 用户手动验收 — ✅

## 已知问题

- 大乱斗后端目前一次返回完整结果，前端直接展示结果与完整阶段记录；未实现像 1v1 一样的逐阶段播放。用户确认本步暂不处理。
- 1v1 的逐句呈现是完成结果回放，不是后端实时流式生成；页面已有明确说明。
- 后端全量测试仍有 1 个既有 Starlette/httpx 弃用 warning；前端测试仍有 React Router v7 future-flag 提示，均不影响本步功能。

## 对下一步的提示

- Step 47 可基于现有提示词、超时和持久化边界开展 LLM 成本与性能优化。
- `scores` 在大乱斗中表示各 Agent 最后参与阶段的分数；跨阶段判断应读取 transcript 上的阶段元数据，不应把它误当成同一轮总榜。
- 若后续需要大乱斗逐阶段播放，应明确标注为已完成结果回放，或另行设计后端流式事件接口，不要伪装成实时生成。
