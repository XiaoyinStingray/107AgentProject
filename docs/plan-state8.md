# 人生实验室 · Life Lab — Plan State 8

> **文档目的：** 第八阶段——M9 Agent Team 重构。拆除 GroupChat 脚手架，用 Worker 原生任务执行替代。先设计后实现。
> **上一阶段：** State 7（平台参数面板 + Pipeline 深度化——全部完成）
> **当前问题：** M9 Team 代码 1,543 行 + WorldEngine/SSE 散落的 ~250 行 team 分支 ≈ **1,800 行**。但功能只是"Agent 在聊天框里交一段文本"。代码复杂、功能一般——根因是 Team 被硬塞进 WorldEngine 的 GroupChat 框架。
> **本阶段目标：** 设计先行（Step 108）→ 后端重构（Step 109）→ 前端演化（Step 110）→ 测试（T15）。净删代码 > 净增代码，功能从"聊天交文本"升级为"干活产文件"。

---

## Step 速查表

| Step | 名称 | 依赖 | 核心产出 | 估时 |
|------|------|------|----------|------|
| **📐 设计（不写代码）** | | | | |
| 108 | M9 Team 架构设计 | Worker引擎(State 5) + 现状审计 | 新 TeamEngine 接口 + SSE schema + 工作区隔离模型 + 删除/新增/保留清单 + 前端组件树 | 3h |
| **🏗️ 后端重构** | | | | |
| 109 | TeamEngine 重写 | 108 | 新 TeamEngine(Worker编排) + coordinator + 删除 WorldEngine/SSE/state/messages 全部 team 分支 | 6h |
| **🎨 前端演化** | | | | |
| 110 | M9 前端升级 | 109 | TeamDashboard 改造 + 步骤文件预览 + 成果面板 + role_evolved/team_done 事件渲染 | 5h |
| **🧪 测试** | | | | |
| T15 | M9 改造测试 + 回归 | 109–110 | 接口契约测试 + 隔离测试 + 全量回归 | 3h |

> **共 4 个 Step，~17 小时。** 108→109→110 强依赖，T15 在 109+110 之后。

---

## Step 108 — M9 Team 架构设计

> **目标：** 不写一行实现代码。产出全部接口契约、SSE 事件 schema、工作区隔离模型、删除/新增/保留清单。Step 109–110 直接引用。

### ① 新 TeamEngine 接口契约

```python
# engines/team/engine.py — 设计稿（只定义签名，不实现）

class TeamEngine:
    """编排多个 Agent 用 Worker 模式完成团队任务。
    
    不依赖 WorldEngine。不创建 World。不注入 hasattr。
    每个步骤启动一个 AgentWorker——Agent 独立干活，通过共享工作区文件协作。
    """

    def __init__(self, team: dict, db: AsyncSession):
        """
        team: {id, name, description, agent_ids, roles}
        db: AsyncSession
        """
        ...

    async def execute(
        self, 
        model_client,
    ) -> AsyncGenerator[TeamSSEEvent, None]:
        """
        主入口。返回 Team SSE 事件流。
        
        生命周期:
          1. decompose_task() → 步骤列表
          2. 创建 Team 工作区 (workspaces/teams/{team_id}/{run_id}/)
          3. 按拓扑序执行每个步骤 —— 每步启动一个 AgentWorker
          4. 汇总报告 + 角色演化
          5. 发射 team_done
        
        注意: 不创建 World。不注册到 _active_worlds。
        """
        ...

    # ── 内部方法 ──
    async def _load_agents(self) -> list[dict]:
        """从 DB 加载 Agent 摘要。返回 [{id, name, role, mbti}]。"""
        ...

    async def _build_step_context(
        self, step: dict, completed: dict[str, StepResult], agents: list[dict]
    ) -> str:
        """为当前步骤构建上下文。
        
        包含: 任务总述 + 已完成的步骤摘要 + 已完成步骤产出的文件列表 + 当前步骤目标。
        Agent 通过 read_file 读取已完成步骤的具体产出。
        """
        ...

    async def _compile_report(
        self, workspace: WorkspaceProvider, steps: list[dict]
    ) -> dict:
        """汇总所有步骤产出 → Team 最终报告。"""
        ...

    async def _evaluate_roles(
        self, step: dict, worker: AgentWorker, agents: list[dict], model_client
    ) -> dict | None:
        """步骤完成后触发角色演化（保留 Step 67 功能）。"""
        ...


# ── 数据结构 ──

@dataclass
class StepResult:
    step_id: str
    step_title: str
    success: bool
    files: list[str]         # 本步骤产出的文件路径
    output_summary: str      # Worker 的 summary 事件内容
    steps_used: int          # Worker 用了多少步
    duration_secs: float

@dataclass  
class TeamSSEEvent:
    type: str                # plan_created | step.xxx | role_evolved | team_done | step_failed
    step_id: str | None
    data: dict
    timestamp: str
```

### ② SSE 事件 Schema

```
┌─ Team SSE 事件类型 ────────────────────────────────────────────┐
│                                                               │
│ plan_created          → 任务分解完成                           │
│   data: {task, total_steps, steps: [{id, title, assignee}]}   │
│                                                               │
│ step.started          → 某步骤开始执行                          │
│   step_id: "xxx", data: {title, assignee_name}                │
│                                                               │
│ step.tool_start       → Worker 的 tool_start 事件转发           │
│ step.tool_result      → Worker 的 tool_result 事件转发          │
│ step.file_updated     → Worker 的 file_updated 事件转发         │
│   ↑ 这些事件 type 前加 step. 前缀——前端可按 step_id 分组渲染      │
│                                                               │
│ step.worker_done      → 某步骤 Worker 完成                      │
│   step_id: "xxx", data: {summary, files, steps_used, duration} │
│                                                               │
│ step.worker_error     → 某步骤 Worker 失败                      │
│   step_id: "xxx", data: {error}                               │
│                                                               │
│ role_evolved          → 角色演化结果（保留 Step 67）             │
│   data: {evolutions: [{agent_id, old_role, new_role, reason}]} │
│                                                               │
│ team_done             → Team 任务完成                           │
│   data: {total_duration, total_steps_completed,                │
│          files: [...], report: {title, content}}              │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

**与 Worker SSE 的隔离：** Team SSE 端点 `GET /api/teams/{id}/stream`。Worker SSE 端点 `GET /api/workers/execute`——不同 URL。前端 `useTeamSSE` hook 只连接 Team 端点。WorkerBench 不受影响。

### ③ 工作区隔离模型

```
workspaces/
├── workers/{run_id}/              ← M12 单Agent (已有，不动)
│   ├── .snapshots/
│   └── [Agent产出的文件]
│
└── teams/{team_id}/{run_id}/      ← M9 Team (新增)
    ├── shared/                    ← 所有步骤可见的共享上下文
    │   ├── TASK.md               ← 原始任务描述
    │   ├── TEAM.json             ← 团队信息 + 步骤列表
    │   └── CONTEXT_{step_id}.md  ← 每个步骤开始前的上下文摘要
    │
    ├── step_1_xxx/                ← 步骤1的Agent产出的文件
    ├── step_2_xxx/                ← 步骤2的Agent产出的文件
    └── report.md                  ← 汇总报告
```

**隔离规则：**
- M12 Worker workspace = `workspaces/workers/{run_id}/` → ShowcaseWall 数据源
- M9 Team workspace = `workspaces/teams/{team_id}/{run_id}/` → TeamDashboard 数据源
- 两个路径不在同一父目录下——`list_files` 不会跨越
- API 端点不同——`/api/workers/history` vs `/api/teams/{id}/history`

### ④ 删除清单

| 文件 | 删除内容 | 行数(估) |
|------|---------|---------|
| `engines/world/messages.py` | `if hasattr(self, "team_task")` ×3 + `_build_group_task()` 中 team 分支 | ~50 |
| `engines/world/state.py` | `if hasattr(self, "team_task")` ×2 + `_build_team_context()` | ~30 |
| `engines/world/engine.py` | `_post_process_tick()` team 分支 | ~10 |
| `engines/world/streaming.py` | `_group_cancel_token` 团队取消逻辑 | ~15 |
| `api/sse.py` | team_task/team_plan/team_engine hasattr 处理 + 协调器催促 + 跨tick 历史 (~120行) | ~120 |
| `api/teams.py` | `world_engine.team_task = ...` 等猴子补丁 + `TEAM_AGENT_TOOLS` import | ~25 |
| `engines/agent_factory/tools.py` | `TEAM_AGENT_TOOLS` + `submit_deliverable`/`finish_task` 函数 | ~40 |
| **合计删除** | | **~290 行** |

### ⑤ 新增清单

| 文件 | 操作 | 新增内容 | 行数(估) |
|------|------|---------|---------|
| `engines/team/engine.py` | **重写** | 新 TeamEngine——Worker 编排 + SSE 生成 | ~250 |
| `engines/team/coordinator.py` | **新建** | 步骤调度——拓扑排序 + 依赖等待 + Worker 启动 | ~80 |
| `engines/team/workspace.py` | **新建** | Team 工作区初始化 + shared 文件写入 | ~40 |
| `api/teams.py` | 修改 | `GET /api/teams/{id}/stream` → 新 SSE generator；`GET /api/teams/{id}/history` → 新端点 | ~60 |
| `engines/team/debate.py` | 删除 | 不再需要辩论检测——Agent 不聊天 | ~0 |
| **合计新增** | | | **~430 行** |

**净变化：** 删除 290 行 + 新增 430 行 = **净增 ~140 行**。同时功能从"聊天交文本"升级为"干活产文件 + 角色演化"。代码集中在 3 个新/重写文件中——不再散落。

### ⑥ 保留清单（不动）

| 文件 | 保留内容 | 原因 |
|------|---------|------|
| `engines/team/decomposer.py` | 任务分解（LLM + 规则兜底） | 功能独立，不依赖 WorldEngine |
| `engines/team/role_evolution.py` | 角色演化评估 + 应用 | 输入是 agents + step + decision_log——不依赖 GroupChat |
| `engines/team/versus.py` | Team 对抗引擎 | 可复用 DuelEngine（M10）——单独改造 |
| `engines/team/learning_curve.py` | 学习曲线追踪 | 基于 Worker 历史——更可靠 |
| `models/team_orm.py` | Team/Plan 数据模型 | DB 表不变 |
| `models/plan_orm.py` | Plan 持久化 | 减少字段（不需要 coordinator 相关），保留核心 |

### ⑦ 前端组件树设计

```
TeamDashboard (重写)
├── TeamSetup          (保留——创建Team+角色分配)
├── TeamExecution      (新增——替换旧的LiveChat+TaskKanban)
│   ├── StepTimeline   (新增——步骤状态时间线)
│   │   └── StepCard   (新增——单步骤卡片: Agent头像+状态+耗时+文件预览)
│   ├── StepTerminal   (新增——当前执行步骤的WorkerTerminal，只读)
│   ├── WorkspacePanel (复用 M12 WorkspacePanel——展示 Team 共享工作区文件)
│   └── RoleEvolutionBadge (新增——角色演化通知)
├── TeamReport         (保留——最终报告渲染)
└── TeamHistory        (新增——历史 Team 运行列表 + 对比)

新增前端数据流:
  useTeamSSE(team_id) → Zustand teamStore → StepTimeline + StepTerminal + WorkspacePanel
  useTeamHistory(team_id) → React Query → TeamHistory
```

### 验收标准（设计 Phase）

- [ ] 新 TeamEngine 接口文档完成——所有公开方法有完整签名 + docstring
- [ ] Team SSE 事件 schema 定义完成——8 种事件类型，每种 data 字段精确到类型
- [ ] 工作区隔离模型文档完成——目录结构 + 隔离规则 + 与 M12 的边界
- [ ] 删除/新增/保留清单完成——每个文件的行数估算 ±20%
- [ ] 前端组件树设计完成——每个组件的 props 接口 + 数据源
- [ ] 所有设计产物在 `docs/design/m9-redesign.md` 中（单一文件，Phase 109–110 引用）

---

## Step 109 — TeamEngine 重写

> **目标：** 按 Step 108 设计稿实现。新 TeamEngine 不创建 World、不注入 hasattr。删除 WorldEngine/SSE/state/messages 中全部 team 分支。

### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `engines/team/engine.py` | **重写** | 新 TeamEngine——使用 AgentWorker 执行每个步骤，发射 Team SSE 事件 |
| `engines/team/coordinator.py` | **新建** | 步骤调度器——拓扑排序 + 依赖等待 + Worker 生命周期管理 |
| `engines/team/workspace.py` | **新建** | Team 工作区初始化——shared 文件 + 目录结构 |
| `engines/world/messages.py` | **删减** | 删除全部 `hasattr(self, "team_task")` 分支 + `_build_group_task` team 段 |
| `engines/world/state.py` | **删减** | 删除全部 team 分支 + `_build_team_context` |
| `engines/world/engine.py` | **删减** | 删除 `_post_process_tick` 的 team 跳过逻辑 |
| `engines/world/streaming.py` | **删减** | 删除 `_group_cancel_token` 相关逻辑 |
| `api/sse.py` | **删减** | 删除 team 协调器/跨tick历史/催促进度 (~120行) |
| `api/teams.py` | **重写** | `POST /api/teams/{id}/execute` → 新 TeamEngine；`GET /api/teams/{id}/stream` → 新 SSE generator；新增 `GET /api/teams/{id}/history` + `GET /api/teams/{id}/files/{path}` |
| `engines/agent_factory/tools.py` | **删减** | 删除 `TEAM_AGENT_TOOLS`、`submit_deliverable`、`finish_task` 定义 |
| `engines/team/debate.py` | 删除 | 不再需要——Agent 不聊天 |

### 验收标准

- [ ] TeamEngine.execute() → decompose_task → 为每个步骤启动 Worker → 所有步骤完成 → team_done
- [ ] 步骤按依赖顺序执行——depends_on 未完成的步骤等待
- [ ] 每个步骤产出的文件在 Team 共享工作区中——后续步骤的 Agent 可通过 read_file 读取
- [ ] Team SSE 流包含 plan_created → step.started → step.tool_* → step.worker_done → team_done
- [ ] role_evolution 在步骤完成时触发（如果有 model_client 且 >=2 Agent）
- [ ] WorldEngine 中不再存在 `hasattr(self, "team_task")` 引用（grep 验证）
- [ ] `/api/teams` 端点不再导入或引用 WorldEngine
- [ ] `_active_worlds` 字典中不再包含 team world
- [ ] M12 Worker 不受影响——WorkerBench 正常使用
- [ ] 回归：`pytest tests/ -v` 全量通过（含 M1–M8, M10–M12）

---

## Step 110 — M9 前端升级

> **目标：** TeamDashboard 不再展示 GroupChat 聊天框。改为步骤时间线 + 文件预览 + 成果面板——让用户看到 Agent 在"干活"而不是"开会"。

### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/TeamDashboard.tsx` | **重写** | 从 Tab 切换（Setup/Kanban/Chat/Health）→ 两阶段：Setup → Execution |
| `frontend/src/components/team/StepTimeline.tsx` | **新建** | 步骤时间线——垂直时间线 + 每步卡片（状态/Agent/耗时/文件数） |
| `frontend/src/components/team/StepCard.tsx` | **新建** | 单步骤卡片——展开后显示文件列表 + 文件预览 |
| `frontend/src/components/team/StepTerminal.tsx` | **新建** | 当前执行步骤的只读终端——复用 WorkerTerminal 组件，数据源为 Team SSE step.* 事件 |
| `frontend/src/components/team/RoleEvolutionBadge.tsx` | **新建** | 角色演化提示——"🔄 小林的职责从开发调整为技术顾问" |
| `frontend/src/components/team/TeamReport.tsx` | 保留+修改 | 最终报告渲染——增加文件下载列表 |
| `frontend/src/hooks/useTeamSSE.ts` | **新建** | Team SSE hook——连接 `/api/teams/{id}/stream`，按 step_id 分组事件 |
| `frontend/src/api/teams.ts` | 修改 | 增加 `useTeamHistory`、`useTeamFiles` hooks |
| `frontend/src/stores/useTeamStore.ts` | **新建** | Zustand store——当前活跃 Team 的步骤状态 + SSE 事件缓冲 |

### 验收标准

- [ ] 创建 Team → 启动执行 → TeamDashboard 切换到 Execution 视图
- [ ] Execution 视图：左侧步骤时间线（垂直），右侧当前步骤终端
- [ ] 当前步骤 Agent 正在执行时，StepTerminal 实时显示 Worker 的 tool_start/tool_result 事件
- [ ] 步骤完成时，时间线卡片从蓝色变为绿色，展开可看到产出文件列表
- [ ] 点击文件 → 预览面板渲染 Markdown/代码/JSON
- [ ] 角色演化触发时，StepTimeline 上出现 RoleEvolutionBadge
- [ ] 全部完成 → 弹出 TeamReport + 下载全部文件按钮
- [ ] TeamHistory 页面可查看历史 Team 运行记录
- [ ] M12 WorkerBench + ShowcaseWall 不受影响

---

## Step T15 — M9 改造测试 + 回归

### 接口契约测试（不调真 LLM，Mock）

| 被测接口 | 测试内容 |
|---------|---------|
| TeamEngine.execute() | 输入 mock 步骤 + mock Worker → 验证事件顺序 + 依赖等待 + team_done 格式 |
| TeamEngine 事件顺序 | plan_created → step.started → step.worker_done(×N) → role_evolved? → team_done |
| TeamEngine 错误处理 | 某步骤 Worker 失败 → step_failed 事件 → 后续依赖步骤 SKIPPED |
| TeamEngine 依赖等待 | depends_on 步骤未完成 → 后续步骤不启动 |

### 隔离测试

| 被测边界 | 测试内容 |
|---------|---------|
| M9 workspace vs M12 workspace | Team workspace 和 Worker workspace 在不同物理目录 |
| SSE 端点隔离 | Team SSE (`/api/teams/{id}/stream`) 和 Worker SSE (`/api/workers/execute`) 不交叉 |
| API 数据隔离 | `/api/teams/history` 不返回 Worker 单任务数据；`/api/workers/history` 不返回 Team 数据 |
| WorldEngine 清理 | `_active_worlds` 不包含 team World |
| hasattr 清零 | `grep -r "team_task" backend/src/` 只在 team/ 目录下有引用 |

### 全量回归

| 命令 | 通过标准 |
|------|---------|
| `pytest tests/ -v` | 全量通过——不因删除 team 分支而破坏 M2/M3/Arena/Bench |
| `npx vitest run` | 前端全量通过 |
| 手工 | M2 单人剧场 / M3 群体沙盒 / M4 竞技场 / M12 Worker 正常运行 |

---

> **最后更新:** 2026-08-02
> **维护者:** 晓音_Stingray
> **版本:** 8.0 (Plan State 8)
> **基准:** State 7 已完成
> **设计重点:** M9 Team 重构——拆除 GroupChat，用 Worker 原生执行。设计先行（Step 108），净代码量基本持平，功能从"聊天交文本"升级为"干活产文件"。
