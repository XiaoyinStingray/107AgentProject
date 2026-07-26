# 人生实验室 · Life Lab — Plan State 3

> **文档目的：** 第三阶段完整开发计划。三大新模块 + 打磨交付。
> **上一阶段：** [Plan State 2](plan-state2.md)（Step 29–50，Phase 10–13 全部 done）
> **当前状态：** 8 个模块端到端联通、18 个 P3 功能待嵌入、项目可演示但缺"杀手级模块"。
> **本阶段目标：** Agent Team（协作解题）→ LLM Bench（批量测评）→ 游戏化场景（视觉交互），三模块出彩。
>
> **与 State 2 的关系：** State 2 接血管（API 路由、数据持久化、前端架构），State 3 长器官（新模块 + 新交互范式）。State 2 的 8 个模块保持不动，State 3 在其上叠加 3 个大模块。
>
> **设计原则：** 大模块架构（P3 功能不作为菜单项，嵌入模块内部）+ 测试线独立成轨 + 单线→双线→单线节奏。

---

## Step 速查表

| Step | Phase | 轨 | 名称 | 依赖 | 核心产出 | 估时 |
|------|-------|----|------|------|----------|------|
| **🏗️ Phase 14: Agent Team** | | | | | | |
| 51 | 14.1 | 开发 | Team 组建 | 29, 35 | `teams` 表 + 编组 + 角色分配 + API | 3h |
| 52 | 14.2 | 开发 | 工作流引擎 + Plan 模型 | 51, 40 | 任务分解→指派→执行→交付 + 动态计划 | 4h |
| 53 | 14.3 | 开发 | Team 看板 UI | 51, 52 | `/team` 页面：Kanban + 对话 + 产出预览 | 5h |
| 54 | 14.4 | 开发 | Team 诊断 | 52, 19, 40 | 异常检测 + 角色冲突 + 协作健康分 | 3h |
| 55 | 14.5 | 开发 | 复盘报告 | 53, 54 | 决策回放 + 策略提取 + 群体动力学报告 | 3h |
| T1 | — | 测试 | Phase 14 单元 + 集成 + E2E | 51–55 | 后端 6 测试文件 + 前端 5 组件测试 + E2E | 3h |
| T2 | — | 测试 | Phase 14 Bug 修补 | T1 | bugs.md 现存 bug 清零 + 回归测试 | 2h |
| **🏗️ Phase 15: Team 收尾 + Bench 启动** | | | | | | |
| 56 | 15.1 | A | Agent 市场 | 55 | 分享/下载 Team 配置 + 评价系统 | 3h |
| 57 | 15.2 | A | API 开放 | 56 | REST API 远程控制 Team 任务 | 3h |
| 58 | 15.3 | B | 批量调度器 | 33, 35 | N Agent × M 场景 → 并发队列 → 结果收集 | 4h |
| 59 | 15.4 | B | 指标框架 | 58 | 4 维 metric + 评分 pipeline + 结果存储 | 4h |
| 60 | 15.5 | B | 对比 UI | 59 | `/bench` 页面：并排对比 + 差异高亮 | 4h |
| 61 | 15.6 | B | 排行榜 | 60 | 多维度排序 + 筛选 + 历史趋势图 | 3h |
| T3 | — | 测试 | Phase 15 集成 + E2E | 56–61 | A+B 双线引擎/API/前端测试 + Bench E2E + 交叉回归 | 3h |
| T4 | — | 测试 | Phase 15 Bug 修补 | T3 | 并发死锁 + 指标边界 + SSE 交叉污染 | 2h |
| **🏗️ Phase 16: Bench 收尾 + 游戏化启动** | | | | | | |
| 62 | 16.1 | A | 盲测模式 | 61 | 匿名评测 + 揭盲仪式 + 偏差分析 | 3h |
| 63 | 16.2 | A | 长期追踪 | 62 | 跨版本/跨场景趋势 + 退化检测 | 3h |
| 64 | 16.3 | A | Bench 报告 | 63 | 自动生成 Markdown 报告 + 图表 | 2h |
| 65 | 16.4 | B | 场景画布 | — | Canvas 渲染 + 场景背景 + Agent 精灵放置 | 5h |
| 66 | 16.5 | B | 头像 + 情绪系统 | 65 | AI 生成 Agent 头像 + 情绪表情变化 | 3h |
| 67 | 16.6 | B | 时间轴 | 65 | 拖拽回退 tick + 快照 + 分支可视化 | 4h |
| 68 | 16.7 | B | 交互系统 | 65, 67 | 点击 Agent→面板；拖拽移动；速度控制 | 3h |
| T5 | — | 测试 | Phase 16 性能 + E2E | 62–68 | Canvas ≥30fps；批量并发；Bench+Scene E2E | 3h |
| T6 | — | 测试 | Phase 16 Bug 修补 | T5 | Canvas 渲染异常 + 时间轴状态 + 包体积 | 2h |
| **🎯 Phase 17: 游戏化收尾 + 打磨交付** | | | | | | |
| 69 | 17.1 | 开发 | 导演模式 | 68 | 上帝之声 + 剧本事件触发器 + 人格篡改 | 4h |
| 70 | 17.2 | 开发 | 分支探索 | 69, 46 | 关键节点分叉 + 分支树 UI + 平行对比 | 4h |
| 71 | 17.3 | 开发 | 叙事导出 | 70 | 微电影大纲 + 自动连载生成 | 3h |
| 72 | — | 测试 | 全项目 Bug 清零 | 全 | bugs.md 关闭；TODO/FIXME 归零；11 页面 console 零 error | 4h |
| 73 | — | 测试 | 覆盖率 + E2E 全链路 | 全 | 后端行覆盖 ≥90%；E2E ×5 | 4h |
| 74 | — | 测试 | 演示排练 + 文档 | 全 | 3 条 Demo 含台词/时间轴；README；API 文档 | 4h |
| 75 | 17.4 | 开发 | 科大主题 | 34-S | 5 场景 + 8 模板 + 彩蛋 | 4h |

> **共 36 个 Step。** 开发 21 步，测试 15 步。
> **总计估时：** ~118 小时（一人 + AI）

---

## 目录

- [架构设计：大模块 vs 小功能](#架构设计大模块-vs-小功能)
- [Phase 14: Agent Team](#phase-14-agent-team)
  - [Step 51–55: 开发](#step-51--team-组建)
  - [Step T1: 单元 + 集成 + E2E](#step-t1--phase-14-单元测试--集成测试--e2e)
  - [Step T2: Bug 修补](#step-t2--phase-14-bug-修补)
- [Phase 15: Team 收尾 + LLM Bench 启动](#phase-15-team-收尾--llm-bench-启动)
  - [Step 56–57: A 线](#step-56--agent-市场)
  - [Step 58–61: B 线](#step-58--批量调度器)
  - [Step T3: 集成 + E2E](#step-t3--phase-15-集成测试--e2e)
  - [Step T4: Bug 修补](#step-t4--phase-15-bug-修补)
- [Phase 16: Bench 收尾 + 游戏化启动](#phase-16-bench-收尾--游戏化启动)
  - [Step 62–64: A 线](#step-62--盲测模式)
  - [Step 65–68: B 线](#step-65--场景画布)
  - [Step T5: 性能 + E2E](#step-t5--phase-16-性能测试--e2e)
  - [Step T6: Bug 修补](#step-t6--phase-16-bug-修补)
- [Phase 17: 游戏化收尾 + 打磨交付](#phase-17-游戏化收尾--打磨交付)
  - [Step 69–71: 开发](#step-69--导演模式)
  - [Step 72: Bug 清零](#step-72--全项目-bug-清零)
  - [Step 73: 覆盖率 + E2E](#step-73--覆盖率--e2e-全链路)
  - [Step 74: 演示排练](#step-74--演示排练--文档)
  - [Step 75: 科大主题](#step-75--科大主题)
- [附录 A: 18 功能嵌入映射](#附录-a-18-功能嵌入映射)
- [附录 B: 测试线详细指标](#附录-b-测试线详细指标)
- [附录 C: 菜单架构演进](#附录-c-菜单架构演进)

---

## 架构设计：大模块 vs 小功能

### 核心决策

State 2 的 56 项扁平菜单在演示时缺乏"杀手级模块"——每个功能都能用，但没有一个能让人眼前一亮。State 3 把 18 个剩余 P3/跳过功能**不作为菜单项**，而是嵌入 3 个新大模块内部：

```
State 2（8 模块，保留）              State 3（新增 3 大模块）
━━━━━━━━━━━━━━━━━━━━━━            ━━━━━━━━━━━━━━━━━━━━━━
M1 · 铸造厂                          M9  · Agent Team
M2 · 单人剧场                             ├─ 组队 & 角色
M3 · 群体沙盒                             ├─ 任务看板（← #11 动态计划）
M4 · 竞技场                               ├─ 实时协作对话
M5 · 叙事工厂                             ├─ Team 诊断（← #19#40 冲突/异常）
M6 · 控制台                               ├─ 复盘报告（← #13#21#42 回放/动力学/策略）
M7 · 干预台                               ├─ Agent 市场（← #50）
M8 · 档案馆                               └─ API 开放（← #56）
                                    M10 · LLM Bench
Sidebar 新增 3 个顶级入口                  ├─ 批量调度器
                                    ├─ 指标框架
                                    ├─ A/B 对比（← #28）
                                    ├─ 盲测模式（← #25）
                                    ├─ 排行榜（← #27）
                                    ├─ 长期追踪（← #41）
                                    └─ 评测报告
                                    M11 · 游戏化场景
                                         ├─ 场景画布
                                         ├─ 头像 & 情绪（← #35）
                                         ├─ 时间轴（← #45）
                                         ├─ 上帝之声（← #44）
                                         ├─ 分支探索（← #46）
                                         ├─ 人格篡改（← #47）
                                         ├─ 剧本模式（← #49）
                                         ├─ 微电影大纲（← #33）
                                         └─ 自动连载（← #34）
```

**设计规则：**
- M1–M8 菜单保持不动（向后兼容 State 2）
- M9–M11 作为新顶级菜单项追加到侧边栏底部
- 18 个 P3 功能全部从菜单中移除入口，嵌入对应大模块内部
- 每个大模块内部用 Tab/面板/子页面切换，不挂在全局菜单

---

### M9 Agent Team — 设计要点

**用户故事：** "我把 3 个 Agent 组成产品团队，让它们设计一个校园社交 App。它们自己分配了 PM/设计师/开发角色，争论了 15 分钟后产出了一份 PRD 和低保真原型。"

**出彩机制：**

1. **角色分配不是手动选** — 系统分析 Agent 人格后自动建议最佳角色（ISTJ → 后端开发、ENFP → 产品经理），用户可覆盖
2. **实时协作可见** — 不是后台跑完给结果，而是看到 Agent 们在对话中争论、妥协、分工
3. **产出物是真实文档** — PRD 用 Markdown、代码有语法高亮、设计有结构化描述
4. **Team 健康仪表盘** — 显示谁主导、谁被边缘化、冲突在哪里、效率评分
5. **复盘回放** — 任务结束后可"播放"完整协作过程，标注关键决策点

**架构要点：**

```
后端：
  teams 表（id, name, agent_ids, roles, task, status, created_at）
  team_tasks 表（id, team_id, parent_id, title, assignee, status, priority）
  team_events 表（id, team_id, tick, type, agent_id, content）  ← 复用 events 表结构
  TeamEngine（继承 WorldEngine 的 GroupChat 模式，加工作流调度）
  GET/POST /api/teams
  POST /api/teams/{id}/execute
  GET  /api/teams/{id}/stream（SSE，复用现有 SSE 架构）
  GET  /api/teams/{id}/report

前端：
  /team 路由 → TeamDashboard 页面
  子面板：TeamSetup / TaskKanban / LiveChat / HealthPanel / ReplayView
```

---

### M10 LLM Bench — 设计要点

**用户故事：** "我想对比 DeepSeek 和 GPT-5 在'期末周抢座'场景下的策略差异。选了 5 个 Agent 模板，每种 LLM 跑 10 次，盲测结果：DeepSeek 胜率 62%，但在协作场景下 GPT-5 更稳定。"

**出彩机制：**

1. **这不是表单，是实验设计器** — 拖拽 Agent 模板到场景卡片，设置重复次数，一键启动
2. **盲测仪式感** — 结果先脱敏，用户评分后再揭盲，消除确认偏差
3. **差异可视化** — 跑 10 次的结果不列数字，而是用小提琴图/热力图直观展示分布
4. **退化检测** — 同一 Agent 跑 50 次后能力是否下降？自动标注
5. **专业报告** — 一键导出学术风格的 PDF/Markdown 评测报告

**架构要点：**

```
后端：
  bench_runs 表（id, name, config_json, status, started_at, ended_at）
  bench_results 表（id, run_id, scenario_id, agent_id, llm_model, metrics_json）
  BatchScheduler（asyncio 队列 + 并发控制 + 超时 + 重试）
  MetricEngine（一致性 / 创造力 / 稳定性 / 协作力 评分器）
  POST /api/bench/runs（创建评测任务）
  GET  /api/bench/runs/{id}（状态 + 进度）
  GET  /api/bench/runs/{id}/results（详细结果）
  GET  /api/bench/runs/{id}/report（自动报告）

前端：
  /bench 路由 → BenchLab 页面
  子面板：ExperimentDesigner / RunMonitor / CompareView / Leaderboard / ReportView
```

---

### M11 游戏化场景 — 设计要点

**用户故事：** "我把 3 个 Agent 拖进'科大图书馆'场景，看着他们的头像在自习区移动、占座、搭讪。小林（INTJ）一直窝在角落，小红（ENFP）到处社交，小刚（ESTJ）站起来宣布'大家都别吵了'——我点了一下小林，弹出一个耳语框：'你喜欢的那个座位，现在去还来得及'。"

**出彩机制：**

1. **Agent 不是文本，是角色** — 每个 Agent 在场景中有位置、朝向、表情、动作
2. **场景是活的** — 图书馆的座位随时间减少，樱花大道的游客涌入，组会的投影仪坏了
3. **时间可操控** — 底部时间轴可以拖拽回退到任意 tick，甚至可以分叉重来
4. **上帝模式** — 点击 Agent 弹面板（人格/情绪/记忆），右键发耳语，拖动到另一个位置
5. **剧情导出** — 整场模拟结束后，一键生成微电影分镜 or 连载小说

**架构要点：**

```
后端：
  scenes 表（复用现有 custom_scenarios，加 background_image, spawn_points, resource_nodes）
  agent_sprites 表（agent_id, scene_id, position_x, position_y, facing, current_animation）
  SceneEngine（继承 WorldEngine，加空间模型 + 资源系统 + 交互事件）
  POST /api/scenes/{id}/interact（点击/耳语/移动 → 注入事件）
  GET  /api/scenes/{id}/state（当前场景状态：位置 + 资源 + 事件）
  GET  /api/scenes/{id}/timeline（完整时间轴快照）
  GET  /api/scenes/{id}/branches（分支树）

前端：
  /scene 路由 → GameScene 页面
  Canvas 渲染层（HTML5 Canvas / PixiJS）← 技术选型 Phase 16 初判
  子面板：AgentPanel / Timeline / BranchTree / GodTools / ExportPanel
```

---

## Phase 14: Agent Team

> **目标：** 用户能把 Agent 组队，分配任务，看到他们协作产出结果。
> **策略：** 复用 GroupChat SSE 架构 + 新增工作流调度层。前端新建 `/team` 页面。

### Step 51 — Team 组建

> **目标：** 建 teams 表 + CRUD API + 前端 Team 创建页面。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/team_orm.py` | **新建** | TeamRow + TeamMemberRow（id, name, agent_ids, roles_json, status, created_at） |
| `backend/src/api/teams.py` | **新建** | `POST/GET/DELETE /api/teams`；`POST /api/teams/{id}/members` |
| `backend/src/db.py` | 修改 | 注册 team_orm |
| `backend/src/main.py` | 修改 | 注册 teams router |
| `frontend/src/types/team.ts` | **新建** | Team / TeamMember / TeamRole TS 类型 |
| `frontend/src/api/teams.ts` | **新建** | useTeams / useCreateTeam / useDeleteTeam |
| `frontend/src/api/queryKeys.ts` | 修改 | +teamKeys |
| `frontend/src/pages/TeamDashboard.tsx` | **新建** | Team 创建表单 + 已有 Team 列表 |
| `frontend/src/components/layout/Sidebar.tsx` | 修改 | 侧边栏加 M9 Agent Team 入口 |

**角色自动推荐：** `POST /api/teams/suggest-roles` → 输入 agent_ids → LLM 分析人格 → 返回推荐角色分配。

#### 验收标准

- [ ] `POST /api/teams` → 201 + TeamResponse（含推荐角色）
- [ ] `GET /api/teams` 列出所有 Team
- [ ] 侧边栏 M9 入口可点击、可跳转
- [ ] 前端可创建 Team（选 Agent → 自动推荐角色 → 用户确认 → 创建）
- [ ] 后端测试全量通过

---

### Step 52 — 工作流引擎 + Plan 模型

> **目标：** Agent Team 能分解任务、分配子任务、按计划执行。
> **此步同时实现 #11（动态计划调整）——Plan 模型从 Step 40-S 的 SKIPPED 状态复活。**

#### 设计

```
用户输入："设计一个校园社交 App"
  → TaskDecomposer（LLM 调用）：拆分为 5 个子任务
    1. 用户调研（→ 分配给 ENFP Agent）
    2. 竞品分析（→ 分配给 INTJ Agent）
    3. 功能设计 PRD（→ 分配给 ENTJ Agent）
    4. 技术方案（→ 分配给 ISTJ Agent）
    5. 整合交付（→ 全 Team 协作）
  → Plan 模型跟踪进度
  → WorldEngine 驱动 Agent 间讨论
  → 每个子任务完成后触发 plan_updated 事件
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/plan.py` | **新建** | Plan + PlanStep 模型（#11 复活） |
| `backend/src/engines/team/decomposer.py` | **新建** | TaskDecomposer：LLM 拆任务 + 分配 |
| `backend/src/engines/team/engine.py` | **新建** | TeamEngine：继承 WorldEngine，加工作流调度 |
| `backend/src/engines/team/planner.py` | **新建** | PlanManager：跟踪进度 + 动态调整 |
| `backend/src/api/teams.py` | 修改 | `POST /api/teams/{id}/execute` 端点 |
| `backend/src/api/sse.py` | 修改 | 注册 Team SSE stream |
| `frontend/src/pages/TeamDashboard.tsx` | 修改 | 任务分解展示 + Plan 视图 |

#### 验收标准

- [ ] 输入任务描述 → LLM 拆分为 ≥3 个子任务
- [ ] 子任务自动分配到对应角色的 Agent
- [ ] 执行中 Agent 可调用 `update_plan` tool 调整计划
- [ ] SSE stream 包含 `plan_updated` 事件
- [ ] Plan 进度在任务看板实时更新

---

### Step 53 — Team 看板 UI

> **目标：** `/team` 页面的核心体验——用户看到 Team 正在工作，不是黑盒。

#### 设计

```
┌─────────────────────────────────────────────────────┐
│  M9 Agent Team · 校园社交 App 设计                     │
├──────────────┬──────────────────┬───────────────────┤
│  📋 任务看板   │  💬 实时对话      │  📊 Team 健康       │
│              │                  │                   │
│  TODO        │ [小红-PM]        │ 协作分: 87/100     │
│  ├ 用户调研   │ "我觉得应该先做     │ 主导力: 小红 38%   │
│  │ 👤 小红    │  竞品分析..."     │ 参与度: 4/4 活跃   │
│  │ ████ 80% │                  │ 冲突: 0 次         │
│  │           │ [小明-开发]       │                   │
│  DOING       │ "技术方案我写好了， │                   │
│  ├ 竞品分析   │  大家看看..."     │                   │
│  │ 👤 小明   │                  │                   │
│  │ ██ 40%   │                  │                   │
│              │                  │                   │
│  DONE        │                  │                   │
│  └ (空)      │                  │                   │
└──────────────┴──────────────────┴───────────────────┘
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/team/TaskKanban.tsx` | **新建** | Kanban 三列 + 进度条 + 头像标注 |
| `frontend/src/pages/team/LiveChat.tsx` | **新建** | Agent 对话流（复用 SSE + ThoughtBubble） |
| `frontend/src/pages/team/HealthPanel.tsx` | **新建** | 协作仪表盘 |
| `frontend/src/pages/team/TeamSetup.tsx` | **新建** | 从 Step 51 迁移创建流程 |
| `frontend/src/pages/TeamDashboard.tsx` | 修改 | Tab 切换：Setup / Kanban / Chat / Health |

#### 验收标准

- [ ] Kanban 列显示任务状态 + 进度条 + 指派人头像
- [ ] 实时对话流从 SSE 渲染，新消息自动滚动
- [ ] Team 健康分随协作进程实时更新
- [ ] 任务完成后卡片移动到 DONE 列（带动画）

---

### Step 54 — Team 诊断

> **目标：** 检测 Team 运行中的异常——角色冲突、行为偏离、参与不均衡。实现 #40（异常检测）和 #19（角色冲突）的防回归。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/team/diagnostics.py` | **新建** | 异常检测器：偏离基线 / 冲突检测 / 参与度评分 |
| `backend/src/engines/team/engine.py` | 修改 | 每 N tick 运行诊断 |
| `frontend/src/pages/team/HealthPanel.tsx` | 修改 | 诊断结果可视化 |
| `frontend/src/components/team/ConflictAlert.tsx` | **新建** | 冲突警告弹窗 |

#### 验收标准

- [ ] Agent 连续 5 tick 偏离人格基线 → 黄色预警
- [ ] 两个 Agent 目标互斥 → 冲突事件触发 → UI 高亮
- [ ] 某 Agent 超过 10 tick 未发言 → 低参与度警告
- [ ] 诊断结果写入 events 表

---

### Step 55 — 复盘报告

> **目标：** 任务结束后自动生成复盘——关键决策回放 + 策略提取 + 群体动力学。实现 #13、#21、#42。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/team/report.py` | **新建** | ReportGenerator：LLM 分析事件 → 结构化报告 |
| `backend/src/api/teams.py` | 修改 | `GET /api/teams/{id}/report` |
| `frontend/src/pages/team/ReplayView.tsx` | **新建** | 决策回放：关键 tick 时间线 + 决策前因后果 |
| `frontend/src/pages/team/ReportView.tsx` | **新建** | 报告渲染：Markdown + 图表 |

#### 验收标准

- [ ] 报告包含：任务摘要 / 关键决策点（≥3 个）/ 策略总结 / 协作分析
- [ ] 回放可逐 tick 播放，标注每个决策的触发原因和后果
- [ ] 报告可从页面导出为 Markdown

---

### Step T1 — Phase 14 单元测试 + 集成测试 + E2E

> **目标：** Step 51–55 的全部自动化测试，确保新代码可工作、可回归。
> **测试线独立作业，不依赖开发线完成所有 Step——每完成一个开发 Step 即刻写测试。**

#### 测试清单

**Layer 1：单元测试（每个新建 backend 文件至少 1 个 test 文件）**

| 被测模块 | 测试文件 | 覆盖内容 |
|---------|---------|---------|
| `team_orm.py` | `tests/test_team_orm.py` | CRUD、角色 JSON 序列化、状态转换 |
| `teams.py`（API） | `tests/test_teams_api.py` | `POST/GET/DELETE /api/teams`、角色推荐、成员管理 |
| `decomposer.py` | `tests/test_team_decomposer.py` | 任务分解（Mock LLM）、分配逻辑、异常输入兜底 |
| `planner.py` | `tests/test_team_planner.py` | Plan 创建/更新/完成、依赖检查 |
| `diagnostics.py` | `tests/test_team_diagnostics.py` | 偏离检测阈值、冲突检测、参与度评分边界 |
| `report.py` | `tests/test_team_report.py` | 报告生成（Mock LLM）、Markdown 格式验证 |

**Layer 2：前端组件测试（每个新建 .tsx 至少 2 个 happy-path 测试）**

| 被测组件 | 测试文件 | 覆盖交互 |
|---------|---------|---------|
| `TeamDashboard.tsx` | 追加到现有测试或新建 | 创建 Team 流程、列表展示 |
| `TaskKanban.tsx` | 同上 | 三列渲染、进度条、拖拽（如有） |
| `LiveChat.tsx` | 同上 | SSE 事件渲染、自动滚动 |
| `HealthPanel.tsx` | 同上 | 健康分展示、警告状态 |
| `ReplayView.tsx` | 同上 | Tick 播放控制、决策点标注 |

**Layer 3：E2E 全链路**

| 用例 | 步骤 | 验证点 |
|------|------|--------|
| `test_team_full_chain` | ① 创建 3 个 Agent ② 组队（角色自动推荐） ③ 提交任务"设计一个校园社交 App" ④ 等待任务分解 ⑤ 启动执行 ⑥ 等待 ≥5 tick ⑦ 暂停 → 查看健康分 → 结束 ⑧ 查看复盘报告 | 任务分解 ≥3 个子任务、SSE 包含 `plan_updated`、报告含关键决策点 |

**Layer 4：回归测试**

| 命令 | 通过标准 |
|------|---------|
| `cd backend && PYTHONPATH=src python -m pytest tests/ -v` | 全量通过（允许预存 OpenAI 凭证失败，≤3 个） |
| `cd frontend && npx vitest run` | 全量通过 |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_team_orm.py` | **新建** | ORM 单元测试 |
| `backend/tests/test_teams_api.py` | **新建** | Team API 集成测试 |
| `backend/tests/test_team_decomposer.py` | **新建** | 任务分解引擎测试 |
| `backend/tests/test_team_planner.py` | **新建** | Plan 引擎测试 |
| `backend/tests/test_team_diagnostics.py` | **新建** | 诊断引擎测试 |
| `backend/tests/test_team_report.py` | **新建** | 报告引擎测试 |
| `frontend/src/pages/team/__tests__/` | **新建目录** | 前端组件测试 |
| `backend/tests/test_e2e_team.py` | **新建** | E2E 全链路 |

#### 验收标准

- [ ] 每个 `backend/src/engines/team/*.py` 有对应的 `tests/test_team_*.py`
- [ ] 每个新建前端组件有 ≥2 个 happy-path 测试
- [ ] E2E 全链路通过（Mock LLM）
- [ ] 回归测试：后端全量通过、前端全量通过
- [ ] 新代码行覆盖 ≥80%（`pytest --cov=src/engines/team --cov-report=term`）

---

### Step T2 — Phase 14 Bug 修补

> **目标：** 消灭 bugs.md 中所有现存 bug + Phase 14 开发过程中发现的新 bug。

#### 工作流程

```
1. 读 bugs.md → 列出全部 open bug
2. 按严重度排序：P0（崩溃/数据丢失）→ P1（功能错误）→ P2（体验问题）
3. 逐一修复 → 写回归测试 → 验证 → 更新 bugs.md 状态
4. Phase 14 新代码中发现的问题直接修，不另建 tracking
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/bugs.md` | 修改 | 逐条更新状态（open → fixed → verified） |
| 各 bug 对应的源文件 | 修改 | 修复代码 |
| 各 bug 对应的测试文件 | 修改 | 添加回归测试（防止复活） |

#### 验收标准

- [ ] `docs/bugs.md` 中所有 Phase 14 之前登入的 bug 状态为 `✅ fixed` 或 `📝 wontfix`（需注释原因）
- [ ] 每个修复的 P0/P1 bug 有对应的回归测试
- [ ] 回归测试全量通过
- [ ] Phase 14 新代码无明显 bug（lint 零新增告警、控制台零未捕获异常）

> **节奏：** A 线（Team 收尾）2 步，B 线（Bench 启动）4 步。两条线可并行。

---

### 15a — Team 收尾（A 线）

### Step 56 — Agent 市场

> **目标：** 实现 #50。Team 配置可分享/下载，带评价系统。

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/market_orm.py` | **新建** | MarketItem 表（team_id, author, downloads, rating） |
| `backend/src/api/market.py` | **新建** | `GET/POST /api/market`；`POST /api/market/{id}/rate` |
| `frontend/src/pages/team/MarketPanel.tsx` | **新建** | 市场浏览 + 下载 |

**验收标准：** ① Team 可发布到市场 ② 其他用户可下载 ③ 可评分/评论

### Step 57 — API 开放

> **目标：** 实现 #56。外部程序通过 REST API 控制 Team 执行。

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/teams.py` | 修改 | 已有端点补全文档 + example |
| `backend/src/main.py` | 修改 | Swagger tags 描述完善 |
| `frontend/src/pages/team/ApiDocPanel.tsx` | **新建** | 内嵌 API 文档页 |

**验收标准：** ① `curl` 可创建 Team 并触发执行 ② Swagger 文档完整可交互

---

### 15b — LLM Bench 启动（B 线）

### Step 58 — 批量调度器

> **目标：** 选 N 个 Agent × M 个场景 → 并发队列 → 收集所有结果。

#### 设计

```
BatchScheduler：
  1. 解析实验配置（agents × scenarios × repeat_count）
  2. 生成执行队列（每对 agent+scenario 一个 task）
  3. asyncio.Semaphore 控制并发 ≤3
  4. 每个 task：创建临时 World → 运行模拟 → 收集事件 → 写入 bench_results
  5. 进度回调 → SSE 推送给前端
  6. 超时 120s/task → fallback → 标记失败
```

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/bench_orm.py` | **新建** | BenchRun + BenchResult 表 |
| `backend/src/engines/bench/scheduler.py` | **新建** | BatchScheduler |
| `backend/src/api/bench.py` | **新建** | `POST /api/bench/runs`；`GET /api/bench/runs/{id}` |
| `backend/src/main.py` | 修改 | 注册 bench router |
| `frontend/src/types/bench.ts` | **新建** | BenchRun / BenchResult TS 类型 |
| `frontend/src/api/bench.ts` | **新建** | useBenchRuns / useBenchResult |
| `frontend/src/pages/BenchLab.tsx` | **新建** | 实验设计器 + 运行状态 |

**验收标准：** ① 5 Agent × 3 场景 × 2 次重复 = 30 个 task 全部执行 ② 并发 ≤3 ③ 进度实时推送

---

### Step 59 — 指标框架

> **目标：** 定义 4 维 metric + 评分器 + 结果持久化。

#### 四维指标

| 指标 | 定义 | 评分方式 |
|------|------|---------|
| **一致性** | Agent 行为与人格的匹配度 | 人格基线偏差检测 |
| **创造力** | 行为多样性、非重复性 | 事件类型熵 + LLM 评审 |
| **稳定性** | 多次运行的方差 | 统计方差 |
| **协作力** | 与其他 Agent 的合作深度 | 关系变化 + 对话轮次 |

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/bench/metrics.py` | **新建** | 4 个 MetricCalculator 类 |
| `backend/src/engines/bench/scheduler.py` | 修改 | 每 task 结束后跑 metric 采集 |

**验收标准：** ① 每个 task 产出 4 个 metric 分数 ② 分数写入 bench_results.metrics_json ③ 异常情况（无事件/崩溃）metric 有兜底值

---

### Step 60 — 对比 UI

> **目标：** 实现 #28 A/B。`/bench` 页面核心——并排展示多次运行结果。

#### 设计

```
┌─────────────────────────────────────────────────────┐
│  A 组: DeepSeek v3              B 组: GPT-5         │
│  ─────────────────              ──────────          │
│  一致性: ████████░░ 82          ██████░░░░ 65       │
│  创造力: ██████░░░░ 68          ████████░░ 84  ← 优 │
│  稳定性: ████████░░ 85          █████████░ 91  ← 优 │
│  协作力: █████████░ 94  ← 优    ██████░░░░ 67       │
│                                                     │
│  [详细展开]  [并排对话对比]  [导出报告]                │
└─────────────────────────────────────────────────────┘
```

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/bench/CompareView.tsx` | **新建** | 并排对比面板 |
| `frontend/src/pages/bench/ExperimentDesigner.tsx` | **新建** | 配置 Agent + 场景 + LLM + 次数 |
| `frontend/src/pages/bench/RunMonitor.tsx` | **新建** | 实时进度 + 中间结果 |

**验收标准：** ① 两组结果并排展示 ② 差异高亮（胜出方标绿） ③ 支持展开单维度详细数据

---

### Step 61 — 排行榜

> **目标：** 实现 #27。所有评测结果可排序、筛选、对比趋势。

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/bench/Leaderboard.tsx` | **新建** | 排行表 + 筛选 + 趋势图 |
| `backend/src/api/bench.py` | 修改 | `GET /api/bench/leaderboard?metric=X&limit=N` |

**验收标准：** ① 按任一 metric 排序 ② 按 LLM/场景/Agent 筛选 ③ 显示历史最佳/最差/平均

---

### Step T3 — Phase 15 集成测试 + E2E

> **目标：** A 线（Team 收尾）+ B 线（Bench 启动）的跨模块集成测试。验证两条线不互相破坏。

#### 测试清单

**Layer 1：A 线 — Team 收尾**

| 被测模块 | 测试文件 | 覆盖内容 |
|---------|---------|---------|
| `market.py`（API） | `tests/test_market_api.py` | 发布/下载/评分、重复发布拒绝、空 Team 拒绝 |
| `MarketPanel.tsx` | 追加到 Team 测试 | 列表渲染、下载按钮、评分交互 |
| `teams.py` API 端点 | 追加到 `test_teams_api.py` | `GET /api/teams/{id}/execute` 幂等性、并发执行拒绝 |

**Layer 2：B 线 — Bench 启动**

| 被测模块 | 测试文件 | 覆盖内容 |
|---------|---------|---------|
| `bench_orm.py` | `tests/test_bench_orm.py` | CRUD、metrics_json 序列化、状态转换 |
| `scheduler.py` | `tests/test_bench_scheduler.py` | 队列生成（5×3×2=30 tasks）、并发控制、超时处理、进度回调 |
| `metrics.py` | `tests/test_bench_metrics.py` | 4 维评分边界值（空事件/单事件/大量事件）、一致性区间 |
| `bench.py`（API） | `tests/test_bench_api.py` | `POST runs` / `GET runs/{id}` / `GET leaderboard` |
| `CompareView.tsx` | 新建测试文件 | 两组数据并排渲染、差异高亮、展开/折叠 |

**Layer 3：E2E 全链路**

| 用例 | 步骤 | 验证点 |
|------|------|--------|
| `test_bench_full_chain` | ① 创建 5 个 Agent（不同人格） ② 选 2 种 LLM 配置（Mock） ③ 选 3 个场景 ④ 设置 repeat=2 ⑤ 启动批量运行 ⑥ 等待全部完成 ⑦ 查看对比视图 ⑧ 查看排行榜 | 30 个 task 全部完成、metrics 非空、对比视图两组数据正确、排行榜排序正确 |

**Layer 4：A+B 交叉回归**

| 测试 | 说明 |
|------|------|
| Team + Bench 并存 | 验证 `teams` 和 `bench_runs` 表无冲突；两个 router 注册无冲突 |
| M9 + M10 侧边栏 | 两个新菜单项同时可见、独立跳转 |
| SSE 流隔离 | Team SSE stream 和 Bench SSE stream 不交叉污染 |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_market_api.py` | **新建** | 市场 API 测试 |
| `backend/tests/test_bench_orm.py` | **新建** | Bench ORM 测试 |
| `backend/tests/test_bench_scheduler.py` | **新建** | 调度器测试 |
| `backend/tests/test_bench_metrics.py` | **新建** | 指标框架测试 |
| `backend/tests/test_bench_api.py` | **新建** | Bench API 测试 |
| `frontend/src/pages/bench/__tests__/` | **新建目录** | Bench 前端组件测试 |
| `backend/tests/test_e2e_bench.py` | **新建** | Bench E2E |

#### 验收标准

- [ ] A 线：Market API 测试全部通过
- [ ] B 线：Bench 各引擎/API 测试全部通过（Mock LLM）
- [ ] E2E：Bench 全链路 30 个 task 全部完成且结果正确
- [ ] A+B 交叉回归：后端全量通过、前端全量通过
- [ ] 新代码行覆盖 ≥80%

---

### Step T4 — Phase 15 Bug 修补

> **目标：** 修 bugs.md 中 Phase 15 发现的 bug + T3 回归测试中暴露的问题。

#### 重点排查区域

| 区域 | 常见问题类型 | 排查方式 |
|------|-------------|---------|
| BatchScheduler 并发 | 死锁、资源泄漏、Semaphore 未释放 | `pytest --timeout=30` + `asyncio` 告警检测 |
| Bench metrics 计算 | 除零、空列表、JSON 序列化失败 | 边界值测试（空结果、单结果、极端值） |
| Market 评分 | 重复评分、未登录评分 | API 集成测试覆盖 |
| SSE 流交叉 | Team 和 Bench 的 SSE 流数据互串 | 两个 World 同时跑，检查 SSE 事件归属 |
| 前端 A+B 共存 | 两个新页面同时加载、路由不冲突 | 手动访问 `/team` 和 `/bench` 各 3 次 |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/bugs.md` | 修改 | 更新 Phase 15 bug 状态 |
| 各修复源文件 | 修改 | — |
| 各回归测试文件 | 修改 | 防止复活 |

#### 验收标准

- [ ] `docs/bugs.md` 中 Phase 15 发现的 bug 全部 `✅ fixed` 或 `📝 wontfix`（有注释）
- [ ] 每个 P0/P1 bug 有回归测试
- [ ] `pytest --timeout=30` 全量通过（无超时/死锁）
- [ ] `npx vitest run` 全量通过

> **节奏：** A 线（Bench 收尾）3 步，B 线（游戏化启动）4 步。此时 Bench 进度 ~50%，游戏化第一条线加入。

---

### 16a — Bench 收尾（A 线）

### Step 62 — 盲测模式

> **目标：** 实现 #25。评测时 Agent 身份脱敏，揭盲仪式感。

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/bench/blind.py` | **新建** | 脱敏策略：Agent 名 → "Agent-A"；LLM → "模型-X" |
| `frontend/src/pages/bench/BlindMode.tsx` | **新建** | 盲评 UI + 揭盲按钮 |

**验收标准：** ① 盲测中所有身份信息隐藏 ② 揭盲需确认操作 ③ 揭盲前后评分可对比（检测偏差）

### Step 63 — 长期追踪

> **目标：** 实现 #41。同一 Agent 跨版本/跨场景趋势 + 退化检测。

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/bench/tracker.py` | **新建** | AgentTrendTracker：历史数据聚合 + 退化检测 |
| `frontend/src/pages/bench/TrendView.tsx` | **新建** | 折线图趋势 + 退化标注 |

**验收标准：** ① 同 Agent 跨 ≥3 次评测的趋势图 ② 连续下降自动标注 ③ 跨场景对比

### Step 64 — Bench 报告

> **目标：** 自动生成学术风格的评测报告（Markdown + 图表）。

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/bench/reporter.py` | **新建** | ReportGenerator：模板 + 数据注入 + 图表 |
| `backend/src/api/bench.py` | 修改 | `GET /api/bench/runs/{id}/report` |
| `frontend/src/pages/bench/ReportView.tsx` | **新建** | Markdown 渲染 + 下载 |

**验收标准：** ① 报告含摘要/方法/结果/结论 ② 内嵌图表 ③ 可下载 Markdown + PDF

---

### 16b — 游戏化启动（B 线）

### Step 65 — 场景画布

> **目标：** 2D Canvas 渲染场景背景 + Agent 精灵 + 基础动画。

#### 设计

```
┌──────────────────────────────────────────────┐
│  🏛️ 科大图书馆 · Tick 12                      │
│                                              │
│    📚📚📚📚📚📚📚📚📚📚📚                     │
│    📚              📚    🧑 小红              │
│    📚  🧑 小明     📚    (ENFP, 社交中)       │
│    📚  (INTJ, 自习)📚                        │
│    📚              📚         🧑 小刚         │
│    📚📚📚📚📚📚📚📚📚📚📚    (ESTJ, 走向座位)  │
│                                              │
│  ─────────────────────────────────────────── │
│  ⏮ ⏪ ●━━━━━━━━○━━━━━━ ⏩ ⏭  Tick 12/50      │
└──────────────────────────────────────────────┘
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/scene/GameCanvas.tsx` | **新建** | HTML5 Canvas 主渲染循环 |
| `frontend/src/pages/scene/AgentSprite.tsx` | **新建** | Agent 精灵组件（位置 + 朝向 + 动画帧） |
| `frontend/src/pages/scene/SceneBackground.tsx` | **新建** | 场景背景渲染（静态 + 动态元素） |
| `frontend/src/pages/GameScene.tsx` | **新建** | `/scene` 页面入口：Canvas + HUD 叠加层 |
| `frontend/src/api/scenes.ts` | **新建** | useSceneState / useSceneTimeline |
| `backend/src/api/scenes.py` | **新建** | `GET/POST /api/scenes` |
| `backend/src/main.py` | 修改 | 注册 scenes router |

**技术选型：** Phase 16 初判用原生 Canvas API（零依赖，可控性最强），如性能不达标再评估 PixiJS。Agent 最多 10 个同屏，不需要游戏引擎级优化。

#### 验收标准

- [ ] Canvas 渲染场景背景（至少 1 个内置场景）
- [ ] Agent 以圆形头像 + 名字标签显示在场景中
- [ ] Agent 位置随模拟事件移动（坐→走→站）
- [ ] 基础动画：移动有缓动、社交有气泡

---

### Step 66 — 头像 + 情绪系统

> **目标：** 实现 #35。AI 生成 Agent 头像，情绪变化反映在头像表情上。

#### 设计

```
中性 😶 → 开心 😊 → 焦虑 😰 → 愤怒 😡
每个情绪状态对应：头像底色变化 + 表情符号 + 微动画
```

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/scene/avatar.py` | **新建** | AvatarGenerator：人格→头像参数（颜色/形状/装饰） |
| `backend/src/api/scenes.py` | 修改 | `GET /api/scenes/{id}/sprites`（含情绪状态） |
| `frontend/src/pages/scene/AgentSprite.tsx` | 修改 | 情绪表情渲染 + 过渡动画 |
| `frontend/src/pages/scene/EmotionBubble.tsx` | **新建** | 情绪气泡弹出效果 |

**验收标准：** ① 每个 Agent 有唯一头像（颜色/形状不同） ② 情绪变化时头像表情 500ms 过渡 ③ 极端情绪时触发特殊效果（愤怒→抖动/开心→跳动）

---

### Step 67 — 时间轴

> **目标：** 实现 #45。底部时间轴可拖拽回退到任意 tick，配合快照机制。

#### 设计

```
TimeSlider:
  ┌──────────────────────────────────────────────┐
  │  ⏮    ⏪    ●━━━━━━○━━━━━━━━━━    ⏩    ⏭    │
  │ tick 0     5    12(current)          50(end) │
  │           ↑ 悬停显示：                         │
  │           "T5: 小明离开座位 · 小红开始搭讪"     │
  └──────────────────────────────────────────────┘

回退行为：拖动滑块 → Canvas 回退到该 tick 的快照 → Agent 位置/情绪还原
```

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/scene/snapshot.py` | **新建** | SnapshotManager：每 tick 保存场景快照 |
| `backend/src/api/scenes.py` | 修改 | `GET /api/scenes/{id}/timeline?tick=N` |
| `frontend/src/pages/scene/Timeline.tsx` | **新建** | 可拖拽时间轴组件 |
| `frontend/src/pages/scene/GameCanvas.tsx` | 修改 | 回退渲染逻辑 |

**验收标准：** ① 拖动滑块 → Agent 位置/情绪/对话回退到该 tick ② 回退后 2s 内渲染完成 ③ 关键 tick 标注（决策点）

---

### Step 68 — 交互系统

> **目标：** 点击 Agent 弹面板；拖拽移动位置；右键发耳语。

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/scene/InteractionLayer.tsx` | **新建** | 点击/拖拽/右键事件处理 |
| `frontend/src/pages/scene/AgentPanel.tsx` | **新建** | 弹出面板：人格/情绪/记忆/关系 |
| `frontend/src/pages/scene/WhisperBox.tsx` | **新建** | 耳语输入框 |
| `backend/src/api/scenes.py` | 修改 | `POST /api/scenes/{id}/interact`（移动/耳语） |

**验收标准：** ① 点击 Agent → 面板从右侧滑入 ② 拖拽 Agent → 实时移动 + 路径预览 ③ 耳语 → Agent 在下一个 tick 有反应

---

### Step T5 — Phase 16 性能测试 + E2E

> **目标：** A 线（Bench 收尾）+ B 线（游戏化启动）的测试，重点在**性能**——Canvas 帧率和批量并发是两个全新维度的测试挑战。

#### 测试清单

**Layer 1：性能测试（Phase 16 新增维度）**

| 测试 | 工具/方法 | 通过标准 |
|------|----------|---------|
| Canvas 帧率 | Chrome DevTools Performance 录制 30s，统计 FPS | 5 Agent 同屏 ≥30fps；10 Agent ≥20fps |
| Canvas 内存 | DevTools Memory → 录制 60s 模拟运行，观察堆曲线 | 无持续上升（无泄漏）；峰值 ≤200MB |
| 批量调度并发 | `pytest --timeout=120`；30 tasks、Semaphore=3 | 全部在 120s 内完成；无超时失败 |
| SSE 吞吐 | 5 个 World 同时跑 SSE stream | 前端不丢事件；后端 CPU ≤80% |
| 前端 Bundle | `npx vite build` → 检查 chunk 大小 | 单 chunk ≤500KB；总 bundle ≤2MB |

**Layer 2：A 线 — Bench 收尾**

| 被测模块 | 测试文件 | 覆盖内容 |
|---------|---------|---------|
| `blind.py` | `tests/test_bench_blind.py` | 脱敏完整性、揭盲流程、偏差计算 |
| `tracker.py` | `tests/test_bench_tracker.py` | 跨版本聚合、退化检测阈值、空历史兜底 |
| `reporter.py` | `tests/test_bench_reporter.py` | Markdown 结构完整、图表数据正确 |
| `BlindMode.tsx` | 新建测试 | 脱敏前后 UI 差异、揭盲确认弹窗 |
| `TrendView.tsx` | 新建测试 | 折线图渲染、退化标注显示 |
| `ReportView.tsx` | 新建测试 | Markdown 渲染、下载按钮 |

**Layer 3：B 线 — 游戏化启动**

| 被测模块 | 测试文件 | 覆盖内容 |
|---------|---------|---------|
| `GameCanvas.tsx` | **新建** `scene/__tests__/` | Canvas 渲染、Agent 位置更新、背景加载 |
| `AgentSprite.tsx` | 同上 | 精灵渲染、缓动动画、名字标签 |
| `EmotionBubble.tsx` | 同上 | 情绪气泡弹出/消失、过渡动画 |
| `Timeline.tsx` | 同上 | 滑块拖拽、tick 标签、快照切换 |
| `InteractionLayer.tsx` | 同上 | 点击命中检测、拖拽事件、右键菜单 |
| `AgentPanel.tsx` | 同上 | 面板滑入/滑出、数据加载 |
| `avatar.py` | `tests/test_scene_avatar.py` | 头像参数生成、情绪→颜色映射 |
| `snapshot.py` | `tests/test_scene_snapshot.py` | 快照保存/恢复、序列化完整性 |
| `scenes.py`（API） | `tests/test_scenes_api.py` | `GET state` / `GET timeline` / `POST interact` |

**Layer 4：E2E 全链路**

| 用例 | 步骤 | 验证点 |
|------|------|--------|
| `test_bench_blind_full_chain` | ① 创建盲测 run（A vs B） ② 查看脱敏结果 ③ 评分 ④ 揭盲 ⑤ 查看偏差分析 | 脱敏后身份不可见、揭盲有确认、偏差数据正确 |
| `test_scene_full_chain` | ① 创建场景 ② 放入 3 Agent ③ 启动模拟 ④ 观察 Canvas 渲染 ⑤ 拖拽 Agent ⑥ 发送耳语 ⑦ 拖动时间轴回退 ⑧ 查看分支 | Canvas 不白屏、拖拽后位置更新、耳语后 Agent 响应、时间轴回退正确 |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_bench_blind.py` | **新建** | 盲测引擎测试 |
| `backend/tests/test_bench_tracker.py` | **新建** | 追踪器测试 |
| `backend/tests/test_bench_reporter.py` | **新建** | 报告生成测试 |
| `backend/tests/test_scene_avatar.py` | **新建** | 头像引擎测试 |
| `backend/tests/test_scene_snapshot.py` | **新建** | 快照引擎测试 |
| `backend/tests/test_scenes_api.py` | **新建** | 场景 API 测试 |
| `frontend/src/pages/scene/__tests__/` | **新建目录** | Canvas + 精灵 + 交互组件测试 |
| `frontend/src/pages/bench/__tests__/` | 追加 | 盲测/趋势/报告组件测试 |
| `backend/tests/test_e2e_scene.py` | **新建** | 场景 E2E |

#### 验收标准

- [ ] Canvas ≥30fps（5 Agent 同屏）、内存无泄漏
- [ ] 批量调度 30 tasks 在 120s 内全完成
- [ ] A 线（Bench 收尾）引擎 + API + 前端测试全部通过
- [ ] B 线（游戏化）引擎 + API + 前端测试全部通过
- [ ] E2E：盲测全链路 + 场景全链路通过
- [ ] 回归测试全量通过

---

### Step T6 — Phase 16 Bug 修补

> **目标：** 修 Phase 16 新发现 bug——Canvas 渲染、性能瓶颈、Bench 边界 case。

#### 重点排查区域

| 区域 | 常见问题类型 | 排查方式 |
|------|-------------|---------|
| Canvas 渲染 | 白屏、精灵消失、动画卡顿、z-index 错乱 | 手动 5 Agent 跑 30s、切换场景 3 次 |
| 时间轴回退 | 快照不完整、回退后状态不一致、回退后再前进错乱 | 回退→前进→再回退循环 5 次 |
| 拖拽交互 | 拖出边界、快速双击、同时拖两个 Agent | 边界测试 case |
| Bench 盲测 | 揭盲后数据泄露、偏差为 0（应该有小偏差） | 验证脱敏前后 JSON 差异 |
| 长期追踪 | 数据不足（<3 次）时的兜底、退化误报 | 1/2/3/N 次数据的边界 |
| 前端 Bundle | 新 Canvas 库引入的包体积增长 | `npx vite build --mode production` |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/bugs.md` | 修改 | Phase 16 bug 状态 |
| 各修复源文件 | 修改 | — |
| 各回归测试文件 | 修改 | — |

#### 验收标准

- [ ] `docs/bugs.md` 中 Phase 16 发现的 bug 全部 `✅ fixed` 或 `📝 wontfix`
- [ ] Canvas 无渲染异常（白屏/撕裂/闪烁）
- [ ] 时间轴回退→前进循环无状态错乱
- [ ] Bundle size ≤2MB

> **节奏：** 单线收束。游戏化完工（3 开发步）+ 全项目打磨（3 测试步）+ 科大主题（1 开发步）。

---

### Step 69 — 导演模式

> **目标：** 实现 #44、#47、#49。上帝之声 + 人格篡改 + 剧本触发器——三位一体导演工具。

#### 设计

```
┌─ 导演面板 ────────────────────────┐
│  🎬 导演模式                       │
│                                    │
│  [🗣️ 上帝之声]                      │
│  目标: [小明 ▼]                     │
│  消息: "你喜欢的那个座位，现在去还   │
│         来得及"                     │
│  [发送]                             │
│                                    │
│  [⏰ 剧本触发器]                     │
│  Tick 10: 图书馆广播"15分钟后闭馆"   │
│  Tick 20: 小刚接到导师电话          │
│  [+ 添加触发器]                     │
│                                    │
│  [🧬 人格篡改]                      │
│  目标: [小红 ▼]                     │
│  外倾性: ████░░ → ██████░ (+20)    │
│  [应用]                             │
└────────────────────────────────────┘
```

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/scene/DirectorPanel.tsx` | **新建** | 导演面板三合一套件 |
| `backend/src/api/scenes.py` | 修改 | `POST /api/scenes/{id}/director/whisper` / `trigger` / `tamper` |
| `backend/src/engines/scene/director.py` | **新建** | DirectorEngine：剧本调度 + 强制事件注入 |

**验收标准：** ① 上帝之声 → Agent 在 2 tick 内响应 ② 剧本触发器在指定 tick 准时执行 ③ 人格篡改后 Agent 行为即刻改变

---

### Step 70 — 分支探索

> **目标：** 实现 #46。关键决策点自动分叉，可视化为分支树，平行对比不同分支。

#### 设计

```
分支树:
        T0 初始
         /\
        /  \
    T5-A  T5-B
   (去图书馆) (回宿舍)
     /\        |
    /  \       |
T10-A T10-B T10-C
(占座) (放弃) (偶遇)

选中分支 T5-A → Canvas 渲染该分支的场景
[并排对比 A vs B]
```

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/scene/branch.py` | **新建** | BranchEngine：识别决策点 → 创建分叉 → 分别模拟 |
| `backend/src/api/scenes.py` | 修改 | `GET /api/scenes/{id}/branches`；`POST /api/scenes/{id}/branches/{bid}/activate` |
| `frontend/src/pages/scene/BranchTree.tsx` | **新建** | 分支树可视化（D3/自绘） |
| `frontend/src/pages/scene/BranchCompare.tsx` | **新建** | 分支并排对比 |

**验收标准：** ① 关键决策点自动创建分支（LLM 判断"这是否是分叉点"） ② 分支树可点击切换 ③ 两个分支可并排对比

---

### Step 71 — 叙事导出

> **目标：** 实现 #33、#34。场景模拟结束后，生成微电影分镜 + 连载小说。

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/scene/exporter.py` | **新建** | 微电影分镜生成器 + 连载章节生成器 |
| `backend/src/api/scenes.py` | 修改 | `POST /api/scenes/{id}/export/storyboard` / `export/serial` |
| `frontend/src/pages/scene/ExportPanel.tsx` | **新建** | 导出预览 + 格式选择 |

**验收标准：** ① 微电影导出为 8-12 镜分镜脚本 ② 连载按 tick 分段，每段 300-500 字 ③ 可下载 Markdown

---

### Step 72 — 全项目 Bug 清零

> **目标：** bugs.md 全部关闭 + 代码中 TODO/FIXME/HACK 归零。Phase 17 是最后一道防线——之后就是演示。

#### 工作流程

```
1. 读 docs/bugs.md → 列出全部 open bug（含 Phase 14/15/16 遗留）
2. 按严重度排序：P0（崩溃/数据丢失）→ P1（功能错误）→ P2（体验）
3. 逐一修复 → 写回归测试 → 验证 → 更新状态
4. 全项目扫描 TODO/FIXME/HACK——要么修、要么转成 bugs.md 条目
5. 前端 console 全量检查：每个页面打开 → F12 → 确认零警告零错误
```

#### 排查清单

| 类别 | 排查方式 | 通过标准 |
|------|---------|---------|
| bugs.md | `cat docs/bugs.md` | 全部 `✅ fixed` 或 `📝 wontfix`（有注释） |
| TODO/FIXME/HACK | `grep -rn "TODO\|FIXME\|HACK" backend/src frontend/src --include="*.py" --include="*.ts" --include="*.tsx"` | 0 结果（或全部转为 bugs.md 条目） |
| 后端异常 | `grep -rn "except Exception\|except:" backend/src --include="*.py"` | 每处有 logger.error 或明确注释 |
| 前端 console | 逐一打开 11 个页面（M1–M11），保持 10s，检查 console | 零 error、零 warning |
| 类型安全 | `cd frontend && npx tsc --noEmit` | 零错误 |
| Lint | `cd frontend && npx eslint src/`（如有配置） | 零新增告警 |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `docs/bugs.md` | 修改 | 全量更新为 fixed/wontfix |
| 各 bug 对应源文件 | 修改 | 修复代码 |
| 各 bug 对应测试文件 | 修改 | 回归测试 |

#### 验收标准

- [ ] `docs/bugs.md` 零 open bug
- [ ] `grep -r "TODO\|FIXME\|HACK"` 归零
- [ ] 11 个页面 console 零 error/warning
- [ ] `tsc --noEmit` 零错误
- [ ] 全量回归测试通过

---

### Step 73 — 覆盖率 + E2E 全链路

> **目标：** 后端行覆盖 ≥90%。5 条全链路 E2E 全部通过，覆盖 State 2 + State 3 所有关键路径。

#### 覆盖率目标

| 模块 | 当前覆盖（估） | 目标 | 差距补齐方式 |
|------|-------------|------|-------------|
| `engines/team/` | 0%（新） | ≥85% | T1/T3 已打底，本步补边界 case |
| `engines/bench/` | 0%（新） | ≥85% | T3/T5 已打底，本步补并发/超时 |
| `engines/scene/` | 0%（新） | ≥80% | T5 已打底，Canvas 层难测、降标 |
| `api/teams.py` | 0%（新） | ≥90% | 集成测试覆盖全部端点 |
| `api/bench.py` | 0%（新） | ≥90% | 同上 |
| `api/scenes.py` | 0%（新） | ≥90% | 同上 |
| State 2 全部模块 | ~75% | ≥90% | 补边界 case + 错误路径 |

**覆盖率命令：**
```bash
cd backend
PYTHONPATH=src python -m pytest tests/ \
  --cov=src \
  --cov-report=term \
  --cov-report=html \
  --cov-fail-under=90
```

#### 5 条 E2E 全链路

| # | 名称 | 步骤 | 涉及模块 | 预期时长 |
|---|------|------|---------|---------|
| E2E-1 | 铸造→Team | 创建 3 Agent → 组队 → 分配任务 → 执行 10 tick → 暂停 → 查看健康分 → 结束 → 复盘报告 | M1 + M9 | ~60s |
| E2E-2 | 铸造→Bench | 创建 5 Agent → 选 3 场景 × 2 LLM × 2 repeat → 批量运行 → 盲测 → 揭盲 → 对比 → 排行榜 | M1 + M4 + M10 | ~90s |
| E2E-3 | 铸造→场景 | 创建 3 Agent → 选科大图书馆 → Canvas 渲染 → 跑 5 tick → 耳语 → 时间轴回退 → 分支创建 | M1 + M11 | ~45s |
| E2E-4 | 竞技全链路 | 创建 2 Agent → 1v1 辩论（3 轮）→ 查看战报 → 复盘对比 | M1 + M4 | ~30s |
| E2E-5 | 叙事全链路 | 跑完模拟 → 生成小说 → 生成日记 → 生成未来的信 → 生成播客脚本 | M2/M3 + M5 | ~40s |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_e2e_all.py` | **新建** | 5 条 E2E 全链路（Mock LLM，真 DB） |
| 各覆盖率不足的模块测试 | 修改/新建 | 补齐边界 case |

#### 验收标准

- [ ] `pytest --cov=src --cov-fail-under=90` 通过
- [ ] 5 条 E2E 全部通过
- [ ] E2E 运行总时长 ≤5 分钟
- [ ] `htmlcov/index.html` 可查看逐行覆盖

---

### Step 74 — 演示排练 + 文档

> **目标：** 3 条 Demo 路径可独立演示 → README → API 文档补全。比赛评委 5 分钟能看懂项目是什么、怎么跑。

#### 3 条 Demo 路径（含时间轴 + 台词）

**Demo 1 · 协作之旅（目标 8 分钟）**

| 时间 | 操作 | 讲解要点 | 屏幕 |
|------|------|---------|------|
| 0:00 | 打开铸造厂，自然语言创建"产品经理小红"和"全栈开发小明" | "只需要一句话描述，AI 自动生成完整人格" | M1 |
| 1:30 | 进入 Agent Team，点击"新建 Team"，选两个 Agent | "Agent 角色由系统根据人格自动推荐" | M9 |
| 2:30 | 输入任务"设计一个校园社交 App"，点击执行 | "AI 会自动分解任务并分配给合适的 Agent" | M9 |
| 3:30 | Kanban 看板实时更新，对话流显示 Agent 在争论 | "你可以看到 Agent 在真实地讨论、分工、推进" | M9 |
| 5:00 | 暂停 → 查看健康面板：协作分 87，无冲突 | "系统实时监控团队健康度" | M9 |
| 6:00 | 结束任务 → 打开复盘报告 | "自动生成包含关键决策点的复盘报告" | M9 |
| 7:00 | 展示报告内容：策略提取 + 决策回放 | "这就是 Agent 协作的完整可追溯记录" | M9 |

**Demo 2 · 评测对决（目标 5 分钟）**

| 时间 | 操作 | 讲解要点 | 屏幕 |
|------|------|---------|------|
| 0:00 | 打开 LLM Bench，拖拽 Agent 模板到实验设计器 | "像设计实验一样配置评测" | M10 |
| 1:00 | 选 3 个场景 × 2 种 LLM × 5 次重复 = 30 个任务 | "批量并发评测，一次跑完所有组合" | M10 |
| 2:00 | 点击启动 → 实时进度条 | "所有任务在后台排队并发的运行" | M10 |
| 3:00 | 盲测模式：结果脱敏 | "评测者不知道哪个是哪个，消除偏见" | M10 |
| 3:30 | 揭盲 → 并排对比 | "DeepSeek 在创造力上领先，GPT 在稳定性上更优" | M10 |
| 4:30 | 排行榜 + 趋势图 | "我们追踪同一 Agent 的长期表现变化" | M10 |

**Demo 3 · 图书馆的一天（目标 5 分钟）**

| 时间 | 操作 | 讲解要点 | 屏幕 |
|------|------|---------|------|
| 0:00 | 打开游戏化场景，选科大图书馆 | "这不是终端，这是一个有画面的世界" | M11 |
| 0:30 | 拖入 3 个 Agent → Canvas 显示头像和名字 | "每个 Agent 有唯一的 AI 生成头像" | M11 |
| 1:30 | 启动模拟 → Agent 在 Canvas 上移动、对话气泡弹出 | "他们的位置、表情、动作都是模拟实时驱动的" | M11 |
| 2:30 | Agent 情绪变化：小红从开心→焦虑（考试压力） | "情绪反映在头像的颜色和表情上" | M11 |
| 3:30 | 导演模式：点击小明的头像 → 输入耳语 | "你可以以上帝视角介入场景" | M11 |
| 4:00 | 拖拽时间轴回退到 T5 | "不满意？回到任意时刻重来，甚至分叉出平行世界" | M11 |
| 4:30 | 导出微电影分镜 | "一整场模拟变成可分享的故事" | M11 |

#### 文档交付

| 文档 | 内容 | 通过标准 |
|------|------|---------|
| `README.md` | 项目简介 + 安装（Python 3.12 + Node 20） + 启动 3 行命令 + Demo 入口截图 + 架构图 | 新开发者 10 分钟能跑起来 |
| API 文档（Swagger） | 每个端点补 `description` + `example` + `response_model` 注释 | `/docs` 页面可直接交互 |
| `docs/demo-script.md` | 上面 3 条 Demo 的完整台词 + 备用方案（LLM 挂了怎么办） | 不依赖特定 LLM 也能演示 |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `README.md` | 重写 | 安装→启动→Demo 入口 |
| `docs/demo-script.md` | **新建** | 3 条 Demo 完整剧本 |
| `backend/src/api/*.py` | 修改 | 补全 docstring + example |
| `frontend/src/pages/Home.tsx` | 修改 | 首页展示 3 大模块入口卡片 |

#### 验收标准

- [ ] 3 条 Demo 各排练 ≥2 次，时间误差 ≤30s
- [ ] README 被一个不懂项目的同事试跑通过
- [ ] Swagger `/docs` 全部端点可交互
- [ ] LLM 不可用时 Demo 1/2 仍可走通（Mock 降级方案）
- [ ] 非功能性细节（像素/颜色/文案）不作为验收项

---

### Step 75 — 科大主题

> **目标：** 继承 Step 34-S 的场景自定义能力。5 个科大校园场景 + 8 个角色模板 + 彩蛋，让评委/观众有代入感。

#### 5 个科大场景（通过 `POST /api/scenarios` 预置）

| 场景 id | 名称 | 描述 | 环境参数 | 背景图 |
|---------|------|------|---------|--------|
| `ustc-library` | 科大图书馆 | 西区图书馆自习区，期末考试周座位紧张 | `seats_available`: 100→0（每 tick -3） | 自习区俯视图（CSS 绘制） |
| `ustc-sakura` | 樱花大道 | 每年樱花季，游客涌入，学术与浪漫并存 | `tourist_count`: 逐渐增加；`photo_spots`: 热门打卡点 | 校园步道（CSS 绘制） |
| `ustc-lab` | 实验室组会 | 课题组周例会，导师 push vs 学生划水 | `report_order`: Agent 排序；`advisor_pressure`: 递增强度 | 会议室（CSS 绘制） |
| `ustc-course` | 选课大战 | 每学期选课系统崩溃，好课秒没 | `course_slots`: 递减；`server_health`: 随机波动 | 网页模拟（CSS 绘制） |
| `ustc-gym` | 科大健身房 | 有限的器材，人多时得排队 | `equipment_slots`: 递减；`social_chance`: 随机触发社交 | 健身区（CSS 绘制） |

#### 8 个科大角色模板（通过 `POST /api/templates` 添加）

| Agent id | 姓名 | 人格 | 背景 | 标签 |
|----------|------|------|------|------|
| `ustc-scholar` | 理科学霸 | INTJ-T | 物院大三，GPA 4.0，每天泡图书馆，社恐但学术极强 | 学霸 |
| `ustc-transfer` | 文科转码 | INFP-A | 从人文学院转到 CS，焦虑但努力，常怀疑自己是否来对地方 | 转码 |
| `ustc-founder` | 创业达人 | ENTJ-A | 信院研究生，在创业园有工位，到处拉人组队，说话像路演 | 创业 |
| `ustc-advisor` | 焦虑导师 | ESTJ-T | 刚拿 tenure 的青椒，push 学生发论文，自己也在焦虑中期考核 | 导师 |
| `ustc-dorm` | 佛系宿管 | ISFJ-A | 西区宿舍楼管阿姨，看尽学生百态，偶尔点拨迷茫的年轻人 | 宿管 |
| `ustc-senior` | 实验室师兄 | INTP-A | 博三老油条，对科研无热情但很会带师弟师妹，口头禅"慢慢来" | 师兄 |
| `ustc-chair` | 学生会主席 | ENFJ-A | 管院大三，组织力强但被课业+学生工作压得喘不过气 | 主席 |
| `ustc-foodie` | 吃货美食家 | ESFP-A | 对合肥小吃如数家珍，朋友圈全是美食评测，考前靠吃减压 | 吃货 |

#### 彩蛋清单

| 彩蛋 | 触发条件 | 效果 |
|------|---------|------|
| USTC 标识 | 首页加载 | 顶部"USTC × Life Lab" logo |
| 教务系统没崩 | Agent 在选课场景抢课成功 | 弹出 toast："恭喜你，这次教务系统没崩 🎉" |
| 天使路偶遇 | 樱花大道场景随机 | 两个 Agent 在"天使路"路牌下相遇 |
| 郭沫若广场 | 场景描述随机插入 | 事件描述中偶现"路过郭沫若广场" |
| 东活传说 | 科大健身房场景 | Agent 对话中提及"东活后面那家麻辣烫" |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/world/scenarios.py` | 修改 | 追加 5 个科大场景（内置，不可删） |
| `backend/src/data/templates.json` | 修改 | 追加 8 个科大模板 |
| `frontend/src/pages/Home.tsx` | 修改 | 首页加 USTC 标识 |
| `frontend/src/pages/scene/SceneBackground.tsx` | 修改 | CSS 绘制 5 个场景背景 |
| `frontend/src/components/shared/Toast.tsx` | **新建** | 彩蛋 toast 通知组件 |

#### 验收标准

- [ ] 5 个科大场景在 SandboxSetup/SceneCanvas 可选
- [ ] 8 个科大模板在 AgentFoundry 模板浏览器可见
- [ ] 首页有 USTC × Life Lab 标识
- [ ] 选课场景抢课成功触发 toast 彩蛋
- [ ] 至少 1 个科大场景可在 Demo 3 完整跑通

---

## 附录 A: 18 功能嵌入映射

| 功能 | 状态 | 嵌入 Step | 嵌入位置 |
|------|------|----------|---------|
| #11 动态计划调整 | ⏭️ P1 | Step 52 | Team 工作流引擎 Plan 模型 |
| #13 决策回放 | ✅ P2 | Step 55 | Team 复盘报告回放功能 |
| #19 角色冲突 | ✅ P2 | Step 54 | Team 诊断冲突检测 |
| #21 群体动力学 | ✅ P2 | Step 55 | Team 复盘协作分析 |
| #25 盲测模式 | ❌ P3 | Step 62 | Bench 盲测脱敏+揭盲 |
| #27 排行榜 | ❌ P3 | Step 61 | Bench 多维排行榜 |
| #28 A/B 测试 | ❌ P3 | Step 60 | Bench 并排对比 UI |
| #33 微电影大纲 | ❌ P3 | Step 71 | 游戏化叙事导出 |
| #34 自动连载 | ❌ P3 | Step 71 | 游戏化叙事导出 |
| #35 Agent 自画像 | ❌ P3 | Step 66 | 游戏化头像系统 |
| #40 异常检测 | ❌ P3 | Step 54 | Team 诊断行为偏离 |
| #41 长期追踪 | ❌ P3 | Step 63 | Bench 趋势+退化检测 |
| #42 策略提取 | ❌ P3 | Step 55 | Team 复盘策略总结 |
| #44 上帝之声 | ❌ P3 | Step 69 | 游戏化导演模式 |
| #45 时间回溯 | ❌ P3 | Step 67 | 游戏化时间轴 |
| #46 分支探索 | ❌ P3 | Step 70 | 游戏化分支树 |
| #47 人格篡改 | ❌ P3 | Step 69 | 游戏化导演模式 |
| #49 剧本模式 | ❌ P3 | Step 69 | 游戏化导演模式 |
| #50 Agent 市场 | ❌ P3 | Step 56 | Team 市场分享 |
| #53 社区大屏 | ❌ P3 | Step 74 | 演示用全局统计 |
| #56 API 开放 | ❌ P3 | Step 57 | Team API 文档+端点 |

> 注：#13、#19、#21 在 State 2 Step 41 已实现，State 3 需要确保不回归并在新模块中复用。

---

## 附录 B: 测试线详细指标

| Step | 类型 | 具体内容 | 通过标准 |
|------|------|---------|---------|
| T1 | 单元+E2E | 新代码 pytest + vitest；Team 创建→执行→复盘 全链路 | 新代码覆盖 ≥80%；E2E 通过 |
| T2 | Bug 修补 | bugs.md 中的现存 bug | 全部关闭 |
| T3 | 集成+E2E | Team API + Bench 批量调度 全链路 | 通过 |
| T4 | Bug 修补 | Phase 15 新发现 bug + bugs.md | 全部关闭 |
| T5 | 性能+E2E | Canvas ≥30fps（5 Agent）；Bench+Scene 全链路 | 帧率达标；E2E 通过 |
| T6 | Bug 修补 | Phase 16 新发现 bug | 全部关闭 |
| T7 (72) | Bug 清零 | 全项目 bugs.md + TODO/FIXME/HACK 扫描 | 全部关闭/归零 |
| T8 (73) | 覆盖率+E2E | pytest --cov ≥90%；5 条全链路 E2E | 覆盖率达标；5/5 通过 |
| T9 (74) | 演示排练 | 3 条 Demo 路径 + README + API 文档 | 每条 3-8 分钟可独立演示 |

---

## 附录 C: 菜单架构演进

```
State 2（当前）                       State 3（目标）
━━━━━━━━━━━━━━━━━━━━━━━━━━━          ━━━━━━━━━━━━━━━━━━━━━━━━━━━
M1 铸造厂 · /agents                   M1–M8 保持不动（同上）
M2 单人剧场 · /theater
M3 群体沙盒 · /sandbox                ─── 分隔线 ───
M4 竞技场 · /arena
M5 叙事工厂 · /narratives             M9  Agent Team  · /team      🆕
M6 控制台 · /control                  M10 LLM Bench   · /bench     🆕
M7 干预台 · /intervention             M11 游戏化场景  · /scene      🆕
M8 档案馆 · /archive
                                      子项不再挂在侧边栏，
P3 子项（56 个菜单项中的 18 个）          进入大模块后通过内部 Tab 访问
仍挂侧边栏，但显示为 P3 badge
```

---

> **最后更新:** 2026-07-26
> **维护者:** 晓音_Stingray
> **版本:** 3.0 (Plan State 3)
> **基准:** State 2 56 项功能审计 + 18 项剩余功能
> **设计重点:** 大模块出彩（Team 的协作可见、Bench 的盲测仪式、游戏化的 Canvas 交互）
