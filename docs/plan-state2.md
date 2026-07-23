# 人生实验室 · Life Lab — Plan State 2

> **文档目的：** 第二阶段完整开发计划。联调 → 重构 → 功能补全 → 交付。
> **上一阶段：** [Plan State 1](development-plan.md)（Step 00–28，29 步全部 done）
> **当前状态：** 前后端各自有代码、Mock 能跑全流程、但从未联通。56 项功能中仅 1 项端到端完成。
> **本阶段目标：** 前后端真实联通 → 架构重整 → 补齐缺失功能 → 项目接近完整。
>
> **与 State 1 的关系：** State 1 搭骨架（类型系统、引擎、前端页面），State 2 接血管（API 路由、真实调用、数据持久化）并填血肉（P1/P2 缺失功能）。
>
> **设计原则（继承 State 1）：** 接口先行、Mock 可独立测试、每步 2-4 小时、按 [STEP.md](STEP.md) 流程执行。

---

## Step 速查表

| Step | Phase | 名称 | 依赖 | 核心产出 | 估时 |
|------|-------|------|------|----------|------|
| **🔌 Phase 10: 前后端联通** | | | | | |
| 29 | 10.1 | Agent 创建链路 + API 层初始化 | 03, 17 | api/client.ts + api/agents.ts + React Query + 真 POST | ✅ |
| 30 | 10.2 | Narratives API 路由 | 15 | /api/narratives/{story,diary,letter} | ✅ |
| 31 | 10.3 | Arenas + Events + Relationships API | 26, 09 | /api/arenas/debate, /api/worlds/{id}/events, /api/worlds/{id}/relationships | ✅ |
| 32 | 10.4 | 单人剧场 SSE 打通 | 11, 19 | SoloTheater 真实 SSE + pause/resume + 8tick 自动结束 | ✅ |
| 33 | 10.5 | 群体沙盒 SSE + 竞争博弈 (#18) | 11, 20 | GroupSandbox 真实多 Agent 交互 + 资源模型 | 3h |
| 34 | 10.6 | 叙事 + 竞技 + 干预联通 | 30, 31, 23, 22 | 剩余模块全部切换真 API | ✅ |
| 34-W | 10.6.5 | World 管理完善 | 34 | World 列表/切换/删除 + setup 改为两段式 + 返回列表 | ✅ |
| 34-S | 10.6.6 | 场景自定义 | 34-W | 用户自定义场景 CRUD，SandboxSetup + SoloTheater 可选自定义场景 | 1.5h |
| 35 | 10.7 | 持久化 + 鲁棒性 | 02, 14, 34-W, 34-S | Agent/World SQLite 存储 + LLM fallback | 3h |
| **🏗️ Phase 11: 前端架构重整** | | | | | |
| 36 | 11.1 | API 层收敛 + 重复代码消除 | 34 | api/{worlds,events,narratives,arenas...}.ts + 数据同步验证 | 3h |
| 37 | 11.2 | 共享组件 + 常量抽取 | 36 | SelectableCard, labels/, scenarios/ | 3h |
| 38 | 11.3 | 大文件拆分 + 路由优化 | 37 | 懒加载, 死代码清理, 包体积 < 400KB | 3h |
| **🧩 Phase 12: 功能补全** | | | | | |
| 39 | 12.1 | Agent Remix + 模板库 (#6, #7) | 29 | remix API + 前端模板浏览器 | 3h |
| 40 | 12.2 | 目标系统 + 动态计划 (#10, #11) | 32, 33 | 目标生命周期 + 计划调整 UI | 3h |
| 41 | 12.3 | 决策回放 + 群体动力学 (#13, #19, #21) | 33 | 决策展开 + 群体分析报告 | 3h |
| 42 | 12.4 | 叙事工厂完善 (#29–#32) | 30 | 4 风格真实生成 + 前端联通 | 2h |
| 43 | 12.5 | 控制台全功能 (#36–#39) | 33 | Dashboard/Heatmap/Search/Patterns 真数据 | 3h |
| 44 | 12.6 | 干预台完善 (#43, #48) | 34 | 事件注入 + 干预历史持久化 | 2h |
| 45 | 12.7 | 档案馆功能 (#51, #52, #54) | 35 | 回放/模板/成就真实数据 | 3h |
| 46 | 12.8 | 竞技场增强 (#22–#24, #26) | 31 | debate 质量修复 + interview/pitch/battle_royale + 战报 + 复盘 | 4h |
| **🎯 Phase 13: 打磨与交付** | | | | | |
| 47 | 13.1 | LLM 成本与性能优化 | 46 | 上下文压缩、缓存、虚拟滚动 | 3h |
| 48 | 13.2 | 端到端集成测试 | 47 | 5 条全链路自动化测试 | 3h |
| 49 | 13.3 | P3 占位页补齐 | 38 | 20 个 P3 菜单统一占位 | 1h |
| 50 | 13.4 | 演示排练 + 最终文档 | 49 | 真实 API 版 demo-script + README | 2h |

> **共 24 个 Step。** 联通阶段 9 步（29–35），重整阶段 3 步（36–38），功能补全 8 步（39–46），交付 4 步（47–50）。
> **总计估时：** ~55 小时（一人 + AI）

---

## 目录

- [56 项功能当前状态](#56-项功能当前状态)
- [Phase 10: 前后端联通](#phase-10-前后端联通)
  - [Step 29 — Agent 创建链路打通](#step-29--agent-创建链路打通)
  - [Step 30 — Narratives API 路由](#step-30--narratives-api-路由)
  - [Step 31 — Arenas + Events API](#step-31--arenas--events-api)
  - [Step 32 — 单人剧场 SSE 打通](#step-32--单人剧场-sse-打通)
  - [Step 33 — 群体沙盒 SSE 打通](#step-33--群体沙盒-sse-打通)
  - [Step 34 — 叙事 + 竞技 + 干预联通](#step-34--叙事--竞技--干预联通)
  - [Step 35 — 持久化 + 鲁棒性](#step-35--持久化--鲁棒性)
- [Phase 11: 前端架构重整](#phase-11-前端架构重整)
  - [Step 36 — 重复代码消除](#step-36--重复代码消除)
  - [Step 37 — 共享组件 + 常量抽取](#step-37--共享组件--常量抽取)
  - [Step 38 — 大文件拆分 + 路由优化](#step-38--大文件拆分--路由优化)
- [Phase 12: 功能补全](#phase-12-功能补全)
- [Phase 13: 打磨与交付](#phase-13-打磨与交付)
- [附录 A: 56 项功能完整审计](#附录-a-56-项功能完整审计)
- [附录 B: 代码规范重申](#附录-b-代码规范重申)
- [附录 C: 前端共享组件/常量/Hook 目录](#附录-c-前端共享组件常量hook-目录)
- [附录 D: 依赖关系图](#附录-d-依赖关系图)

---

## 56 项功能当前状态

> 审计日期：2026-07-20。覆盖 `backend/src/` 和 `frontend/src/` 全部代码。

### 总览

| 状态 | 数量 | 说明 |
|------|------|------|
| ✅ **DONE** | 1 | 端到端全通（前端调真后端） |
| 🟡 **PARTIAL** | 31 | 有代码但未联通，或有缺口 |
| ❌ **MISSING** | 24 | 完全缺失（仅占位页或完全无代码） |

### 逐项状态（详见附录 A 完整审计）

**M1 · Agent 铸造厂（#1–#7）：**
- #1 (P0) 自然语言创建 Agent — 🟡 PARTIAL：后端引擎通、前端 Mock 阻隔
- #2 (P0) 人格引擎 — 🟡 PARTIAL：同上
- #3–#5 (P1) 背景/目标/决策 — 🟡 PARTIAL：引擎+UI 都有，未联通
- #6 (P2) Remix — ❌ MISSING：前后端都没有
- #7 (P2) 模板库 — ❌ MISSING：前后端都没有

**M2 · 单人剧场（#8–#14）：**
- #8 (P0) 场景投放 — 🟡 PARTIAL：后端 WorldEngine 完整、前端用 useMockSSE
- #9 (P0) 思维流实时展示 — 🟡 PARTIAL：后端 SSE 通、前端未连
- #10 (P1) 目标追逐 — 🟡 PARTIAL：set_goal tool 有、但无目标生命周期
- #11 (P1) 动态计划调整 — ❌ MISSING：无计划模型
- #12 (P1) Agent 日记 — 🟡 PARTIAL：NarrativeEngine 有、无 API 路由
- #13 (P2) 决策回放 — ❌ MISSING
- #14 (P2) 暂停干预 — 🟡 PARTIAL：API 有但前端未调

**M3 · 群体沙盒（#15–#21）：**
- #15 (P0) 群体投放 — 🟡 PARTIAL：GroupChat 通、前端 Mock
- #16 (P1) Agent 间对话 — 🟡 PARTIAL：同上
- #17 (P1) 关系演化 — 🟡 PARTIAL：关系系统完整、前端 Mock
- #18 (P1) 竞争博弈 — 🟡 PARTIAL：关键词检测有、无资源模型
- #19 (P2) 角色冲突 — 🟡 PARTIAL：关键词有、无编排
- #20 (P2) 关系网络图 — 🟡 PARTIAL：图组件有、无 API 返回关系快照
- #21 (P2) 群体动力学报告 — ❌ MISSING

**M4 · 竞技场（#22–#28）：**
- #22 (P1) 1v1 对抗 — 🟡 PARTIAL：ArenaEngine 完整、无 API 路由
- #23 (P2) 大乱斗 — ❌ MISSING
- #24 (P2) 战报生成 — 🟡 PARTIAL：裁判评分有、无独立报告端点
- #25–#28 (P2/P3) — ❌ MISSING

**M5 · 叙事工厂（#29–#35）：**
- #29 (P1) 小说化叙事 — 🟡 PARTIAL：引擎完整、无 API
- #30 (P2) 未来的信 — 🟡 PARTIAL：同上
- #31 (P2) 平行对话 — ❌ MISSING
- #32 (P2) 播客脚本 — 🟡 PARTIAL：引擎完整、无 API
- #33–#35 (P3) — ❌ MISSING

**M6 · 控制台（#36–#42）：**
- #36 (P0) 仪表盘 — 🟡 PARTIAL：UI 完整、100% Mock 数据
- #37–#39 (P2) — 🟡 PARTIAL：全有 UI、全是 Mock
- #40–#42 (P3) — ❌ MISSING

**M7 · 干预台（#43–#49）：**
- #43 (P2) 事件注入 — 🟡 PARTIAL：API 有、前端不调
- #48 (P2) 干预历史 — 🟡 PARTIAL：Mock UI 有、无持久化
- #44–#47, #49 (P3) — ❌ MISSING

**M8 · 档案馆（#50–#56）：**
- #55 (P2) 报告导出 — ✅ **DONE**：唯一端到端全通的功能
- #51 (P2) 精彩回放 — 🟡 PARTIAL：Mock UI
- #52 (P2) 实验模板 — 🟡 PARTIAL：Mock UI
- #54 (P2) 成就系统 — 🟡 PARTIAL：Mock UI
- #50, #53, #56 (P3) — ❌ MISSING

### State 2 完成标准

| 优先级 | 目标 | 数量 |
|--------|------|------|
| P0 (6) | 全部 DONE — 端到端真实联通 | 6 |
| P1 (14) | 全部 DONE — 端到端真实联通 | 14 |
| P2 (19) | DONE 或有功能骨架（Mock 可接受） | 19 |
| P3 (17) | 占位页面（"建设中"统一模板） | 17 |

---

## 数据架构设计（Phase 10 前置）

> **这是 State 2 最重要的设计决策。** 所有 Step 29–50 的数据流遵循此架构。
>
> State 1 的问题是：每个模块自己管数据（Mock import / inline state / Zustand / 内存 dict），
> 模块间没有统一的数据契约。M1 创建了 Agent，M3 不知道；M3 更新了情绪，M6 看不到。
>
> 本架构的目标：**一处修改，全局同步。**

### 0.1 核心原则

```
原则 1: 后端 SQLite 是唯一数据源（Single Source of Truth）
  → 前端不做"数据拥有者"，只做"数据缓存"
  → Agent / World / Event / Simulation / Narrative 全部持久化在后端

原则 2: 前端用 React Query 做缓存层，不用 Zustand 存服务端数据
  → React Query 自带 cache invalidation、后台刷新、乐观更新
  → 所有页面共享同一个 queryClient，天然同步

原则 3: 模拟运行时数据（SSE 事件流）用 Zustand 做 transient store
  → 模拟结束后事件持久化到后端，前端切回 React Query 读取

原则 4: 跨模块通信走"后端写入 → cache invalidation → 所有消费者自动刷新"
  → 不用事件总线、不用全局 state、不用 prop drilling
```

### 0.2 数据实体与所有权

```
┌────────────────────────────────────────────────────────────────┐
│                      后端 SQLite（唯一数据源）                    │
│                                                                │
│  agents 表          worlds 表         events 表                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ id            │  │ id            │  │ id            │         │
│  │ name          │  │ name          │  │ world_id (FK) │         │
│  │ persona_json  │  │ scenario_json │  │ tick          │         │
│  │ background_json│ │ agent_ids_json│  │ type          │         │
│  │ goals_json    │  │ current_tick  │  │ source_agent  │         │
│  │ emotional_json│  │ status        │  │ description   │         │
│  │ energy        │  │ created_at    │  │ data_json     │         │
│  │ created_at    │  └──────────────┘  │ created_at    │         │
│  │ updated_at    │                    └──────────────┘         │
│  └──────────────┘                                              │
│                                                                │
│  simulations 表     memories 表       narratives 表             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ id            │  │ id            │  │ id                    │ │
│  │ world_id (FK) │  │ agent_id (FK) │  │ agent_id / world_id   │ │
│  │ started_at    │  │ type          │  │ style (story/diary..) │ │
│  │ ended_at      │  │ content       │  │ title                 │ │
│  │ total_ticks   │  │ importance    │  │ content               │ │
│  │ status        │  │ keywords      │  │ generated_at          │ │
│  └──────────────┘  │ created_at    │  └──────────────────────┘ │
│                    └──────────────┘                            │
│  arenas 表（State 2 新增）                                      │
│  ┌──────────────────────────────────────────────────────┐     │
│  │ id / mode / agent_a_id / agent_b_id / winner_id      │     │
│  │ scores_json / transcript_json / judge_reasoning       │     │
│  │ created_at                                            │     │
│  └──────────────────────────────────────────────────────┘     │
│                                                                │
│  interventions 表（State 2 新增）                                │
│  ┌────────────────────────────────────────────┐               │
│  │ id / world_id (FK) / type / description    │               │
│  │ target_agent_id / created_at                │               │
│  └────────────────────────────────────────────┘               │
└────────────────────────────────────────────────────────────────┘
```

### 0.3 前端数据层架构

```
                    React Query Cache
                   (服务端状态缓存层)
                   ┌──────────────────────────────────────┐
 ['agents']        │  Agent[]          (全量列表)          │
 ['agents', id]    │  Agent            (单个详情)          │
 ['worlds']        │  World[]          (全量列表)          │
 ['worlds', id]    │  World            (单个详情+事件)      │
 ['simulations']   │  Simulation[]     (全量列表)          │
 ['narratives']    │  Narrative[]      (按 agent 筛选)     │
 ['arenas']        │  ArenaResult[]    (竞技历史)          │
 ['achievements']  │  Achievement[]    (成就列表)          │
                   └──────────────────────────────────────┘
                              ▲
                              │ invalidate / refetch
                              │
                   ┌──────────┴──────────┐
                   │    useMutation      │
                   │ (POST/PUT/DELETE 后 │
                   │  自动刷新缓存)       │
                   └─────────────────────┘
                              ▲
                              │
    ┌─────────┬─────────┬─────────┬─────────┬─────────┐
    │ M1 铸造厂│ M2 剧场 │ M3 沙盒 │ M4 竞技 │ M5 叙事 │
    │ useQuery│ useQuery│ useQuery│ useQuery│ useQuery│
    │(['agents│(['agents│(['worlds│(['agents│(['worlds│
    │   '])   │  ', id])│  ', id])│   '])   │  ', id])│
    └─────────┴─────────┴─────────┴─────────┴─────────┘
         ▲          ▲          ▲          ▲          ▲
         │          │          │          │          │
         └──────────┴──────────┴──────────┴──────────┘
              所有模块读写同一个 queryClient
              M1 mutate → invalidate(['agents']) → M2/M3/M4 自动刷新


         Zustand Store（仅 UI 状态，不存服务端数据）
         ┌────────────────────────────────────────┐
         │ useSSEStore: SSE 事件的 transient 缓冲  │
         │   { events: SSEEvent[], connected: bool }│
         │   模拟结束后事件 flush 到后端 → 清空     │
         │                                        │
         │ useUIStore: 纯 UI 状态                  │
         │   { selectedAgentId, activeTab,         │
         │     sandboxSpeed, sidebarCollapsed }    │
         └────────────────────────────────────────┘
```

### 0.4 跨模块数据流：一个 Agent 的生命周期

以"创建 Agent → 投放沙盒 → 观察仪表盘"为例，展示数据如何自动同步：

```
Step 1: 用户在 M1 铸造厂创建 Agent "小明"
  ┌─────────────────────────────────────────────────────┐
  │ M1 AgentFoundry                                     │
  │   useMutation(POST /api/agents, {                   │
  │     onSuccess: () => queryClient.invalidateQueries( │
  │       ['agents']     ← 标记缓存失效                  │
  │     )                                               │
  │   })                                                │
  │                                                     │
  │ 后端：INSERT INTO agents (...) → 返回 AgentResponse  │
  └─────────────────────────────────────────────────────┘
                │
                ▼
  ┌─────────────────────────────────────────────────────┐
  │ React Query Cache                                   │
  │   ['agents'] → stale（下次渲染时后台刷新）            │
  └─────────────────────────────────────────────────────┘
                │
                ▼
  ┌──────────────────────────────────────────────────────┐
  │ M3 GroupSandbox（用户切换到沙盒页面）                  │
  │   const { data: agents } = useQuery(['agents'])      │
  │   → React Query 检测到 stale → 后台 GET /api/agents  │
  │   → 返回包含"小明"的最新列表                          │
  │   → AgentStatusPanel 自动显示小明                    │
  └──────────────────────────────────────────────────────┘
                │
                ▼
  Step 2: 用户在 M3 投放小明 → 模拟运行
  ┌──────────────────────────────────────────────────────┐
  │ M3 GroupSandbox                                      │
  │   1. POST /api/worlds { agent_ids: [小明] }          │
  │      → invalidate(['worlds'])                        │
  │   2. POST /api/worlds/{id}/start                     │
  │   3. SSE /api/worlds/{id}/stream                     │
  │      → 事件写入 useSSEStore (transient)              │
  │      → 同时也写入后端 SQLite events 表                │
  │      → 世界引擎更新 emotional_state                   │
  │      → 后端 UPDATE agents SET emotional_json = ...   │
  └──────────────────────────────────────────────────────┘
                │
                ▼
  ┌──────────────────────────────────────────────────────┐
  │ M6 ControlPanel（用户切换到仪表盘）                    │
  │   const { data: agents } = useQuery(['agents'])      │
  │   → 小明的 emotional_state 已经变了（后端已更新）      │
  │   → 仪表盘显示最新的情绪状态                           │
  └──────────────────────────────────────────────────────┘
```

**关键：不需要 M3 和 M6 之间直接通信。** 数据流是 M3 → 后端 SQLite → React Query invalidation → M6 自动刷新。

### 0.5 各模块的数据读写矩阵

| 模块 | 读取（useQuery key） | 写入（useMutation） | 写入后 invalidate |
|------|---------------------|---------------------|-------------------|
| **M1 铸造厂** | `['agents']` | `POST /api/agents` | `['agents']` |
| **M2 单人剧场** | `['agents']`, `['worlds', id]` | `POST /api/worlds`, `POST /start` | `['worlds']` |
| **M3 群体沙盒** | `['agents']`, `['worlds', id]` | `POST /api/worlds`, `POST /start` | `['worlds']` |
| **M4 竞技场** | `['agents']`, `['arenas']` | `POST /api/arenas/debate` | `['arenas']` |
| **M5 叙事** | `['agents']`, `['worlds', id]`, `['narratives']` | `POST /api/narratives/*` | `['narratives']` |
| **M6 控制台** | `['agents']`, `['worlds', id]` | — (只读) | — |
| **M7 干预台** | `['worlds', id]` | `POST /api/worlds/{id}/inject` | `['worlds', id]` |
| **M8 档案馆** | `['agents']`, `['simulations']`, `['arenas']`, `['achievements']` | `POST /api/export/*` | — |

**规则：每个模块的 mutation 必须声明它 invalidate 哪些 query key。这保证了"一处修改，处处同步"。**

### 0.6 前端 API 层统一封装

> 不再让每个页面自己写 `fetch()`。所有 API 调用收敛到 `frontend/src/api/` 目录。

```
frontend/src/api/
├── client.ts          # 基础 fetch 封装（base URL, error handling, JSON parse）
├── agents.ts          # createAgent, listAgents, getAgent, deleteAgent, remixAgent
├── worlds.ts          # createWorld, listWorlds, getWorld, startWorld, pauseWorld, injectEvent
├── events.ts          # getWorldEvents(worldId, filters)
├── narratives.ts      # generateStory, generateDiary, generateLetter
├── arenas.ts          # runDebate, getArenaResult
├── export.ts          # exportReport
└── queryKeys.ts       # 所有 query key 的工厂函数（避免拼写错误）
```

**`queryKeys.ts` 示例：**

```typescript
// 集中管理所有 React Query key，避免各模块字符串拼写不一致
export const agentKeys = {
  all:    ['agents'] as const,
  detail: (id: string) => ['agents', id] as const,
};
export const worldKeys = {
  all:    ['worlds'] as const,
  detail: (id: string) => ['worlds', id] as const,
  events: (id: string) => ['worlds', id, 'events'] as const,
};
export const arenaKeys = {
  all:    ['arenas'] as const,
  detail: (id: string) => ['arenas', id] as const,
};
// ... 其余同理
```

**`agents.ts` 示例：**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { client } from './client';
import { agentKeys } from './queryKeys';

// Query: 获取所有 Agent（所有模块共享此 hook）
export function useAgents() {
  return useQuery({
    queryKey: agentKeys.all,
    queryFn: () => client.get<AgentResponse[]>('/api/agents'),
  });
}

// Mutation: 创建 Agent
export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (desc: string) =>
      client.post<AgentResponse>('/api/agents', { description: desc }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
      // 创建 Agent 后，所有 useAgents() 的消费者自动刷新
    },
  });
}
```

**页面消费方式（以 AgentFoundry 为例）：**

```typescript
// 极简——数据获取和缓存同步全部由 hooks 处理
function AgentFoundry() {
  const { data: agents } = useAgents();           // 共享缓存
  const createAgent = useCreateAgent();            // 自动 invalidate

  return (
    <div>
      {agents?.map(a => <AgentCard key={a.id} agent={a} />)}
      <button onClick={() => createAgent.mutate(input)}>创建</button>
    </div>
  );
}
```

**Mock 模式保留（开发/测试用）：**

```typescript
// api/client.ts 中
const USE_MOCK = import.meta.env.VITE_MOCK_API === 'true';

// Mock interceptor
if (USE_MOCK) {
  // 拦截 client.get/post → 返回 mock 数据
  // 生产构建时 VITE_MOCK_API 不设置 → 走真实 fetch
}
```

Mock 开关从"每个页面各自 mockData 参数"收敛到"一个环境变量全局控制"，各模块不再各自判断。

### 0.7 SSE 事件与数据同步

SSE 事件流是"实时数据"，处理方式不同于 REST：

```
SSE Event 到达前端
  │
  ├─→ 写入 useSSEStore (Zustand transient)
  │     events[] 上限 500 条
  │     用于：思维流实时滚动、事件流实时展示
  │
  ├─→ 附带更新 side-effect：
  │     relationship_change → 更新 RelationshipGraph
  │     agent_action → 更新 AgentStatusPanel
  │     tick_boundary → 更新 tick 计数器
  │
  └─→ 模拟结束后（status=finished）：
        invalidate(['worlds', worldId])
        invalidate(['agents'])  ← 因为 emotional_state 变了
        清空 useSSEStore.events
        后续读取走 GET /api/worlds/{id}/events（持久化数据）
```

### 0.8 与当前代码的对照

| 当前问题 | 架构要求 | 涉及 Step |
|----------|---------|-----------|
| `useAvailableAgents()` 6 处重复 → 各自 merge MOCK_AGENTS + store | 统一 `useAgents()` hook，数据源唯一 | Step 36 |
| AgentStore (Zustand) 存 Agent 列表 | Agent 列表走 React Query cache，Zustand 只存 UI 状态 | Step 35, 36 |
| 每个页面 mockData 参数控制 Mock/真实 | 全局 `VITE_MOCK_API` 环境变量 + `api/client.ts` 拦截 | Step 29–34 |
| API 调用散落各页面（fetch 直接写） | 收敛到 `frontend/src/api/` 目录 | Step 36 |
| 无 query key 管理 → 字符串拼写不一致 | `api/queryKeys.ts` 工厂函数 | Step 36 |
| SSE events 和 REST events 无关联 | SSE transient → 结束后 flush → REST 读取 | Step 33 |
| 无 cross-module invalidation | 每个 mutation 声明 invalidate 哪些 key | Step 29–34 |

---

## Phase 10: 前后端联通

> **目标：** 逐个关掉 Mock 开关。从最简单的链路开始（Agent 创建），逐模块推到最复杂的链路（群体沙盒 SSE）。
>
> **策略：** 每步改最少的代码，验证一个链路。不做大爆炸式改动。
>
> **前提：** 后端 `python run.py` 可启动，前端 `npm run dev` 可启动，Vite proxy 已配置 `/api → localhost:8000`。

---

### Step 29 — Agent 创建链路打通 + API 层初始化

> **Plan 对应：** 前端 Step 17（AgentFoundry）+ 后端 Step 03（PersonaBuilder）+ Step 05（AgentFactory）
> **目标：** 输入一句话 → 后端调真 LLM → 返回真实 Persona → 前端展示。
> **同时建立 `frontend/src/api/` 目录**，作为后续所有 Step 的 API 调用基础设施。
> **估时：** 2 小时（含 API 层初始化）

#### 输入/输出

```
输入（前端用户操作）：
  description: str  # "来自小镇的计算机系新生，内向但野心大"

中间（后端处理）：
  POST /api/agents { description: str }
  → AgentFactory.create_from_description()
  → PersonaBuilder.build() → LLM API 调用
  → Persona JSON → LifeAgent 封装
  → INSERT INTO agents (...) → 返回 AgentResponse

输出（前端展示）：
  AgentResponse { id, name, persona, background, goals, emotional_state, energy }

数据同步（遵循 §0.4 跨模块数据流）：
  useCreateAgent().mutate(description)
    → onSuccess: invalidate(['agents'])
    → 所有 useAgents() 消费者自动刷新
    → M3/M4/M5/M6/M8 打开时自动看到新 Agent
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/api/client.ts` | **新建** | 基础 fetch 封装（base URL, JSON parse, error） |
| `frontend/src/api/queryKeys.ts` | **新建** | 所有 query key 工厂函数（先建 agentKeys, worldKeys） |
| `frontend/src/api/agents.ts` | **新建** | `useAgents()`, `useCreateAgent()`, `useAgent(id)`, `useDeleteAgent(id)` |
| `frontend/src/main.tsx` | 修改 | 包裹 `<QueryClientProvider>`（非 App.tsx——App 在 main.tsx 内部已嵌套） |
| `frontend/src/pages/AgentFoundry.tsx` | 修改 | 用 `useCreateAgent` + `useAgents` 替换旧的 `useApi(mockData)`；Zustand 双写过渡 |
| `frontend/src/pages/Arena.test.tsx` | 修改 | 补 `QueryClientProvider` 包裹 `render(<App />)` |
| `backend/src/llm/client.py` | 修改 | 加 `model_info` TypedDict——DeepSeek 等非 OpenAI 模型必须传此参数 |
| `.env` | **新建** | LLM 配置模板（`LLM_API_KEY` / `LLM_BASE_URL` / `LLM_MODEL`） |

> **实现发现：** `@tanstack/react-query` 已在 State 1 预装（v5.51.0），无需修改 `package.json`。
> AutoGen `OpenAIChatCompletionClient` 对非 OpenAI 模型必须通过 `**kwargs` 传入 `model_info: {vision, function_calling, json_output, family, structured_output}`，否则抛出 `ValueError: model_info is required`。

#### 新建文件详情

**`frontend/src/api/client.ts`：**

```typescript
// 统一 HTTP 客户端。所有 API 调用走此模块，不直接写 fetch。
const BASE = "/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, err.detail ?? "Unknown error");
  }
  return res.json();
}

export const client = {
  get:    <T>(path: string) => request<T>("GET", path),
  post:   <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put:    <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};
```

**`frontend/src/api/queryKeys.ts`：**

```typescript
// 集中管理所有 React Query key。禁止各模块手写字符串。
export const agentKeys = {
  all:    ["agents"] as const,
  detail: (id: string) => ["agents", id] as const,
};
export const worldKeys = {
  all:    ["worlds"] as const,
  detail: (id: string) => ["worlds", id] as const,
  events: (id: string) => ["worlds", id, "events"] as const,
};
// 后续 Step 30-34 逐步追加 arenaKeys, narrativeKeys, simulationKeys...
```

**`frontend/src/api/agents.ts`：**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { agentKeys } from "./queryKeys";

export function useAgents() {
  return useQuery({
    queryKey: agentKeys.all,
    queryFn: () => client.get<AgentResponse[]>("/api/agents"),
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => client.get<AgentResponse>(`/api/agents/${id}`),
    enabled: !!id,
  });
}

export function useCreateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (description: string) =>
      client.post<AgentResponse>("/api/agents", { description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
      // invalidate(['agents']) → 所有模块的 useAgents() 自动刷新
    },
  });
}

export function useDeleteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.delete(`/api/agents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.all });
    },
  });
}
```

**AgentFoundry 改后代码（精简）：**

```typescript
function AgentFoundry() {
  const { data: agents } = useAgents();          // ← 共享缓存，其他模块也用这个
  const createAgent = useCreateAgent();           // ← onSuccess 自动 invalidate

  async function handleCreate() {
    try {
      await createAgent.mutateAsync(input);       // 调真实 POST /api/agents
      setInput("");                                // 清空输入
    } catch (e) {
      // 错误展示（LLM 挂了、网络错误等）
    }
  }

  return (
    <div>
      {agents?.map(a => <AgentCard key={a.id} agent={a} />)}
      <button onClick={handleCreate} disabled={createAgent.isLoading}>
        {createAgent.isLoading ? "创建中..." : "✨ 创建 Agent"}
      </button>
    </div>
  );
}
```

#### 验收标准

- [ ] `frontend/src/api/client.ts`, `queryKeys.ts`, `agents.ts` 三个文件存在
- [ ] `App.tsx` 包裹了 `<QueryClientProvider>`
- [ ] 前端输入描述 → 点创建 → 2-5 秒返回真实 Agent
- [ ] 连续创建 2 个不同描述 → 2 个结果各不相同
- [ ] 创建后切换到其他页面再切回 → Agent 列表仍显示（React Query cache 正常）
- [ ] LLM API Key 未配置时，前端显示明确错误提示
- [ ] `POST /api/agents` 在 Swagger UI 可独立测试
- [ ] 后端测试全量通过

---

### Step 30 — Narratives API 路由

> **Plan 对应：** 后端 Step 15（NarrativeEngine），Blueprint §5.1 API 设计
> **目标：** 把已完成的 NarrativeEngine 暴露为 REST 端点
> **估时：** 2 小时

#### 背景

`backend/src/engines/narrative/engine.py` 已完整实现：
- `NarrativeEngine.generate(req: NarrativeRequest) → NarrativeResponse`
- 4 种风格：STORY / DIARY / LETTER / PODCAST
- 4 套 Prompt 模板在 `templates.py`

但是 `main.py` 中没有 narrative 路由——引擎是孤岛。

#### 新建文件

**`backend/src/api/narratives.py`**

```python
# === 输入/输出接口 ===

# 请求体
class NarrativeRequest(BaseModel):
    style: str               # "story" | "diary" | "letter" | "podcast"
    agent_id: str            # 叙事以哪个 Agent 的口吻生成
    world_id: str            # 用于获取事件
    target: str | None = None  # letter 的收信人 / podcast 的主题

# 响应体
class NarrativeResponse(BaseModel):
    title: str
    content: str             # 叙事正文
    style: str
    agent_id: str
    generated_at: str
```

```python
# === 路由 ===
router = APIRouter(prefix="/api/narratives", tags=["narratives"])

@router.post("/story", response_model=NarrativeResponse)
async def generate_story(req: NarrativeRequest):
    """生成第一人称短篇小说"""
    ...

@router.post("/diary", response_model=NarrativeResponse)
async def generate_diary(req: NarrativeRequest):
    """生成 Agent 日记"""
    ...

@router.post("/letter", response_model=NarrativeResponse)
async def generate_letter(req: NarrativeRequest):
    """生成未来的信"""
    ...
```

#### 修改文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/narratives.py` | **新建** | 叙事 API 路由 |
| `backend/src/api/__init__.py` | 修改 | 导出 narrative_router |
| `backend/src/main.py` | 修改 | `app.include_router(narratives.router)` |

#### Mock 数据

```python
# tests/test_narratives_api.py
MOCK_NARRATIVE_REQUEST = {
    "style": "story",
    "agent_id": "test-agent-1",
    "world_id": "test-world-1",
}
```

#### 验收标准

- [ ] Swagger UI `/docs` 可见 3 个叙事端点
- [ ] `POST /api/narratives/story` 返回 800-1500 字中文叙事
- [ ] `POST /api/narratives/diary` 返回 300-500 字日记
- [ ] `POST /api/narratives/letter` 返回叙事
- [ ] 叙事口吻与 Agent persona 一致
- [ ] LLM 调用失败时返回 500 + 错误信息
- [ ] 后端测试通过

---

### Step 31 — Arenas + Events API

> **目标：** ArenaEngine 暴露为 REST + 历史事件查询端点
> **估时：** 2 小时

#### 31a. Arenas API

**新建 `backend/src/api/arenas.py`：**

```python
# === 请求体 ===
class ArenaCreate(BaseModel):
    mode: str               # "debate" | "interview" | "pitch"
    agent_a_id: str
    agent_b_id: str
    topic: str              # 辩论主题 / 面试岗位 / 路演项目
    rounds: int = 3

# === 响应体 ===
class ArenaResponse(BaseModel):
    id: str
    mode: str
    winner_id: str
    scores: dict[str, float]         # {agent_id: total_score}
    score_breakdown: dict[str, dict] # {agent_id: {category: score}}
    judge_reasoning: str
    transcript: list[dict]           # 完整发言记录
    created_at: str

router = APIRouter(prefix="/api/arenas", tags=["arenas"])

@router.post("/debate", response_model=ArenaResponse)
async def run_debate(req: ArenaCreate):
    """运行一场竞技"""
    ...

@router.get("/{arena_id}", response_model=ArenaResponse)
async def get_arena_result(arena_id: str):
    """获取竞技结果"""
    ...
```

#### 31b. Events API + Relationships API

**修改 `backend/src/api/worlds.py`，新增：**

```python
@router.get("/{world_id}/events", response_model=list[SimEvent])
async def get_world_events(
    world_id: str,
    tick_from: int = 0,
    tick_to: int | None = None,
    type: str | None = None,
):
    """查询世界的历史事件（从 SQLite）"""
    ...

@router.get("/{world_id}/relationships")
async def get_world_relationships(world_id: str):
    """获取当前关系网络快照 → {nodes: [{id, name}], edges: [{source, target, score}]}"""
    # 从 WorldEngine.relationships dict 序列化，供前端 RelationshipGraph 首次加载
    ...
```

#### 31c. Simulations API

**新建 `backend/src/api/simulations.py`：**

```python
@router.get("/{simulation_id}", response_model=SimulationResponse)
async def get_simulation(simulation_id: str):
    """获取模拟详情"""
    ...

@router.get("/", response_model=list[SimulationResponse])
async def list_simulations(world_id: str | None = None):
    """列出模拟记录"""
    ...
```

#### 涉及文件

| 文件 | 操作 |
|------|------|
| `backend/src/api/arenas.py` | 新建 |
| `backend/src/api/simulations.py` | 新建 |
| `backend/src/api/worlds.py` | 修改：加 `GET /{id}/events` + `GET /{id}/relationships` |
| `backend/src/main.py` | 修改：注册 arenas, simulations 路由 |
| `backend/src/engines/agent_factory/factory.py` | 修改：简化 AutoGen name 策略（见下） |
| `backend/tests/test_agent_factory.py` | 修改：适配新 name 策略 |

#### 实现发现

- **AutoGen name 简化：** 原 `_sanitize_agent_name` 试图保留中文名含义，但 AutoGen `AssistantAgent` 只接受 `^[a-zA-Z0-9_-]+$`。最终策略：`agent_{id后8位}`，简单唯一。`persona.name`（中文）仅在 UI 展示，不影响内部路由。
- **Arena 辩论 500 系列问题：** 根因是中文名 sanitize 不彻底导致 `ValueError: Invalid name / participant names must be unique`。已通过统一用 ID 后缀解决。
- **Transcript 内容过长 (#22a)：** `str(content)[:500]` 硬截断 + Agent 倾向输出长篇独白。记入 Step 46 #22a，届时修复 prompt 引导 + 移除硬截断。

#### 验收标准

- [x] 两个 Agent 辩论 → 返回完整 transcript + 裁判评分
- [x] `GET /api/worlds/{id}/events` 从 SQLite 查询事件（支持 tick_from/tick_to/type 过滤）
- [x] `GET /api/worlds/{id}/relationships` 返回活跃 World 的关系快照
- [x] `GET /api/simulations` 返回模拟列表
- [x] 后端测试 194/194 通过

### Step 32 — 单人剧场 SSE 打通

> **目标：** SoloTheater 页面连上真实后端 SSE，看到真实 Agent 思维流
> **状态：** ✅ done

#### 实际产出

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/SoloTheater.tsx` | 修改 | 全链路真 API：useAgents → createWorld → startWorld → useSSE；pause/resume/end 状态管理 |
| `frontend/src/hooks/useSSE.ts` | 重写 | EventSource 连接 + 断线补发 + id 去重 |
| `frontend/src/api/worlds.ts` | 修改 | 新增 useResetWorld, useWorldEvents |
| `frontend/src/types/events.ts` | 修改 | SSEEventType 加 connected/paused/error/session_end |
| `frontend/src/components/agent/ThoughtBubble.tsx` | 修改 | 基础设施事件跳过渲染；session_end 气泡 |
| `frontend/src/components/world/EventFeed.tsx` | 修改 | 新类型占位 |
| `backend/src/api/sse.py` | 修改 | while 连续推流；paused 轮询；tick 上限 + session_end；name_map 填充 agent_name |
| `backend/src/api/worlds.py` | 修改 | POST /{id}/reset；start 支持 paused→running |
| `backend/src/engines/world/engine.py` | 修改 | solo prompt 优化；extract 拆 thought_stream+agent_message；WorldEngine 清空 AutoGen 上下文 |
| `backend/src/engines/agent_factory/factory.py` | 修改 | inject_context 清空 _messages（隔离 tick 间上下文） |

#### 实现发现

- **字段对齐已在 `_event_to_dict` 完成：** `source_agent_id → agent_id`、`description → content`、`name_map` 填充 `agent_name`。
- **Prompt 迭代：** 原 `"请描述你现在的想法"` → `"直接说出你的内心想法——不要分析自己"`。Agent 还是倾向元分析，但配合 tick 上限+thought/speech 分离后体验可用。
- **Pause/Resume 方案演变：** 第一版 disconnect+重连（409 风暴）→ 第二版 paused 轮询但 disconnect 导致断线 → 最终版 paused 轮询 + 保持连接 + 前端 `isPaused` 状态切换按钮。
- **上下文隔离：** AutoGen `AssistantAgent` 的 `_model_context._messages` 在 WorldEngine 创建和每次 inject_context 时清空——切换场景、新 tick 不再泄漏旧对话。
- **Tick 上限 8：** 单人模式无社交终止条件，纯自循环会无限运行。8 tick 后推送 `session_end` 并设置 `world.status = "finished"`。
```

#### 验收标准

- [ ] SoloTheater：选 Agent → 选场景 → 点开始
- [ ] 思维流真实滚动（非 Mock 预写数据）
- [ ] Agent 的思考/决策/行动正确分阶段显示
- [ ] 暂停按钮调 `POST /api/worlds/{id}/pause`
- [ ] 重置按钮调后端重置
- [ ] EventSource 断线自动重连

---

### Step 33 — 群体沙盒 SSE 打通 + 竞争博弈资源模型

> **目标：** GroupSandbox 页面真正驱动 AutoGen GroupChat，看到多 Agent 互动。
> **同时补齐 #18（竞争博弈）：** WorldEngine 注入资源状态，Agent 在有限资源下产生策略竞争。
> **估时：** 3 小时

#### 修改文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/GroupSandbox.tsx` | 修改 | 删除 `useSandboxMockSSE()`（168–218 行），替换为 `useSSE(worldId)` |
| `frontend/src/components/world/RelationshipGraph.tsx` | 修改 | 从 SSE 的 `relationship_change` 事件增量更新图；首次加载调 `GET /api/worlds/{id}/relationships` |
| `frontend/src/stores/useSSEStore.ts` | 检查 | 确认 500 条上限 + relationship state |
| `backend/src/engines/world/engine.py` | 修改 | `_build_world_context` 加资源状态注入（#18） |

#### 竞争博弈资源模型（#18 补全）

在 `WorldEngine._build_world_context()` 注入场景资源状态：

```python
# 期末周场景示例——座位是有限资源
def _build_world_context(self) -> str:
    context = f"""⏰ 第 {self.current_tick} 个时间段
📍 地点: {self.world.scenario.environment_params.get('location', '未知')}
"""
    # 资源建模：场景定义资源，随着 Agent 行动消耗
    if "stress_level" in self.world.scenario.environment_params:
        seats = max(0, 100 - self.current_tick * 3)  # 每 tick 减少
        context += f"📊 资源状态: 图书馆剩余座位 {seats} 个"
    
    return context
```

Agent 在 system prompt 中看到资源稀缺 → 自然产生抢占/合作/放弃等策略行为 → `relationships.py` 检测 competitive 关键词 → 关系变化。不需要单独的"竞争引擎"，资源信息 + 人格差异 = 涌现竞争。

#### 前端逻辑

```typescript
// GroupSandbox.tsx 改造后：

// 1. 用 useSSE hook 替换 inline mock
const { events, connected } = useSSE(worldId);

// 2. 速度控制通过后端 tick 频率实现（或前端 throttle）
// 暂停 = 断开 SSE + POST /api/worlds/{id}/pause
// 继续 = 重连 SSE
```

#### 关键问题处理

**Q: 多 Agent 场景下 EventSource 每 tick 只推一个 tick → 自动重连才推进下一个 tick。这个设计对吗？**

A: 当前后端 `tick_stream()` 的设计是每个 SSE 连接跑一个 tick（yield 完 `tick_boundary` 后 return）。EventSource 自动重连机制恰好形成"一轮一轮推进"的效果。如果体验不好（每 tick 有连接断开间隔），可以改为 `tick_stream` 连续跑多个 tick。

**方案（优先不改后端，先验证效果）：** 如果重连间隔过大，在 `sse.py` 的 `world_event_stream` 中改为 while 循环连续跑 tick。

#### 验收标准

- [ ] GroupSandbox：选 3 个 Agent → 选场景 → 点开始
- [ ] 多 Agent 的 think/decide/act/message 在思维流中正确显示
- [ ] 时间线/事件流从 SSE 事件渲染
- [ ] 关系网络图首次加载调 `GET /api/worlds/{id}/relationships`，后续 SSE 增量更新
- [ ] **竞争博弈（#18）：** 期末周场景中资源状态注入 → Agent 行为体现竞争策略 → relationship 检测到 competitive 事件
- [ ] 暂停/继续/速度控制正常
- [ ] 前端不再有 `useSandboxMockSSE` 函数

---

### Step 34 — 叙事 + 竞技 + 干预联通

> **目标：** 剩余 3 个模块切换到真实 API
> **估时：** 3 小时

#### 34a. 叙事工厂联通

**文件：** `frontend/src/pages/NarrativeFactory.tsx`

```typescript
// BEFORE (line 58):
const result = getMockNarrative(agentId, styleKey);

// AFTER:
const result = await fetchNarrative({
  style: styleKey,        // "story" | "diary" | "letter" | "podcast"
  agent_id: agentId,
  world_id: selectedWorldId,
  target: target || undefined,
});
```

保留 `NARRATIVE_STYLES` 中 `available: false` 的选项（P3 占位）。

#### 34b. 竞技场联通

**文件：** `frontend/src/pages/Arena.tsx`

```typescript
// BEFORE (line 107):
const mockResult = buildMockArenaResult(config, agentA, agentB);

// AFTER:
const result = await runDebate({
  mode: "debate",
  agent_a_id: agentA.id,
  agent_b_id: agentB.id,
  topic: topic,
  rounds: 3,
});
```

后端 `ArenaEngine` 需要补 `run_interview()` 和 `run_pitch()` 方法（枚举已定义，实现缺失）。

#### 34c. 干预台联通

**文件：** `frontend/src/pages/DirectorIntervention.tsx`

```typescript
// BEFORE (line 47-48):
const record = createInjectionRecord(...);

// AFTER:
const result = await fetch(`/api/worlds/${worldId}/inject`, {
  method: "POST",
  body: JSON.stringify({ description: eventDescription }),
});
```

#### 涉及文件

| 文件 | 操作 |
|------|------|
| `frontend/src/pages/NarrativeFactory.tsx` | 修改 |
| `frontend/src/pages/Arena.tsx` | 修改 |
| `frontend/src/pages/DirectorIntervention.tsx` | 修改 |
| `backend/src/engines/arena/engine.py` | 修改：加 `run_interview()`, `run_pitch()` |

#### 验收标准

- [ ] NarrativeFactory：选 Agent + 风格 + World → 生成真实叙事（非 Mock 预写文本）
- [ ] Arena：两个 Agent 辩论 → 真实对话 + 裁判评分
- [ ] DirectorIntervention：注入事件 → 后端接收 → SSE 推送给对应 World
- [ ] 所有模块错误状态正确展示（API 不可用、超时等）

---

### Step 34-W — World 管理完善

> **目标：** 解决 Step 34 验收中暴露的 World 管理问题——无法查看/切换/删除已有 World，setup 页没有入口。
> **估时：** 2 小时

#### 问题背景

`useSandboxStore` 只能追踪一个 `activeWorldId`，用户无法：
- 查看之前创建的所有 World 及其运行状态
- 切换到另一个暂停中的 World 继续
- 删除不需要的 World

#### 改动方案

**后端：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/worlds.py` | 修改 | 新增 `DELETE /{id}` 端点 |

**前端：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/world/SandboxSetup.tsx` | 修改 | 改为两段式：上半部分列出已有 World（状态 + 继续/删除按钮），下半部分新建表单 |
| `frontend/src/pages/GroupSandbox.tsx` | 修改 | 从列表 resume World；去掉挂载自动恢复逻辑 |
| `frontend/src/api/worlds.ts` | 修改 | 新增 `useDeleteWorld` mutation hook |
| `frontend/src/stores/useSandboxStore.ts` | 删除 | 不再需要（用户显式选择 World 进入） |

#### 验收标准

- [ ] SandboxSetup 顶部显示所有已有 World 列表（状态图标 + tick 数 + Agent 数）
- [ ] 点击已有 World 的「继续」→ 直接 resume 该 World
- [ ] 点击已有 World 的「删除」→ `DELETE /api/worlds/{id}` → 从列表移除
- [ ] 下半部分新建表单功能不变
- [ ] 沙盒页面不再自动恢复——由用户显式选择

---

### Step 34-S — 场景自定义

> **目标：** 用户可创建、编辑、删除自定义场景，SandboxSetup 和 SoloTheater 均可选用。
> **估时：** 1.5 小时

#### 问题背景

当前只有 3 个硬编码场景（新生报到、期末周、毕业选择），用户无法定义自己的实验场景。

#### 改动方案

**后端：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/scenarios.py` | **新建** | `GET /api/scenarios`（内置+自定义）、`POST /api/scenarios`（创建）、`DELETE /api/scenarios/{id}`（删除自定义） |
| `backend/src/engines/world/scenarios.py` | 修改 | 自定义场景存内存 dict（Step 35 迁 SQLite） |
| `backend/src/main.py` | 修改 | 注册 scenarios router |

**前端：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/api/scenarios.ts` | **新建** | `useScenarios()`、`useCreateScenario()`、`useDeleteScenario()` |
| `frontend/src/api/queryKeys.ts` | 修改 | +`scenarioKeys` |
| `frontend/src/components/world/SandboxSetup.tsx` | 修改 | 场景选择区含自定义场景 + "新建场景"入口 |
| `frontend/src/pages/SoloTheater.tsx` | 修改 | 场景选择同上 |

#### 验收标准

- [ ] 场景列表 = 3 个内置 + 用户自定义
- [ ] 可创建自定义场景（名称、描述、时间范围、初始事件、环境参数）
- [ ] 可删除自定义场景（内置场景不可删）
- [ ] SandboxSetup 和 SoloTheater 均可选自定义场景
- [ ] 新建场景后下拉列表立即刷新

---

### Step 35 — 持久化 + 鲁棒性

> **目标：** 服务重启不丢数据，LLM 挂了不卡死
> **估时：** 3 小时

#### 35a. Agent/World 持久化

| 文件 | 当前 | 改为 |
|------|------|------|
| `api/agents.py` 23-42 | `AgentStore` = dict | SQLite CRUD |
| `api/worlds.py` 31-43 | `WorldStore` = dict | SQLite CRUD |
| `api/worlds.py` 128 | `start_world` 不用 BackgroundTasks | 加 background_tasks.add_task(engine.run) |

#### 35b. LLM 鲁棒性

**新建 `backend/src/llm/fallback.py`：**

```python
# 对应 Blueprint §10.4
class LLMFallback:
    """LLM 调用失败时的兜底策略"""
    
    async def call_with_fallback(self, prompt, model_client):
        try:
            return await asyncio.wait_for(
                model_client.create(prompt),
                timeout=30.0,
            )
        except asyncio.TimeoutError:
            logger.warning("LLM timeout, using default action")
            return DEFAULT_ACTION  # "继续当前活动"
        except RateLimitError:
            return await fallback_client.create(prompt)
        except APIError:
            logger.error("LLM API error, agent skipped this tick")
            return DEFAULT_ACTION
```

#### 35c. SSE 断线重连补偿

```typescript
// 前端 useSSE.ts 加：
// EventSource 重连后，发一条请求补发最近 N 条事件
es.addEventListener('open', async () => {
  const recentEvents = await fetch(
    `/api/worlds/${worldId}/events?tick_from=${lastTick - 5}`
  );
  // 去重合并到 store
});
```

#### 验收标准

- [ ] 创建 Agent → 重启后端 → Agent 仍在列表中
- [ ] 创建 World → 重启 → World 可查询
- [ ] LLM API 超时 → Agent 不卡死，返回默认行为
- [ ] SSE 断开重连 → 不丢事件
- [ ] 后端测试全量通过

---

## Phase 11: 前端架构重整

> Phase 10 联调结束后，前后端可以真实对话了。此时做前端重构——既有 Mock 和真实两套模式的经验，知道哪些是真正需要的抽象。

---

### Step 36 — API 层收敛 + 重复代码消除

> **对应数据架构 §0.6（API 层统一封装）+ 审计问题 A1.1–A1.4**
> **目标：** Step 29 建了 `api/agents.ts`，本步补完全部 API 模块 + 消除所有代码重复
> **估时：** 3 小时

#### 36a. API 层收敛（P0 — 先做，所有页面依赖此项）

当前问题：各页面散落 fetch 调用，query key 字符串硬编码，同一个 Agent 数据六种获取方式。

**补全 `frontend/src/api/` 目录：**

| 文件 | 导出的 hook | 消费者 |
|------|-----------|--------|
| `api/worlds.ts` | `useWorlds()`, `useWorld(id)`, `useCreateWorld()`, `useStartWorld()`, `usePauseWorld()`, `useInjectEvent()` | M2, M3, M6, M7 |
| `api/events.ts` | `useWorldEvents(worldId, filters)` | M2, M3, M6 |
| `api/narratives.ts` | `useGenerateStory()`, `useGenerateDiary()`, `useGenerateLetter()` | M5 |
| `api/arenas.ts` | `useRunDebate()`, `useArenaResult(id)`, `useArenas()` | M4, M8 |
| `api/simulations.ts` | `useSimulations()`, `useSimulation(id)` | M8 |
| `api/export.ts` | `useExportReport()` | M8 |
| `api/achievements.ts` | `useAchievements()` | M8 |

**每个 API 模块的模式（以 `api/worlds.ts` 为例）：**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "./client";
import { worldKeys, agentKeys } from "./queryKeys";

// Query
export function useWorlds() {
  return useQuery({
    queryKey: worldKeys.all,
    queryFn: () => client.get<WorldResponse[]>("/api/worlds"),
  });
}

export function useWorld(id: string) {
  return useQuery({
    queryKey: worldKeys.detail(id),
    queryFn: () => client.get<WorldResponse>(`/api/worlds/${id}`),
    enabled: !!id,
  });
}

// Mutation — 注意 invalidate 的传播链
export function useCreateWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: WorldCreate) =>
      client.post<WorldResponse>("/api/worlds", req),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: worldKeys.all });
    },
  });
}

export function useStartWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (worldId: string) =>
      client.post(`/api/worlds/${worldId}/start`),
    onSuccess: (_data, worldId) => {
      qc.invalidateQueries({ queryKey: worldKeys.detail(worldId) });
    },
  });
}

export function usePauseWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (worldId: string) =>
      client.post(`/api/worlds/${worldId}/pause`),
    onSuccess: (_data, worldId) => {
      qc.invalidateQueries({ queryKey: worldKeys.detail(worldId) });
    },
  });
}

export function useInjectEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ worldId, description }: { worldId: string; description: string }) =>
      client.post(`/api/worlds/${worldId}/inject`, { description }),
    onSuccess: (_data, { worldId }) => {
      qc.invalidateQueries({ queryKey: worldKeys.events(worldId) });
      qc.invalidateQueries({ queryKey: worldKeys.detail(worldId) });
    },
  });
}
```

**`queryKeys.ts` 补全：**

```typescript
export const arenaKeys = {
  all:    ["arenas"] as const,
  detail: (id: string) => ["arenas", id] as const,
};
export const narrativeKeys = {
  all:    ["narratives"] as const,
};
export const simulationKeys = {
  all:    ["simulations"] as const,
  detail: (id: string) => ["simulations", id] as const,
};
```

**替换策略：每个页面逐一替换，替换后重跑测试。**

| 页面 | 当前写法 | 替换为 |
|------|---------|--------|
| AgentFoundry | `useApi("POST", "/api/agents", { mockData })` | `useCreateAgent()` + `useAgents()` |
| SoloTheater | `useMockSSE()` | `useWorlds()` + `useCreateWorld()` + `useStartWorld()` + `useSSE(worldId)` |
| GroupSandbox | `useSandboxMockSSE()` (内联 168 行) | 同 SoloTheater 模式 |
| Arena | `buildMockArenaResult()` | `useRunDebate()` |
| NarrativeFactory | `getMockNarrative()` | `useGenerateStory()` 等 |
| ControlPanel | 直接 import MOCK 数据 | `useAgents()` + `useWorldEvents()` |
| DirectorIntervention | 内联 createInjectionRecord | `useInjectEvent()` |
| Archive | `fetch("/api/worlds")` + fallback | `useWorlds()` + `useSimulations()` + `useAchievements()` |

#### 36b. 重复代码消除

| 子任务 | 产出 | 消除重复 |
|--------|------|---------|
| 删除 `useAvailableAgents()` 6 处内联 | 统一使用 `useAgents()`（Step 29 已建） | A1.1 |
| 统一 Mock SSE → `useSSE` 加 mock 模式参数 | `useSSE(worldId, { mock: true })` | A1.2 |
| 抽取 `formatISODate` | `utils/formatDate.ts` | A1.3 |
| 抽取 `useAutoScroll` | `hooks/useAutoScroll.ts` | A1.4 |

#### 涉及文件汇总

| 文件 | 操作 |
|------|------|
| `frontend/src/api/worlds.ts` | 新建 |
| `frontend/src/api/events.ts` | 新建 |
| `frontend/src/api/narratives.ts` | 新建 |
| `frontend/src/api/arenas.ts` | 新建 |
| `frontend/src/api/simulations.ts` | 新建 |
| `frontend/src/api/export.ts` | 新建 |
| `frontend/src/api/achievements.ts` | 新建 |
| `frontend/src/api/queryKeys.ts` | 修改：补全所有 key 工厂 |
| `frontend/src/utils/formatDate.ts` | 新建 |
| `frontend/src/hooks/useAutoScroll.ts` | 新建 |
| `frontend/src/hooks/useSSE.ts` | 修改：加 mock 模式参数 |
| `frontend/src/pages/AgentFoundry.tsx` | 修改 |
| `frontend/src/pages/SoloTheater.tsx` | 修改 |
| `frontend/src/pages/GroupSandbox.tsx` | 修改 |
| `frontend/src/pages/Arena.tsx` | 修改 |
| `frontend/src/pages/NarrativeFactory.tsx` | 修改 |
| `frontend/src/pages/ControlPanel.tsx` | 修改 |
| `frontend/src/pages/DirectorIntervention.tsx` | 修改 |
| `frontend/src/pages/Archive.tsx` | 修改 |
| `frontend/src/mocks/sse.ts` | 修改：删除 `useMockSSE` hook（留下数据常量） |

#### 验收标准

- [ ] `frontend/src/api/` 目录包含 8 个文件（client + queryKeys + 6 个领域模块）
- [ ] 所有 query key 字符串集中在 `queryKeys.ts`，无页面内硬编码
- [ ] 每个 API mutation 明确声明 `invalidateQueries` 目标
- [ ] 所有页面统一用 `api/` 目录下的 hook，不再直接写 fetch
- [ ] 只有一个 `useSSE` hook，无其他变体
- [ ] `utils/formatDate.ts` 存在，3 处内联删除
- [ ] `hooks/useAutoScroll.ts` 存在，2 处内联删除
- [ ] **跨模块数据同步验证：M1 创建 Agent → 切到 M3 → Agent 自动出现在可选列表**
- [ ] 前端测试全量通过

---

### Step 37 — 共享组件 + 常量抽取

> **对应审计问题：** A1.5, A6, A7, A2.1 (部分)
> **估时：** 3 小时

#### 37a. `<SelectableCard>` 组件

**新建：** `frontend/src/components/shared/SelectableCard.tsx`

```typescript
interface SelectableCardProps {
  selected: boolean;
  onClick: () => void;
  accentColor?: string;  // "green" | "blue" | "orange" | "purple"（默认 green）
  children: React.ReactNode;
  className?: string;
}
```

替换 ~15 处重复的选中按钮 CSS 模式。

#### 37b. 合并场景数据

`SoloTheater.tsx` 的 `BUILTIN_SCENARIOS` + `mocks/sandbox.ts` 的 `MOCK_SANDBOX_SCENARIOS` → 统一到 `mocks/scenarios.ts`，数据一致化（当前时间范围不一致）。

#### 37c. 合并标签常量

- `EMOTION_LABELS`（2 处）→ `constants/labels.ts`
- `DECISION_LABELS` + `DECISION_VALUE_LABELS`（2 处）→ `constants/labels.ts`

#### 37d. `<LoadingSpinner>` 组件

`AgentFoundry.tsx` 和 `NarrativeFactory.tsx` 各有一套内联 loading UI → 抽取为 `<LoadingSpinner text={...}>`。

#### 验收标准

- [ ] `<SelectableCard>` 组件存在，各处使用一致
- [ ] 场景数据单一来源（`mocks/scenarios.ts`）
- [ ] 标签常量单一来源（`constants/labels.ts`）
- [ ] 前端测试全量通过
- [ ] 视觉一致性走查（暗色主题、选中态统一）

---

### Step 38 — 大文件拆分 + 路由优化

> **对应审计问题：** A2.1, A3.1, A3.2, A5, A2.2
> **估时：** 3 小时

#### 38a. 大文件拆分

| 文件 | 行数 | 拆分方案 |
|------|------|---------|
| `mocks/narratives.ts` | 673 | 按 Agent 拆为 `narratives/mock-1.ts`, `mock-2.ts`, `mock-3.ts` |
| `pages/Archive.tsx` | 489 | 拆为 `pages/archive/HighlightsPanel.tsx`, `TemplatesPanel.tsx`, `AchievementsPanel.tsx`, `ExportPanel.tsx` |
| `pages/NarrativeFactory.tsx` | 456 | 拆 `pages/narratives/StyleSelector.tsx`, `AgentSelector.tsx`, `ResultDisplay.tsx` |
| `pages/SoloTheater.tsx` | 373 | 拆 `pages/theater/SetupPhase.tsx`, `RunningPhase.tsx`, `StatRow.tsx` |
| `mocks/control.ts` | 347 | 拆 `mocks/control/stats.ts`, `heatmap.ts`, `patterns.ts`, `search.ts` |

每个文件 ≤ 300 行。

#### 38b. 路由懒加载

```typescript
// App.tsx — React.lazy 拆分
const AgentFoundry = lazy(() => import("./pages/AgentFoundry"));
const SoloTheater = lazy(() => import("./pages/SoloTheater"));
const GroupSandbox = lazy(() => import("./pages/GroupSandbox"));
const Arena = lazy(() => import("./pages/Arena"));
const NarrativeFactory = lazy(() => import("./pages/NarrativeFactory"));
const ControlPanel = lazy(() => import("./pages/ControlPanel"));
const DirectorIntervention = lazy(() => import("./pages/DirectorIntervention"));
const Archive = lazy(() => import("./pages/Archive"));

// 包裹 Suspense
<Route path="/agents" element={<Suspense fallback={<LoadingSkeleton />}><AgentFoundry /></Suspense>} />
```

#### 38c. 死代码清理

| 删除项 | 文件 |
|--------|------|
| `useSSE` 旧版 hook（如果 Step 36 没处理完） | `hooks/useSSE.ts` |
| `SimEvent`, `ThoughtEvent` 等未使用接口 | `types/events.ts` 12-43 |
| `WorldCreate` | `types/world.ts` 12-16 |
| `ExportConfig` | `types/archive.ts` 62-68 |
| 8 个未使用的 Props 接口 | `types/archive.ts`, `types/control.ts` |
| `SSEDebug` 页面 | `pages/debug/SSEDebug.tsx` |
| `.gitkeep` | `components/world/.gitkeep` |

#### 38d. 路由统一（降低优先级—可在 Phase 12 做）

将 hash fragment 导航（`#item-N`）迁移为 React Router search params（`?feature=N`），消除 Arena 和 FeatureRouteBoundary 中的重复 hash 解析。

#### 验收标准

- [ ] 每个拆分后的文件 ≤ 300 行
- [ ] 8 个模块页面全部懒加载
- [ ] 生产包首屏 < 400KB
- [ ] 无未使用类型/组件的 import
- [ ] 前端测试全量通过
- [ ] 视觉走查：所有页面功能不变

---

## Phase 12: 功能补全

> Phase 10–11 完成后，基础设施健康、前后端联通。剩余工作：补齐缺失的 P1/P2 功能。

---

### Step 39 — Agent Remix + 模板库 (#6, #7)

| # | 功能 | 后端 | 前端 |
|---|------|------|------|
| 6 | Agent Remix | `POST /api/agents/{id}/remix`：接收 agent_id + 待修改 traits → LLM 生成新 Persona 但保留指定部分 | Remix UI：选已有 Agent → 调 trait slider → 预览 → 创建 |
| 7 | 模板库 | `GET /api/templates`：返回 JSON 文件中的 30+ 模板 | 模板浏览器：分类筛选 → 一键创建 |

---

### Step 40 — 目标系统 + 动态计划 (#10, #11)

| # | 功能 | 后端 | 前端 |
|---|------|------|------|
| 10 | 目标追逐 | `Goal` 加 lifecycle 状态机（active→in_progress→achieved/abandoned），tick 结束时检测目标完成条件 | SoloTheater 目标面板：进度条、完成状态变化动画 |
| 11 | 动态计划调整 | `Plan` 模型：`{id, steps: [{description, status, depends_on}], created_tick, last_updated_tick}`。世界事件触发 `plan_updated` 时重新评估 | 计划视图：步骤列表 + 变更高亮（"原计划: X → 调整为: Y"） |

---

### Step 41 — 决策回放 + 群体动力学 (#13, #19, #21)

| # | 功能 | 后端 | 前端 |
|---|------|------|------|
| 13 | 决策回放 | `GET /api/worlds/{id}/events?agent_id=X&tick=Y&type=thought`：返回某 Agent 在某个决策点的完整思考链 | 思维流气泡加"展开"按钮 → 右侧面板显示完整推理 |
| 19 | 角色冲突 | `_detect_conflict()`：基于目标冲突检测（两个 Agent 有互斥目标 → 触发冲突事件） | 冲突事件在 Timeline 中高亮显示 |
| 21 | 群体动力学 | `POST /api/narratives/report`：LLM 分析事件列表 → "谁是领导、谁被孤立、群体氛围" | 控制台新 Tab：群体动力学报告 |

---

### Step 42 — 叙事工厂完善 (#29–#32)

> Step 30 已加 API 路由，Step 34 已联通前端。本步完善体验。

| # | 功能 | 内容 |
|---|------|------|
| 29 | 小说化叙事 | 加"重新生成"→ 不同种子产生不同叙事；加"复制/下载"已有功能确认正常 |
| 30 | 未来的信 | 收信人选择 UI + 时间跨度配置 |
| 31 | 平行对话 | 后端加 `NarrativeStyle.PARALLEL` + prompt 模板 + API |
| 32 | 播客脚本 | 加"主题"配置、"嘉宾"选择 UI |

---

### Step 43 — 控制台全功能 (#36–#39)

> 所有 M6 Tab 当前 Mock 驱动。改为读真实 API。

| # | 功能 | 数据源 |
|------|------|--------|
| 36 | 仪表盘 | `GET /api/agents` 列表 + 每个 Agent 最新 emotional_state → 状态卡片矩阵 |
| 37 | 热力图 | `GET /api/worlds/{id}/events` → 客户端构建时间×Agent 矩阵 |
| 38 | 搜索 | `GET /api/agents?q=keyword`（后端加 query 参数） |
| 39 | 决策模式 | `GET /api/agents` → 客户端聚合 decision_style 分布 |

---

### Step 44 — 干预台完善 (#43, #48)

| # | 功能 | 内容 |
|------|------|------|
| 43 | 事件注入 | Step 34 已联调。本步：加注入事件类型选择器（world_event / agent_whisper / resource_change），加效果预览 |
| 48 | 干预历史 | 后端新建 `interventions` 表 + `GET /api/worlds/{id}/interventions` → 前端持久化展示 |

---

### Step 45 — 档案馆功能 (#51, #52, #54)

| # | 功能 | 数据源 |
|------|------|--------|
| 51 | 精彩回放 | `GET /api/simulations` → 最近模拟列表 → 点击回放（跳转 Sandbox 并加载历史事件） |
| 52 | 实验模板 | `GET /api/worlds?type=template` → 模板浏览/复制 |
| 54 | 成就系统 | 后端计算成就条件（创建 Agent 数、模拟 tick 数等）→ `GET /api/achievements` |

---

### Step 46 — 竞技场增强 (#22–#24, #26)

> **目标：** 竞技场从"功能可用"到"体验可用"。补 interview/pitch 模式 + 修复 Step 31 发现的辩论质量问题 + 大乱斗 + 战报。

#### 46a. 辩论内容质量修复（#22a — 来自 Step 31 验收发现）

**问题 1：transcript 硬截断。** `engine.py:128` 行 `str(content)[:500]` 导致辩论内容被切。

**修复：** 删除 `[:500]` 截断。改为在 API 响应层（`ArenaResultResponse.transcript`）对 single entry 限制上限（如 2000 字符），让完整版本存储在服务端。

**问题 2：Agent 输出偏长 + 偏题。** 当前 `task` prompt 只是简单声明正反方，Agent 把内心独白当成了发言。根源是 LifeAgent 的 system prompt 中"行为准则 2"要求内心独白真诚展示——在竞技场景下被误解为"应该长篇输出"。

**修复：** `run_debate()` 的 `task` 改为辩论专用 prompt，明确约束：

```python
task = (
    f"【辩论规则】\n"
    f"辩题: {topic}\n"
    f"正方({agent_a.persona.name}): 支持\n"
    f"反方({agent_b.persona.name}): 反对\n\n"
    f"规则:\n"
    f"1. 每人每轮只发一条消息，50-200 字\n"
    f"2. 必须回应对方上一轮的观点\n"
    f"3. 用角色口吻发言，不要输出内心推理过程\n"
    f"4. 不要写\"作为XX人格，我认为...\"——直接表达观点\n"
    f"现在开始第 1 轮，正方先发言。"
)
```

**涉及文件：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/arena/engine.py` | 修改 | 去 `[:500]` 截断；替换 task prompt |
| `backend/src/api/arenas.py` | 修改 | `ArenaResultResponse` 加 content 上限 |

**验收标准：**
- [ ] transcript 条目完整（不被 500 字符截断）
- [ ] 辩论发言 50-200 字每轮，不出现"根据我的分析"类独白
- [ ] 3 轮辩论在 30s 内完成（而非无限长输出）

#### 46b. interview / pitch 模式（#22）

**文件：** `backend/src/engines/arena/engine.py`

`run_interview()` 和 `run_pitch()` 复用 `run_debate` 的 GroupChat 结构，区别在裁判 prompt 和 task 描述。

#### 46c. 大乱斗（#23）

`POST /api/arenas/battle_royale`：6+ Agent 自由竞争，淘汰制。

#### 46d. 战报（#24）

`GET /api/arenas/{id}/report`：返回结构化 Markdown（对战概述 + 逐轮分析 + 胜负原因）。

#### 46e. 复盘对比（#26）

`GET /api/arenas?agent_id=X`：Agent 历史战绩列表 → 前端两列对比。

---

## Phase 13: 打磨与交付

---

### Step 47 — LLM 成本与性能优化

| 手段 | 实现 |
|------|------|
| 上下文压缩 | 超过 10 轮对话 → LLM 摘要前 5 轮（在 `WorldEngine._build_world_context` 中实现） |
| System Prompt 缓存 | 人格不变的 prefix 标记 `cache_control`（如果 LLM 支持） |
| 温度分级 | think 阶段 `temperature=0.8`，act 阶段 `temperature=0.5` |
| 前端虚拟滚动 | `ThoughtStream` 超过 200 条使用虚拟列表（react-window 或手写） |
| 包体积 | 确认 Step 38 懒加载后 < 400KB |

---

### Step 48 — 端到端集成测试

5 条自动化测试，验证全链路：

```
TC1: Agent 创建全链路
  POST /api/agents {description} → 201 + AgentResponse → GET /api/agents 包含新 Agent

TC2: 单人模拟全链路
  创建 Agent → POST /api/worlds → POST /api/worlds/{id}/start → GET /api/worlds/{id}/stream → 收到 thought/action 事件

TC3: 群体模拟全链路
  创建 3 Agent → POST /api/worlds → start → SSE → 每个 Agent 都有事件

TC4: 竞技全链路
  创建 2 Agent → POST /api/arenas/debate → 返回 scores + transcript

TC5: 叙事全链路
  跑完模拟 → POST /api/narratives/story → 800-1500 字叙事
```

---

### Step 49 — P3 占位页补齐

> 17 个 P3 功能全部指向统一占位组件。

在 Step 38 的 FeatureRouteBoundary 基础上，确保所有 P3 hash 项显示统一 `EmptyState`：
- 标题 = 功能名
- 描述 = 蓝图中的一句话说明
- 底注 = "P3 — State 3 开发"

**17 个 P3 功能清单：**
#25(盲测), #27(排行榜), #28(A/B), #33(微电影), #34(连载), #35(自画像),
#40(异常检测), #41(长期追踪), #42(策略提取),
#44(上帝之声), #45(时间回溯), #46(分支探索), #47(人格篡改), #49(剧本模式),
#50(Agent市场), #53(社区大屏), #56(API开放)

---

### Step 50 — 演示排练 + 最终文档

- 更新 `docs/demo-script.md` → 真实 API 主路径（去掉"使用 Mock 主链路"的降级描述）
- 更新 `README.md` → 完整的安装/启动/使用流程
- Swagger 文档补全（每个端点的 description + example）
- 至少 1 次完整彩排（按新 demo-script 走 5 分钟流程）
- 准备 LLM API Key 备用方案

---

## 附录 A: 56 项功能完整审计

> 审计日期：2026-07-20。覆盖 `backend/src/` + `frontend/src/` 全部代码。

### 图例

- ✅ DONE — 端到端全通（前端 `fetch()` → 后端 API → 引擎 → 数据持久化）
- 🟡 PARTIAL — 有代码但未联通、或有功能缺口
- ❌ MISSING — 完全缺失（仅占位页或根本无代码）

### 清单

| # | 功能 | 优先级 | 状态 | 后端 | 前端 | API | 缺失项 |
|---|------|--------|------|------|------|-----|--------|
| 1 | 自然语言创建 Agent | P0 | 🟡 | ✅ PersonaBuilder | ✅ AgentFoundry | ✅ POST /api/agents | 前端 Mock 阻隔 |
| 2 | 人格引擎 | P0 | 🟡 | ✅ Persona + Prompt | ✅ PersonaRadar | ✅ 同上 | 前端 Mock 阻隔 |
| 3 | 背景故事自动生成 | P1 | 🟡 | ✅ 内嵌于 #1 | ✅ 显示 | ✅ 同上 | 前端 Mock 阻隔 |
| 4 | 目标系统 | P1 | 🟡 | ✅ set_goal tool | ✅ AgentCard | ✅ 同上 | 目标生命周期 |
| 5 | 决策风格参数 | P1 | 🟡 | ✅ DecisionStyle | ✅ 2x2 网格 | ✅ 同上 | 前端 Mock 阻隔 |
| 6 | Agent Remix | P2 | ❌ | 无 | 无 | 无 /remix | 全部 |
| 7 | 模板库 (30+) | P2 | ❌ | 无 | 无 | 无 /templates | 全部 |
| 8 | 场景投放 | P0 | 🟡 | ✅ WorldEngine | ✅ SoloTheater | ✅ POST /api/worlds | 前端 useMockSSE |
| 9 | 思维流实时展示 | P0 | 🟡 | ✅ tick_stream | ✅ ThoughtStream | ✅ SSE /stream | 前端未连 SSE |
| 10 | 目标追逐 | P1 | 🟡 | ✅ set_goal | ⚠️ 无进度 UI | ✅ 同上 | 目标状态机 |
| 11 | 动态计划调整 | P1 | ❌ | 无 Plan 模型 | 无 | 无 | 全部 |
| 12 | Agent 日记 | P1 | 🟡 | ✅ NarrativeEngine | ✅ NarrativeFactory | ❌ 无 /narratives | API 路由 |
| 13 | 决策回放 | P2 | ❌ | 无展开 API | 无 | 无 | 全部 |
| 14 | 暂停干预 | P2 | 🟡 | ✅ inject/pause | ✅ Pause 按钮 | ✅ /pause /inject | 前端未调 API |
| 15 | 群体投放 | P0 | 🟡 | ✅ GroupChat | ✅ GroupSandbox | ✅ POST /api/worlds | 前端 useSandboxMockSSE |
| 16 | Agent 间对话 | P1 | 🟡 | ✅ RoundRobin | ✅ EventFeed | ✅ SSE | 同上 |
| 17 | 关系演化 | P1 | 🟡 | ✅ relationships.py | ✅ RelationshipGraph | ✅ SSE | 同上 |
| 18 | 竞争博弈 | P1 | 🟡 | ⚠️ 关键词检测 | ⚠️ Mock | ✅ 同上 | 资源模型 |
| 19 | 角色冲突 | P2 | 🟡 | ⚠️ 关键词检测 | 无 | 无 | 编排+UI |
| 20 | 关系网络图 | P2 | 🟡 | ⚠️ 无快照 API | ✅ Graph 组件 | ❌ 无 /relationships | API 端点 |
| 21 | 群体动力学报告 | P2 | ❌ | 无 | 无 | 无 | 全部 |
| 22 | 1v1 对抗 | P1 | 🟡 | ✅ ArenaEngine | ✅ Arena.tsx | ❌ 无 /arenas | API 路由 |
| 23 | 大乱斗 | P2 | ❌ | 无 | ⚠️ 占位 | 无 | 全部 |
| 24 | 战报生成 | P2 | 🟡 | ⚠️ judge_reasoning | ✅ ResultPanel | ❌ 无 /report | 报告端点 |
| 25 | 盲测模式 | P3 | ❌ | 无 | 无 | 无 | 全部 |
| 26 | 复盘对比 | P2 | ❌ | 无 | 无 | 无 | 全部 |
| 27 | 排行榜 | P3 | ❌ | 无 | 无 | 无 | 全部 |
| 28 | A/B 测试 | P3 | ❌ | 无 | 无 | 无 | 全部 |
| 29 | 小说化叙事 | P1 | 🟡 | ✅ STORY 模板 | ✅ Mock 库 | ❌ 无 /narratives | API 路由 |
| 30 | 未来的信 | P2 | 🟡 | ✅ LETTER 模板 | ✅ Mock 库 | ❌ 同上 | API 路由 |
| 31 | 平行对话 | P2 | ❌ | 无模板 | 无 UI | 无 | 全部 |
| 32 | 播客脚本 | P2 | 🟡 | ✅ PODCAST 模板 | ✅ Mock 库 | ❌ 同上 | API 路由 |
| 33 | 微电影大纲 | P3 | ❌ | 无 | ⚠️ 灰显按钮 | 无 | 占位 |
| 34 | 自动连载 | P3 | ❌ | 无 | ⚠️ 灰显按钮 | 无 | 占位 |
| 35 | Agent 自画像 | P3 | ❌ | 无 | ⚠️ 灰显按钮 | 无 | 占位 |
| 36 | 多 Agent 仪表盘 | P0 | 🟡 | ⚠️ 无聚合端点 | ✅ AgentDashboard | ❌ 无 /dashboard | API + 数据源 |
| 37 | 事件热力图 | P2 | 🟡 | 无 | ✅ EventHeatmap | ❌ | Mock→真数据 |
| 38 | Agent 搜索 | P2 | 🟡 | 无查询参数 | ✅ AgentSearch | ❌ | 后端加 ?q= |
| 39 | 决策模式识别 | P2 | 🟡 | 无 | ✅ DecisionPatterns | ❌ | Mock→真数据 |
| 40 | 异常检测 | P3 | ❌ | 无 | ⚠️ EmptyState | 无 | 占位 |
| 41 | 长期追踪 | P3 | ❌ | 无 | ⚠️ EmptyState | 无 | 占位 |
| 42 | 策略提取 | P3 | ❌ | 无 | ⚠️ EmptyState | 无 | 占位 |
| 43 | 事件注入 | P2 | 🟡 | ✅ inject_event | ✅ 注入表单 | ✅ /inject | 前端未调 API |
| 44 | 上帝之声 | P3 | ❌ | 无 | ⚠️ 灰显卡片 | 无 | 占位 |
| 45 | 时间回溯 | P3 | ❌ | 无 | ⚠️ 灰显卡片 | 无 | 占位 |
| 46 | 分支探索 | P3 | ❌ | 无 | ⚠️ 灰显卡片 | 无 | 占位 |
| 47 | 人格篡改 | P3 | ❌ | 无 PUT /agents | ⚠️ 灰显卡片 | 无 | 占位 |
| 48 | 干预历史 | P3 | 🟡 | 无持久化 | ✅ Mock 列表 | ❌ 无 /interventions | DB 表+API |
| 49 | 剧本模式 | P3 | ❌ | 无 | ⚠️ 灰显卡片 | 无 | 占位 |
| 50 | Agent 市场 | P3 | ❌ | 无 | ⚠️ EmptyState | 无 | 占位 |
| 51 | 精彩回放 | P2 | 🟡 | 无 | ✅ Mock | ❌ | 真实模拟列表 |
| 52 | 实验模板 | P2 | 🟡 | ⚠️ 内置场景 | ✅ Mock | ❌ 无 /templates | CRUD API |
| 53 | 社区数据大屏 | P3 | ❌ | 无 | ⚠️ EmptyState | 无 | 占位 |
| 54 | 成就系统 | P2 | 🟡 | 无 | ✅ Mock 10 成就 | ❌ | 后端计算+API |
| 55 | 研究报告导出 | P2 | ✅ | ✅ export.py | ✅ ExportPanel | ✅ /export/report | — |
| 56 | API 开放 | P3 | ❌ | 无 | ⚠️ EmptyState | 无 | 占位 |

---

## 附录 B: 代码规范重申

> 继承 State 1 的 [STEP.md](STEP.md) 全部规则。以下为 State 2 特别强调项。

### B.1 文件大小限制（严格执行）

| 文件类型 | 上限 | 超过则拆分 |
|----------|------|-----------|
| `.py` 后端文件 | 300 行 | 同模块建 `_helpers.py` / `_types.py` |
| `.tsx` 页面文件 | 300 行 | 子组件拆到 `pages/{模块}/` 子目录 |
| `.tsx` 组件文件 | 200 行 | 拆子组件 |
| Mock 数据文件 | 300 行 | 按实体/Action 拆 |

### B.2 前端架构规范

```
每个页面遵循三段式：
  useApi/useSSE (数据获取)
    → Zustand store (状态管理)
      → 组件 (纯渲染)

禁止：
  ✗ 页面内定义 useApi mockData
  ✗ 页面内写 inline SSE mock（setInterval）
  ✗ 跨页面直接 import Mock 数据
  ✗ 组件 mix 数据获取 + 业务逻辑 + 渲染
```

### B.3 API 设计规范

```
所有 API 端点遵循：
  - 请求体/响应体 = Pydantic BaseModel（在 models/ 定义）
  - 错误响应 = { detail: str }（FastAPI 默认）
  - 异步端点 = async def（不阻塞 event loop）
  - LLM 调用 = 有 timeout + fallback
```

### B.4 前后端接口对齐规范

```
任何涉及前后端通信的改动，必须：
  1. 后端 Pydantic 模型先定义
  2. 前端 TypeScript 类型同步更新
  3. 在 /docs (Swagger) 验证端点输出格式
  4. 前端用该端点前，先 curl 验证
```

---

## 附录 C: 前端共享组件/常量/Hook 目录

> State 2 结束后，`frontend/src/` 应形成以下共享基础设施。

```
frontend/src/
├── api/                        # API 调用层（§0.6）
│   ├── client.ts               # 统一 HTTP 客户端
│   ├── queryKeys.ts            # 所有 React Query key 工厂
│   ├── agents.ts               # useAgents, useCreateAgent, useDeleteAgent
│   ├── worlds.ts               # useWorlds, useCreateWorld, useStartWorld, ...
│   ├── events.ts               # useWorldEvents
│   ├── narratives.ts           # useGenerateStory, useGenerateDiary, ...
│   ├── arenas.ts               # useRunDebate, useArenaResult, useArenas
│   ├── simulations.ts          # useSimulations
│   ├── export.ts               # useExportReport
│   └── achievements.ts         # useAchievements
├── hooks/
│   ├── useSSE.ts               # EventSource hook（加 mock 模式参数）
│   └── useAutoScroll.ts        # 自动滚底 hook（Step 36 新建）
├── utils/
│   └── formatDate.ts           # ISO 日期格式化（Step 36 新建）
├── constants/
│   └── labels.ts               # EMOTION_LABELS + DECISION_LABELS（Step 37 新建）
├── components/
│   └── shared/
│       ├── SelectableCard.tsx  # 统一选中卡片（Step 37 新建）
│       ├── LoadingSpinner.tsx  # 统一 loading（Step 37 新建）
│       ├── StatusDot.tsx       # 已有
│       ├── TerminalText.tsx    # 已有
│       ├── EmptyState.tsx      # 已有
│       └── Card.tsx            # 已有
├── mocks/
│   ├── agents.ts              # Mock Agent 数据
│   ├── sse.ts                 # Mock SSE 事件（仅数据，不包含 hook）
│   ├── scenarios.ts           # 统一场景数据（Step 37 合并）
│   ├── sandbox.ts             # 沙盒 Mock 事件
│   ├── arena.ts               # 竞技 Mock 脚本
│   ├── narratives/            # 叙事 Mock 拆分（Step 38）
│   │   ├── mock-1.ts
│   │   ├── mock-2.ts
│   │   └── mock-3.ts
│   ├── control/               # 控制台 Mock 拆分（Step 38）
│   │   ├── stats.ts
│   │   ├── heatmap.ts
│   │   ├── patterns.ts
│   │   └── search.ts
│   ├── intervention.ts
│   └── archive.ts
└── pages/
    ├── AgentFoundry.tsx
    ├── SoloTheater.tsx
    ├── GroupSandbox.tsx
    ├── Arena.tsx
    ├── NarrativeFactory.tsx
    ├── ControlPanel.tsx
    ├── DirectorIntervention.tsx
    └── archive/               # 拆分（Step 38）
        ├── index.tsx
        ├── HighlightsPanel.tsx
        ├── TemplatesPanel.tsx
        ├── AchievementsPanel.tsx
        └── ExportPanel.tsx
```

---

## 附录 D: 依赖关系图

```
State 1 产出（所有 Step 00–28 done）
  │
  ├─→ Step 29 (Agent 创建联通) ─────────────────────────────┐
  ├─→ Step 30 (Narratives API) ──→ Step 34 (叙事联通)        │
  ├─→ Step 31 (Arenas + Events API) ──→ Step 34 (竞技联通)   │
  ├─→ Step 32 (SoloTheater SSE) ────────────────────────────┤
  └─→ Step 33 (GroupSandbox SSE) ───────────────────────────┤
                                                              │
  Step 29–34 全部完成 ──→ Step 35 (持久化+鲁棒性)              │
                                                              │
  Step 35 完成 ──→ Phase 11 重整                              │
    ├─→ Step 36 (重复代码消除)                                │
    ├─→ Step 37 (共享组件+常量)                                │
    └─→ Step 38 (大文件拆分+路由)                              │
                                                              │
  Phase 10 + 11 完成 ──→ Phase 12 功能补全                     │
    ├─→ Step 39 (Remix + 模板)        ← 依赖 29               │
    ├─→ Step 40 (目标 + 计划)          ← 依赖 32, 33           │
    ├─→ Step 41 (回放 + 动力学)        ← 依赖 33               │
    ├─→ Step 42 (叙事完善)             ← 依赖 30, 34           │
    ├─→ Step 43 (控制台真数据)          ← 依赖 33, 35           │
    ├─→ Step 44 (干预台完善)            ← 依赖 34, 35           │
    ├─→ Step 45 (档案馆功能)            ← 依赖 35               │
    └─→ Step 46 (竞技场增强)            ← 依赖 31, 34           │
                                                              │
  Phase 12 完成 ──→ Phase 13 交付                              │
    ├─→ Step 47 (性能优化)                                    │
    ├─→ Step 48 (集成测试)                                    │
    ├─→ Step 49 (P3 占位补齐)                                  │
    └─→ Step 50 (演示排练+文档)                                │
```

**串行执行顺序（单人开发）：**

```
29 → 30 → 31 → 32 → 33 → 34 → 34-W → 34-S → 35 → 36 → 37 → 38 → 39 → 40 → 41 → 42 → 43 → 44 → 45 → 46 → 47 → 48 → 49 → 50
```

**如果需要并行（多人）：**

```
阶段 1（联通，一起做）：
  29（任何人）→ 30 + 31（后端专长）并行 32（前端专长）
  → 33 + 34 串行 → 35（后端）

阶段 2（重整，前端专长串行）：
  36 → 37 → 38

阶段 3（补全，可并行）：
  39（Agent 模块）∥ 42（叙事模块）
  40 + 41（World 模块）∥ 43 + 44（控制台+干预）
  45（档案馆）∥ 46（竞技场）

阶段 4（交付）：
  47 → 48 → 49 → 50
```

---

> **最后更新:** 2026-07-20
> **维护者:** 晓音_Stingray
> **版本:** 2.0 (Plan State 2)
> **基准:** 56 项功能审计（附录 A）+ 前端代码审计（`docs/plan-state2.md` 旧版附录 A）
