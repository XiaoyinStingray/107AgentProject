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
| 51 | 14.1 | 开发 | Team 组建 | 29, 35 | `teams` 表 + 编组 + 角色分配 + API | ✅ |
| 52 | 14.2 | 开发 | 工作流引擎 + Plan 模型 | 51, 40 | TaskDecomposer + PlanManager + LLM 协调器 | ✅ |
| 53 | 14.3 | 开发 | Team 看板 UI + 执行闭环 | 51, 52 | `/team` 页：左右分栏（对话+进展）+ 报告+评估 | ✅ |
| 54 | 14.4 | — | Team 诊断（精简） | — | 评估降级为报告页「📊 评估团队」按钮 | ✅ |
| 55 | 14.5 | — | 复盘报告（精简） | — | 完成自动生成报告 + 下载 + PlanRow.report 持久化 | ✅ |
| T1 | — | 测试 | Phase 14 单元 + 集成 + E2E | 51–55 | 后端 6 测试文件 + 前端 5 组件测试 + E2E | 3h |
| T2 | — | 测试 | Phase 14 Bug 修补 | T1 | bugs.md 现存 bug 清零 + 回归测试 | 2h |
| **🏗️ Phase 15: LLM Bench** | | | | | | |
| 56 | — | 开发 | Team 模板 | 55 | 本地保存/复用 Team 配置（#50 降级，Phase 14 收尾） | ✅ |
| 57 | — | — | ~~API 开放~~ | — | 已砍——单机版无外部程序场景 | 🗑️ |
| 58 | 15.1 | 开发 | 批量评测调度 + 指标 | 33, 35 | 标准化套件 27 条 + 六维评分 + 六边形图 + 报告（59 合并交付） | ✅ |
| 59 | 15.2 | 开发 | 六边形图 + 报告 | — | 已合并到 Step 58 | ✅ |
| 60 | 15.3 | 开发 | 对比与盲测 | 59 | 多次评测并排对比 + 身份脱敏 + 揭盲 + 差异可视化 | 4h |
| 61 | 15.4 | 开发 | 排行榜与趋势 | 60 | 多维排序 + 长期追踪 + 退化检测 | 3h |
| T3 | — | 测试 | Phase 15 集成 + E2E | 58–61 | Bench 全链路（配置→27条评测→六边形→报告） | 3h |
| T4 | — | 测试 | Phase 15 Bug 修补 | T3 | 并发调度 + 指标边界 + 前端性能 | 2h |
| **🏗️ Phase 16: 游戏化场景** | | | | | | |
| 62 | 16.1 | 开发 | 场景引擎 | — | TileMap 引擎 + 六场景 JSON 地图 + 纯程序化纹理 | 5h |
| 63a | 16.2 | 开发 | Agent 精灵 + 动作（前端） | 62 | AgentSprite 类 + ActionBubble + Mock 数据 + 4 动作 | 3h |
| 63b | 16.2 | 开发 | 场景后端 API | 63a | `POST /api/scenes/{id}/state` + SceneEngine 基础 | 2h |
| 64a | 16.3 | 开发 | 点击 + 拖拽交互（前端） | 63a | Agent 点击→面板；拖拽→移动；Phaser↔React 事件 bridge | 3h |
| 64b | 16.3 | 开发 | 右键耳语 + 双击篡改 | 64a, 63b | 右键→WhisperBox；双击→PersonaTamper；需真实 Agent 数据 | 3h |
| 64c | 16.3 | 开发 | Agent 对话循环（Mock） | 64a, 63b | 接近检测+冷却+Mock对话数据（性格×场景）+气泡循环+后端占位 | 4h |
| 65 | 16.4 | 开发 | 时间轴 + 快照 | 62, 63b | 拖拽回退 tick + 每 tick 场景快照 + 状态还原 | 4h |
| 66 | 16.5 | 开发 | 特效 + 导演 | 63a, 64a | 气泡/天气/情绪动画 + 剧本触发器 + 上帝之声 + 分支入口 | 5h |
| 66-S | 16.6 | 开发 | LLM 升级 + 情绪引擎 + 内容丰富 | 64c | Mock→LLM+情绪系统(对话/环境/随机/共鸣/decay)+物品互动+随机事件+表情扩充+随机引擎 | 5h |
| T5 | — | 测试 | Phase 16 性能 + E2E | 62–66 | 6 场景渲染 + 5 Agent 同屏流畅 + 时间轴回退全链路 | 3h |
| T6 | — | 测试 | Phase 16 Bug 修补 | T5 | 渲染异常 + 拖拽 + 快照还原 | 2h |
| **🎯 Phase 17: 打磨交付** | | | | | | |
| 67 | 17.1 | 开发 | 叙事导出 | 66 | 微电影 + 连载 + 自画像 | 3h |
| 68 | 17.2 | 开发 | P3 菜单清理 | — | 移除 17 个 P3 菜单项 | 0.5h |
| 69 | — | 测试 | 全项目 Bug 清零 | 全 | bugs.md 关闭；TODO/FIXME 归零 | 4h |
| 70 | — | 测试 | 覆盖率 + E2E 全链路 | 全 | 后端行覆盖 ≥90%；E2E ×5 | 4h |
| 71 | — | 测试 | 演示排练 + 文档 | 全 | 3 条 Demo 含台词/时间轴；README | 4h |
| 72 | 17.3 | 开发 | 科大主题 | 34-S | 6 场景内置 + 8 模板 + 彩蛋 + 首页 USTC 标识 | 4h |

> **共 28 个 Step。** 开发 18 步，测试 10 步。Phase 14–15 已交付。
> **总计估时：** ~85 小时（一人 + AI）

---

## 目录

- [架构设计：大模块 vs 小功能](#架构设计大模块-vs-小功能)
- [Phase 14: Agent Team](#phase-14-agent-team)
  - [Step 51–55: 开发](#step-51--team-组建)
  - [Step T1: 单元 + 集成 + E2E](#step-t1--phase-14-单元测试--集成测试--e2e)
  - [Step T2: Bug 修补](#step-t2--phase-14-bug-修补)
- [Phase 15: LLM Bench](#phase-15--llm-bench-设计)
  - [Step 56–57: A 线](#step-56--agent-市场)
  - [Step 58–61: B 线](#step-58--批量调度器)
  - [Step T3: 集成 + E2E](#step-t3--phase-15-集成测试--e2e)
  - [Step T4: Bug 修补](#step-t4--phase-15-bug-修补)
- [Phase 16: 游戏化场景](#phase-16--游戏化场景rpg-maker-风格)
  - [Step 62: 场景引擎](#step-62--场景引擎)
  - [Step 63: Agent 精灵 + 动作](#step-63--agent-精灵--动作系统)
  - [Step 64: 交互系统](#step-64--交互系统)
  - [Step 65: 时间轴 + 快照](#step-65--时间轴--快照)
  - [Step 66: 特效 + 导演](#step-66--特效--导演模式)
- [Phase 17: 打磨交付](#phase-17--打磨交付)
  - [Step 67: 叙事导出](#step-67--叙事导出)
  - [Step 68: P3 菜单清理](#step-68--p3-菜单清理)
  - [Step 69–72: 测试/演示/科大主题](#step-6972--测试演示科大主题)
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

### Phase 15 — LLM Bench 设计

> Life Lab 是天然的 LLM 评测平台。传统 benchmark 只测"答对了吗"，我们测"演得像吗"——Agent 需要持续维持人格、做决策、社交互动，评测的是 LLM 驱动角色的能力。

#### 六维评测体系

| 维度 | 定义 | 评分依据（来自平台数据） |
|------|------|------------------------|
| **人格一致性** | 行为贴合 MBTI/大五的程度 | 情绪波动范围、decision_style 匹配度 |
| **决策质量** | 选择是否连贯、目标导向 | Goal 完成率、行动步骤的逻辑链长度 |
| **交互深度** | 社交是否丰富、语境恰当 | 对话轮次、消息长度、关系变化幅度 |
| **鲁棒性** | 跨场景/跨重复的稳定性 | 同维度 3 次重复的方差（越小越稳定） |
| **创造力** | 行为多样性、非重复性 | 事件类型熵、独特 tool call 种类数 |
| **适应性** | 对环境变化的响应 | stress_level 变化时的行为调整速度 |

每维 0-100 分，最终输出六边形雷达图 + 分析报告。

#### 标准化评测套件

```
3 标准 Agent 模板               3 标准场景                标准任务
───────────────────            ─────────────────        ──────────
INTJ 学霸（理性、孤僻）          期末周（资源竞争）         生存 8 tick
ENFP 社交家（外向、创意）        新生报到（社交建立）       自由互动
ESTJ 领导者（果断、务实）        毕业选择（道德困境）       做出决策

每 LLM = 3 Agent × 3 场景 × 3 次重复 = 27 条标准化评测记录
统计上可比较、可复现、可写进论文章节。
```

### Step 56 — Team 模板

> **目标：** 实现 #50。Team 配置本地保存为模板。已交付，见 [done/step-56.md](done/step-56.md)。

### Step 57 — ~~API 开放~~ 🗑️ 已砍

### Step 58 — 批量评测调度 + 指标 ✅

> **实际产出（含 Step 59 合并）见 [done/step-58.md](done/step-58.md)。**

<details><summary>原设计（点击展开）</summary>

#### 设计

```
POST /api/bench/runs {api_key, base_url, model}
  → BatchScheduler:
    for agent_tpl in [INTJ, ENFP, ESTJ]:
      → 用指定 LLM 创建 Agent
      for scenario in [期末周, 新生报到, 毕业选择]:
        for repeat in range(3):
          → 创建 World → run 8 ticks → 收集 events
          → MetricCalculator 计算六维分数 → 写入 BenchResult
    → 聚合 27 条记录的平均分 → 写入 BenchRun.scores_json
    → LLM 生成分析报告 → 写入 BenchRun.report
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/models/bench_orm.py` | **新建** | BenchRun + BenchResult 表（含 scores_json / report 列） |
| `backend/src/engines/bench/__init__.py` | **新建** | 包初始化 |
| `backend/src/engines/bench/scheduler.py` | **新建** | BatchScheduler：遍历套件 → 创建 World → run → 采集 |
| `backend/src/engines/bench/metrics.py` | **新建** | MetricCalculator：六维评分器 + 归一化公式 |
| `backend/src/engines/bench/reporter.py` | **新建** | 分析报告生成（LLM 聚合 27 条评分 → 文本报告） |
| `backend/src/api/bench.py` | **新建** | `POST/GET /api/bench/runs` + `GET /api/bench/runs/{id}` + `GET /api/bench/runs/{id}/report` |
| `backend/src/db.py` | 修改 | 注册 bench_orm |
| `backend/src/main.py` | 修改 | 注册 bench router |

#### 验收标准

- [ ] 输入 LLM 配置 → 27 条评测全部执行完毕
- [ ] 每条评测有六维分数写入 BenchResult
- [ ] 聚合后的平均分写入 BenchRun.scores_json
- [ ] LLM 分析报告写入 BenchRun.report
- [ ] 超时/失败 task 的 metric 有兜底值（0 分）

</details>

### Step 59 — 六边形图 + 报告 UI

> **实际与 Step 58 合并交付。** 详见 [done/step-58.md](done/step-58.md)。

### Step 60 — 对比与盲测

> **目标：** 多次评测并排对比 + 盲测。

### Step 61 — 排行榜与趋势

> **目标：** 多维排序 + 长期追踪 + 退化检测。

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

## Phase 16 — 游戏化场景

> 技术选型：**Phaser 3**（60KB gzip + 可选模块），参考 [Sigil](https://github.com/gecko0307/sigil) RPG 引擎设计。
> Phaser 提供 tilemap、sprite 动画、输入处理、camera——对这些需求来说是标准答案，不必重复造轮子。
> Phaser 通过 `useRef` 挂载到 React，状态通过 event emitter 双向同步。

### 架构

```
React (state + UI panels)
  ↕  event emitter
Phaser 3 Canvas (tilemap + sprites + input)
  ↕  REST + SSE
Backend (WorldEngine + scene state)
```

**Phaser 场景 = 我们的 GameScene。** Phaser 负责渲染和输入，React 负责面板 UI 和时间轴。

### 数据模型（确定版）

```typescript
// ===== 地图 =====
interface TileMap {
  id: string;                    // "library"
  name: string;                  // "科大图书馆"
  width: number;                 // 12 (tiles)
  height: number;                // 8
  tileSize: number;              // 48 (px)
  tileset: string;               // "library" → 映射到 tilesets/library.png
  layers: {
    ground: number[][];          // [row][col] tile index
    objects: number[][];         // 0 = empty, 非0 = 物品 tile index
  };
  items: SceneItem[];            // 可交互物品
  spawns: {x: number; y: number}[];
  weather: "clear" | "sakura" | "rain" | "sunset";
}

interface SceneItem {
  id: string;                    // "seat-3"
  type: "seat" | "desk" | "pc" | "piano" | "easel" | "board" | "bed" | "tree" | "bench" | "vending";
  tileX: number; tileY: number;
  state: "empty" | "occupied" | "active";
}

// ===== Agent 精灵 =====
interface AgentSprite {
  agentId: string;
  name: string;                  // "小明"
  emoji: string;                 // "🧑" — LLM 生成的 Unicode
  tileX: number; tileY: number;  // 当前 tile 坐标
  facing: 0 | 1 | 2 | 3;        // 0=down 1=left 2=right 3=up
  action: "idle" | "walk" | "sit" | "talk" | "use_item" | "emote";
  emotion: "neutral" | "happy" | "anxious" | "angry" | "sad";
  bubble: string | null;         // 对话/思考气泡文字
  bubbleType: "speech" | "thought" | "emote" | null;
}

// ===== 快照 =====
interface SceneSnapshot {
  tick: number;
  agents: AgentSprite[];
  items: SceneItem[];
  timestamp: string;
}
```

### 精灵图生成方案（不做美术资源）

不用传统 spritesheet。用 **Canvas 动态绘制 32×32 精灵帧**：
- 身体 = emoji 缩小到 24px + CSS 圆形裁切
- 名字 = 4px 字体在下方
- 情绪 = 颜色叠加层（开心→绿、焦虑→黄、愤怒→红）
- 朝向 = 简单箭头指示
- 所有帧在初始化时生成到 Phaser texture cache

每个 Agent 生成 5 种动作 × 4 个朝向 = 20 帧。5 个 Agent = 100 帧。全部程序化生成，零外部资源。


### Step 62 — 场景引擎 + Phaser 挂载

**目标：** Phaser 3 挂载到 React → 加载六场景地图 → tilemap 渲染 → 物品层。

**实现细节：**
1. `phaser` npm 包安装（phaser@3.80+）
2. `GameCanvas` 组件：`useRef<HTMLDivElement>` → `new Phaser.Game({type: Phaser.AUTO, parent: ref})`
3. 注册一个 `BootScene`（加载 tileset）+ 六个 `MapScene`（library/dorm/classroom/art/lab/sakura）
4. 每场景加载 JSON 地图 → `this.make.tilemap({data: layers.ground, tileWidth: 48})`
5. tileset 用 6 色 48×48 纯色块（木地板/地砖/水磨石/草地/石板/白地砖）→ 动态 Canvas 生成
6. 物品层：tilemap 第二层 + `this.add.sprite()` 覆盖 emoji 图标
7. React 侧：场景选择器 `<select>` → Phaser `this.scene.start(mapId)`

**涉及文件：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | `+ "phaser": "^3.80.0"` |
| `frontend/src/data/scenes/*.json` | **新建×6** | 六场景地图 JSON（12×8 网格 + 物品列表） |
| `frontend/src/game/GameCanvas.tsx` | **新建** | React 挂载 Phaser |
| `frontend/src/game/scenes/BootScene.ts` | **新建** | 生成 tileset texture + 加载 |
| `frontend/src/game/scenes/MapScene.ts` | **新建** | tilemap 渲染 + 物品层 |
| `frontend/src/game/tileset.ts` | **新建** | 6 色 48×48 纯色块 Canvas 生成器 |
| `frontend/src/pages/GameScene.tsx` | **新建** | `/scene` 页面：选择器 + GameCanvas |

**验收标准：** Phaser Canvas 显示、六场景切换无报错、tilemap 正确渲染、物品 emoji 显示在对应 tile。

### Step 63a — Agent 精灵 + 动作（前端）

**目标：** 5 个 Agent 显示在场景中 → 动作驱动精灵帧。纯前端 + Mock 数据，后端 API 留给 63b。

**实现细节：**
1. `AgentSprite` 类（Phaser.GameObjects.Container）：
   - 子元素：Circle(r=18px, 个性色) + Text(emoji, 16px) + Text(name, 9px)
   - 精灵 ~48px 整体高度，比 32px tile 大约 1.5 倍，名字清晰可读
   - 4 种动作：idle（呼吸 scale）、walk（tween 移动 300ms）、sit（scale 0.8 + y 偏移）、talk（气泡弹出）
   - 5 种情绪色：neutral=个性色、happy=绿、anxious=黄、angry=红、sad=蓝灰
2. `ActionBubble` 类：跟随 Agent 的圆角矩形 + 文字，2.5s 后 fade out
3. 位置映射：`(tileX*32+16, tileY*32+16)` — 对齐 Step 62 的 32px tile
4. Mock 数据：5 Agent（小林/小红/小刚/小雪/阿杰），不同人格，不同初始位置

**涉及文件：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/sprites/AgentSprite.ts` | **新建** | Agent 精灵类（Container） |
| `frontend/src/game/sprites/ActionBubble.ts` | **新建** | 气泡类 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | 创建/更新 Agent 精灵层 |
| `frontend/src/game/GameCanvas.tsx` | 修改 | 接收 agents prop → 同步到 MapScene |
| `frontend/src/pages/GameScene.tsx` | 修改 | 提供 mock agent 数据 + 场景切换时重设位置 |

**验收标准：** 5 Agent sprite 正确渲染、walk 动画流畅 300ms、情绪变色、气泡弹出/消失。

### Step 63b — 场景后端 API

**目标：** `POST /api/scenes/{id}/state` 返回 `AgentSprite[]`，前端从 Mock 切换到真实 API。

**涉及文件：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/scenes.py` | **新建** | `POST /api/scenes/{id}/state` |
| `backend/src/engines/scene/engine.py` | **新建** | SceneEngine 基础：创建场景、放置 Agent、返回状态 |
| `backend/src/main.py` | 修改 | 注册 scenes router |
| `frontend/src/api/scenes.ts` | **新建** | `useSceneState` hook |
| `frontend/src/pages/GameScene.tsx` | 修改 | 从 Mock 切换到 API |

**验收标准：** API 返回正确的 AgentSprite[]、前端通过 API 获取状态。

### Step 64a — 点击 + 拖拽交互

**目标：** 点击 Agent → 右侧面板；拖拽 Agent → 移动位置。Phaser↔React 事件 bridge。

**实现细节：**
1. 重新启用 Phaser input（之前 `input: false`）
2. 点击 Agent：`sprite.setInteractive()` → `pointerdown` → emit `agent-clicked` → React `AgentPanel` 滑出
3. 拖拽 Agent：`this.input.setDraggable(sprite)` → `drag` 事件 → 更新 `tileX/Y` → 同步 localStorage + API
4. 拖拽 vs 点击区分：`pointerdown→pointerup` 距离 < 8px = 点击，≥ 8px = 拖拽
5. 拖拽松手 tile 坐标：`Math.round(x/64)`（64px tile）
6. `AgentPanel`（React 组件）：右侧抽屉——名字/emoji/颜色/情绪/动作/坐标（基于当前 mock 数据）

**涉及文件：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/scene/AgentPanel.tsx` | **新建** | 右侧信息面板 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | sprite 交互注册 + 拖拽处理 |
| `frontend/src/game/GameCanvas.tsx` | 修改 | 启用 input + 事件 callback → React |
| `frontend/src/pages/GameScene.tsx` | 修改 | AgentPanel 状态管理 |

**验收标准：** 点击 Agent 弹出面板、拖拽 Agent 移动、松手吸附到最近 tile、位置持久化。

### Step 64b — 右键耳语 + 双击篡改

**目标：** 右键→WhisperBox 输入耳语；双击→PersonaTamper 修改人格。依赖真实 Agent 数据。

**涉及文件：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/scene/WhisperBox.tsx` | **新建** | 耳语输入 |
| `frontend/src/components/scene/PersonaTamper.tsx` | **新建** | 人格滑块 |
| `frontend/src/game/scenes/MapScene.ts` | 修改 | 右键/双击事件注册 |
| `backend/src/api/scenes.py` | 修改 | `POST /api/scenes/{id}/interact` |

**验收标准：** 右键弹出输入框、耳语注入成功、双击弹出人格滑块、修改生效。

### Step 64c — Agent 对话循环（Mock）

**目标：** 纯前端 Mock 互动循环：Agent 接近→自动对话→气泡交替→冷却。后端留好占位接口，LLM 切到 66-S。

**性格档案：**

| Agent | 说话风格 | 口头禅 |
|-------|---------|--------|
| 小林 👨‍💻 | 简短、技术向、冷吐槽 | "理论上…""有bug" |
| 小红 👩‍🎨 | 感叹号多、爱夸人 | "天哪！""好可爱！" |
| 小刚 👨‍💼 | 直接、务实、爱唠叨 | "抓紧时间""听我说" |
| 小雪 👩‍🔬 | 温柔、观察入微 | "你有没有想过…""好像…" |
| 阿杰 🧑‍🎤 | 玩笑多、反问多 | "不是吧？""我有个想法" |

**Mock 对话数据：** 按 `(from, to, scene)` 三要素组合，每组合 3-5 句。场景话题作为种子注入。

**交互触发规则：**

```
MapScene 内置定时器，每 4s 扫描：
  for each agent pair:
    if 距离 ≤ 2 tile AND 上次对话 > 8s:
      → 随机选 speaker
      → getDialogue(from, to, scene) → 返回一句
      → ActionBubble 弹在 speaker 头顶 (2.5s fade)
      → 对方 1.5s 后回复
```

**后端占位：** `POST /api/scenes/{id}/interact` 端点返回 mock 对话（为 66-S 切 LLM 预留）。

**涉及文件：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/scenes/MapScene.ts` | 修改 | 接近扫描定时器 + 对话调度 + 冷却管理 |
| `frontend/src/game/dialogue.ts` | **新建** | Mock 对话数据 + `getDialogue(from, to, scene)` |
| `backend/src/api/scenes.py` | 修改 | `POST /api/scenes/{id}/interact` — Mock 返回 |
| `frontend/src/api/scenes.ts` | 修改 | +`useInteract` hook |

**验收标准：** 相邻 Agent 自动对话气泡交替、冷却正确、切换场景重置状态。

### Step 66-S — LLM 升级 + 情绪引擎 + 内容丰富

**目标：** Mock→LLM 切换 + 情绪系统（对话/环境/随机/共鸣/decay）+ Agent-物品互动 + 随机场景事件 + 表情变体扩充 + 程序化生成引擎。

**情绪引擎设计（EmotionController）：**

```
每个 Agent 持有一个 EmotionController：
  ├─ 对话触发 → 接收/说出匹配关键词 → 情绪倾向±1
  ├─ 环境触发 → 场景类型 + 邻近物品 → 定期调整
  ├─ 社交触发 → 附近同情绪 Agent → 共鸣（同步情绪）
  ├─ 随机事件 → 场景突发事件 → 全员情绪波动
  └─ decay     → 每 15s 向 neutral 回归 1 格
```

**关键词→情绪映射：**

| 关键词 | 倾向 |
|--------|------|
| 天哪/好美/好棒 | happy +1 |
| 不是吧/什么/怎么 | confused +1 |
| 烦/别/够了/又 | angry +1 |
| 累/睡/困/算了 | tired +1 |
| 如果/想想/或许/好像 | neutral 方向 |

**涉及文件：** 待 64c 完成后细化。

### Step 65 — 时间轴 + 快照

**目标：** 底部滑块 → 拖拽回退 → 场景还原到该 tick 的状态。

**实现细节：**
1. 快照存储：`SceneSnapshot[]` 存 React state，每 tick 追加
2. `Timeline` 组件（React）：`<input type="range" min=0 max=currentTick>` + SVG 事件锚点
3. 回退逻辑：
   ```
   seekTo(tick):
     快照 = snapshots[tick]
     Phaser: 所有 Agent sprite → 更新位置/动作/情绪/气泡
     物品层: 更新 state（occupied/empty）
     React: 更新 AgentPanel（如果打开）
   ```
4. 关键事件锚点：遍历 `events`，选择 `type in (agent_action, agent_message, thought_stream)` 的 tick → SVG circle 标记
5. 后端：SceneEngine 每 tick 存快照到内存 dict，`GET /api/scenes/{id}/timeline?tick=N` 返回

**涉及文件：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/scene/Timeline.tsx` | **新建** | 滑块 + SVG 锚点 |
| `frontend/src/game/GameCanvas.tsx` | 修改 | seekTo(tick) → 更新 Phaser |
| `frontend/src/pages/GameScene.tsx` | 修改 | snapshots state + seekTo |
| `backend/src/engines/scene/snapshot.py` | **新建** | 每 tick 存 SceneSnapshot |

**验收标准：** 拖拽回退 Agent 位置正确、物品状态还原、关键事件有锚点、回退后再前进正常。

### Step 66 — 特效 + 导演模式

**目标：** 天气特效、导演面板（剧本/上帝之声/分支）。

**实现细节：**
1. 天气：Phaser particle emitter
   - 樱花：粉色小圆点从顶部落下 + 摇摆 → `this.add.particles(x, y, 'sakura', config)`
   - 雨滴：蓝色短线从顶部落下
   - 日落：场景整体 `tint` 从白渐变到橙
2. `DirectorPanel`（React 浮动侧栏）：
   - 剧本触发器：`tick: number, event: string` → `POST /api/scenes/{id}/trigger`
   - 上帝之声：`message: string` → `POST /api/scenes/{id}/broadcast`
   - 分支入口：`branchName: string` → `POST /api/scenes/{id}/branch` → 返回 branchId
3. 情绪粒子：Agent emotion 突变时 → 从 sprite 位置发射 3-5 个粒子（对应颜色）

**涉及文件：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/effects/Weather.ts` | **新建** | 樱花/雨滴/日落粒子配置 |
| `frontend/src/game/effects/EmoteBurst.ts` | **新建** | 情绪粒子爆发 |
| `frontend/src/components/scene/DirectorPanel.tsx` | **新建** | 导演工具栏 |
| `backend/src/api/scenes.py` | 修改 | trigger/broadcast/branch 端点 |

**验收标准：** 樱花粒子流畅（60fps）、剧本按时触发、上帝之声全员收到、分支创建切换正常。<｜end▁of▁thinking｜>

---

## Phase 17 — 打磨交付

### Step 67 — 叙事导出
### Step 68 — P3 菜单清理  
### Step 69–72 — 测试/演示/科大主题

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
