# M9 Team 架构设计

> **文档目的：** Step 108 设计产物。Step 109（后端重构）和 Step 110（前端升级）直接引用本文档。
> **基准：** State 7 已完成，现有代码审计完成（2026-08-08）。
> **核心思路：** 拆除 WorldEngine/GroupChat 耦合层，TeamEngine 直接用 AgentWorker 执行每个步骤——Agent 不再"开会"，而是各司其职产文件。

---

## 1. 现状审计摘要

### 1.1 待删除代码

| 文件 | 行号/范围 | 内容 | 行数 |
|------|----------|------|------|
| `engines/world/messages.py` | L110-114 | `_has_identity_conflict()` team 分支 | 3 |
| `engines/world/messages.py` | L154-169+ | `_build_group_task()` team 段（跨tick历史注入） | ~50 |
| `engines/world/state.py` | L55-59 | `_build_world_context()` team_context 分支 | 4 |
| `engines/world/state.py` | L84-99+ | `_build_team_context()` 整个方法 | ~30 |
| `engines/world/engine.py` | L70 | `self.team_task = None` | 1 |
| `engines/world/engine.py` | L310-320 | `_post_process_tick()` team 跳过逻辑 | ~10 |
| `engines/world/streaming.py` | ~L15 | `_group_cancel_token` 相关 | ~15 |
| `api/sse.py` | L185-310 | 全部 team 分支：跨tick历史收集 (L186-194) + PlanManager推进 (L196-200) + 角色演化 (L204-238) + 协调器催促 (L245-259) + team_done标记 (L260-308) | ~120 |
| `api/teams.py` | L329-368 | `execute_team()` 中 World 自动启动 block（猴子补丁 team_task/team_plan/team_agent_steps/team_agent_roles + SSE注册） | ~40 |
| `api/teams.py` | L347 | `make_team_tools` import | - |
| `engines/agent_factory/tools.py` | L67-89 | `submit_deliverable` + `finish_task` 函数 | ~25 |
| `engines/agent_factory/tools.py` | L103 | `TEAM_AGENT_TOOLS` 常量 | 1 |
| `engines/agent_factory/tools.py` | L103 | `make_team_tools` 引用 (若存在) | ~5 |
| `engines/team/engine.py` | **全文重写** | 原 310 行 → 新 ~250 行 | - |
| `engines/team/debate.py` | **全文删除** | 不聊天 → 不需要辩论检测 | ~130 |
| `engines/team/planner.py` | **全文删除** | PlanManager（LLM 协调器门控，基于 GroupChat 对话）不可复用 | ~260 |
| **合计纯删除** | | | **~290** |

### 1.2 保留不动

| 文件 | 原因 |
|------|------|
| `engines/team/decomposer.py` | 任务分解——纯 LLM 调用，不依赖 WorldEngine |
| `engines/team/role_evolution.py` | 角色演化——输入 agents + step + decision_log，不依赖 GroupChat |
| `engines/team/versus.py` | Team 对抗——只用 LLM client，可复用 |
| `engines/team/learning_curve.py` | 学习曲线——从 Plan 历史计算 |
| `engines/team/diagnostics.py` | 诊断——独立函数，不依赖 WorldEngine |
| `engines/team/report.py` | 报告编译——可从 Worker 产出文件编译 |
| `models/team_orm.py` | DB 表不变 |
| `models/plan_orm.py` | DB 表基本不变（world_id 字段改为 nullable，不再使用） |

### 1.3 新增/重写

| 文件 | 操作 | 内容 | 行数(估) |
|------|------|------|---------|
| `engines/team/engine.py` | **重写** | 新 TeamEngine——Worker 编排 + SSE 生成 | ~250 |
| `engines/team/coordinator.py` | **新建** | 步骤调度——拓扑排序 + 依赖等待 + Worker 启动/重试 | ~100 |
| `engines/team/workspace.py` | **新建** | Team 工作区初始化 + shared 文件写入 | ~50 |
| `api/teams.py` | **修改** | 新 execute endpoint + stream + history + files 端点 | ~80 |
| `frontend/...` (Step 110) | 多个文件 | 组件树见第5节 | TBD |
| **合计新增** | | | **~480** |

**净变化：净增 ~190 行**。功能从"聊天交文本"升级为"干活产文件 + 有效角色演化 + 文件预览"。

---

## 2. 新 TeamEngine 接口契约

```python
# engines/team/engine.py — 设计稿

from dataclasses import dataclass, field
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class StepResult:
    """单步骤执行结果。"""
    step_id: str
    step_title: str
    assignee_id: str | None        # 负责 Agent ID
    assignee_name: str             # 负责 Agent 名称
    success: bool
    files: list[str]               # 本步骤产出的文件路径（相对 Team workspace）
    output_summary: str            # Worker summary 事件内容
    steps_used: int                # Worker 用了多少决策步
    duration_secs: float
    error: str = ""                # 失败时的错误信息


@dataclass
class TeamSSEEvent:
    """Team SSE 事件。"""
    type: str                      # plan_created | step.started | step.tool_start |
                                   # step.tool_result | step.file_updated | step.worker_done |
                                   # step.worker_error | role_evolved | team_done
    step_id: str | None = None
    data: dict = field(default_factory=dict)
    timestamp: str = ""


class TeamEngine:
    """编排多个 Agent 用 Worker 模式完成团队任务。

    不依赖 WorldEngine。不创建 World。不注入 hasattr。
    每个步骤启动一个 AgentWorker——Agent 独立干活，通过共享工作区文件协作。

    生命周期:
        1. __init__(team, db)       → 解析 team 数据 + 加载 Agent 摘要
        2. execute(model_client)    → 主入口，返回 SSE 事件流
           ├── decompose_task()     → 步骤列表
           ├── _init_workspace()    → 创建 Team 工作区 + 写入 shared 文件
           ├── 按拓扑序执行每个步骤 → 启动 AgentWorker
           ├── _evaluate_roles()    → 角色演化（步骤完成后）
           └── _compile_report()    → 汇总报告 + team_done
    """

    def __init__(self, team: dict, db: AsyncSession):
        """
        Args:
            team: TeamRow.to_dict() 的返回值
            db: 数据库会话（用于加载 Agent 详情 + 持久化 Plan）
        """
        ...

    async def execute(
        self,
        model_client,
    ) -> AsyncGenerator[str, None]:
        """
        主入口。返回 Team SSE 事件流（SSE 字符串，每行 "data: {json}\\n\\n"）。

        model_client: AutoGen 模型客户端（可为 None，表示 LLM 不可用——规则兜底）

        流程:
          1. _load_agents() → 加载 Team 成员摘要
          2. decompose_task(task, agents, model_client) → 步骤列表
          3. _init_workspace() → 创建工作区目录 + 写入 shared/TASK.md, shared/TEAM.json
          4. yield plan_created 事件
          5. _create_plan_row() → 持久化 Plan
          6. for step in _order_steps(steps):  # 拓扑排序
               yield step.started 事件
               worker = await _create_worker(step, ...)
               # 转发 Worker 的 SSE 事件，type 前加 "step." 前缀
               async for worker_event in worker.execute(step_task, ...):
                   yield _prefix_event(worker_event, step_id)
               # 收集 StepResult
               yield step.worker_done（或 step.worker_error）
               # 角色演化检查
               if model_client and done_step_count increased:
                   evolutions = await _evaluate_roles(...)
                   if evolutions: yield role_evolved
          7. report = await _compile_report()
          8. yield team_done
          9. _finalize_plan(report)
        """
        ...

    # ── 内部方法 ──

    async def _load_agents(self) -> list[dict]:
        """从 DB 加载 Agent 摘要。返回 [{id, name, role, mbti, persona}]。"""
        ...

    async def _load_agent_instances(self) -> list:
        """从 DB 加载完整 LifeAgent 实例（用于注入 Worker）。
        
        与 M12 共用相同的 Agent 工厂——通过 api.agents.get_agent_factory()。
        """
        ...

    async def _init_workspace(self) -> str:
        """初始化 Team 工作区目录结构。

        在 workspaces/teams/{team_id}/{run_id}/ 下创建：
          shared/TASK.md       — 原始任务描述（Markdown）
          shared/TEAM.json     — 团队信息 + 步骤列表（JSON）
          shared/CONTEXT_{step_id}.md — 每个步骤的上下文摘要

        Returns: workspace 根目录的绝对路径
        """
        ...

    async def _build_step_context(
        self,
        step: dict,
        completed: dict[str, StepResult],
        agents: list[dict],
    ) -> str:
        """为当前步骤构建上下文 prompt。

        包含:
        - 原始任务总述
        - 已完成步骤摘要 + 产出文件列表
        - 当前步骤目标 & 交付要求
        - 相关 Agent 角色信息

        Agent 通过 read_file 工具读取已完成步骤的具体产出文件。
        """
        ...

    async def _create_worker(
        self,
        step: dict,
        agent,              # LifeAgent 实例
        workspace_path: str,
        step_context: str,
    ) -> "AgentWorker":
        """为单个步骤创建 AgentWorker 实例。

        workspace 指向 Team 工作区的子目录 step_{N}_{title}/。
        Agent 可通过 read_file("../step_M_xxx/output.md") 读取上游产出。
        """
        ...

    async def _evaluate_roles(
        self,
        step: dict,
        step_result: StepResult,
        agents: list[dict],
        model_client,
    ) -> list[dict] | None:
        """步骤完成后触发角色演化（复用 engines/team/role_evolution.py）。

        Args:
            step: 刚完成的步骤
            step_result: 步骤执行结果（含 output_summary）
            agents: 当前 Agent 摘要（含角色）
            model_client: LLM 客户端

        Returns:
            [{agent_id, name, old_role, new_role, reason}] 或 None
        """
        ...

    async def _compile_report(self) -> dict:
        """汇总所有步骤产出 → Team 最终报告。

        从工作区读取各步骤的 output.md + 其他产出文件，
        用 LLM（如果有）或模板规则生成报告。
        """
        ...

    def _order_steps(self, steps: list[dict]) -> list[dict]:
        """拓扑排序步骤列表——depends_on 未完成的步骤等待。
        
        注意：decomposer 现在生成的步骤带 depends_on 字段。
        如果步骤无 depends_on，按原始顺序执行（串行，保证简单场景不出错）。
        """
        ...

    async def _create_plan_row(self, task: str, steps: list[dict]) -> str:
        """持久化 PlanRow 到 DB。返回 plan_id。"""
        ...

    async def _update_plan_row(self, step_id: str, status: str, result: dict | None):
        """更新 PlanRow 中单步骤的状态。"""
        ...

    async def _finalize_plan(self, report: dict):
        """标记 Plan + Team 为 finished，保存报告。"""
        ...

    async def _forward_worker_events(
        self,
        worker_events: AsyncGenerator,
        step_id: str,
    ) -> AsyncGenerator[str, None]:
        """将 Worker 的 SSE 事件转发为 Team SSE 事件。

        Worker event type → Team event type:
          worker.started       → step.started (仅第一个，其余忽略)
          worker.tool_start    → step.tool_start
          worker.tool_result   → step.tool_result
          worker.file_updated  → step.file_updated
          worker.thought       → step.thought
          worker.plan          → step.plan
          worker.reflection    → step.reflection
          worker.summary       → step.summary   (收集 output_summary)
          worker.done          → step.worker_done
          worker.error         → step.worker_error
        """
        ...
```

---

## 3. SSE 事件 Schema

### 3.1 事件类型定义

```
┌─ Team SSE 事件类型 ────────────────────────────────────────────┐
│                                                               │
│ plan_created          → 任务分解完成                           │
│   data: {                                                      │
│     plan_id: string,                                           │
│     task: string,                                              │
│     total_steps: number,                                       │
│     steps: [{id, title, assignee_name, description}]           │
│   }                                                            │
│                                                               │
│ step.started          → 某步骤开始执行                          │
│   step_id: "xxx"                                               │
│   data: {                                                      │
│     title: string,                                             │
│     assignee_id: string|null,                                  │
│     assignee_name: string,                                     │
│     workspace_subdir: string        # step_1_xxx               │
│   }                                                            │
│                                                               │
│ step.tool_start       → Worker tool_start 转发                  │
│   step_id: "xxx"                                               │
│   data: {tool_name, args}                                      │
│                                                               │
│ step.tool_result      → Worker tool_result 转发                 │
│   step_id: "xxx"                                               │
│   data: {tool_name, result_summary}                            │
│                                                               │
│ step.file_updated     → Worker file_updated 转发                │
│   step_id: "xxx"                                               │
│   data: {path, operation, content_summary}                      │
│                                                               │
│ step.thought          → Worker thought 转发（可选）              │
│   step_id: "xxx"                                               │
│   data: {content}                                              │
│                                                               │
│ step.worker_done      → 某步骤 Worker 成功完成                   │
│   step_id: "xxx"                                               │
│   data: {                                                      │
│     success: true,                                             │
│     files: [string],          # 产出文件相对路径列表              │
│     output_summary: string,   # Worker 的 summary 内容           │
│     steps_used: number,                                         │
│     duration_secs: number                                       │
│   }                                                            │
│                                                               │
│ step.worker_error     → 某步骤 Worker 失败                       │
│   step_id: "xxx"                                               │
│   data: {                                                      │
│     error: string,                                             │
│     recoverable: boolean                                        │
│   }                                                            │
│                                                               │
│ role_evolved          → 角色演化结果                             │
│   data: {                                                      │
│     evolutions: [{agent_id, agent_name, old_role, new_role,     │
│                   reason}],                                    │
│     step_title: string                                          │
│   }                                                            │
│                                                               │
│ team_done             → 全部步骤完成                             │
│   data: {                                                      │
│     total_duration_secs: number,                                │
│     total_steps_completed: number,                              │
│     total_steps: number,                                        │
│     steps: [{step_title, success, files}],                      │
│     report: {title: string, content: string}                    │
│   }                                                            │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### 3.2 SSE 端点隔离

| 端点 | URL | 用途 | 前端 Hook |
|------|-----|------|----------|
| Team SSE | `GET /api/teams/{team_id}/stream?plan_id={plan_id}` | Team 执行过程实时推送 | `useTeamSSE(team_id)` |
| Worker SSE | `POST /api/workers/execute` | 单 Agent 任务执行 | WorkerBench 内部（EventSource → WorkerTerminal） |
| World SSE | `GET /api/worlds/{id}/stream` | M2/M3/Arena 世界模拟 | `useSSE(world_id)` |

**三个端点互不交叉——不同的 URL、不同的数据源、不同的前端组件。**

### 3.3 SSE 字符串格式

与 Worker 的 `_sse_event()` 保持一致：
```
data: {"type":"step.started","step_id":"abc123","data":{...},"timestamp":"2026-08-08T..."}

```

---

## 4. 工作区隔离模型

### 4.1 目录结构

```
workspaces/
├── workers/{run_id}/         ← M12 单Agent Worker (已有，不动)
│   ├── .snapshots/
│   └── [Agent产出的文件]
│
└── teams/{team_id}/{run_id}/ ← M9 Team (新增)
    ├── shared/               ← 所有步骤可见的共享上下文
    │   ├── TASK.md           ← 原始任务描述（Markdown）
    │   ├── TEAM.json         ← 团队信息 + 完整步骤列表
    │   └── CONTEXT_{step_id}.md ← 每步骤开始前写入的上下文摘要
    │
    ├── step_1_{title}/       ← 步骤1的Agent产出的文件
    │   ├── output.md         ← Worker 的 final output
    │   └── ...               ← 其他文件
    │
    ├── step_2_{title}/       ← 步骤2的Agent产出的文件
    │   ├── output.md
    │   └── ...
    │
    └── report.md             ← 最终汇总报告（由 TeamEngine 编译）
```

### 4.2 隔离规则

| 规则 | 说明 |
|------|------|
| **路径隔离** | M12: `workspaces/workers/{run_id}/`；M9: `workspaces/teams/{team_id}/{run_id}/`——不同父目录 |
| **跨步骤可见** | Agent 可通过 `read_file("../step_N_xxx/output.md")` 读取上游步骤产出 |
| **工具隔离** | Team Worker 使用与 M12 Worker 相同的 `make_worker_tools()`，不添加 TEAM_AGENT_TOOLS |
| **API 隔离** | `/api/workers/history` vs `/api/teams/{id}/history`——不同端点 |
| **不跨界** | ShowcaseWall 只看 `workspaces/workers/`；TeamDashboard 只看 `workspaces/teams/` |

### 4.3 与 M12 WorkSpaceProvider 的复用

Team workspace 使用 `LocalWorkspace(base_dir=..., run_id=step_dir)`，与 M12 Worker 相同。
每个步骤的 AgentWorker 获得自己的 `LocalWorkspace` 实例，指向 `step_N_xxx/` 子目录。

---

## 5. 前端组件树

### 5.1 新组件树

```
TeamDashboard (重写)
├── TeamSetup              (保留+微调——创建Team+角色分配，移除"执行后聊天"预期)
├── TeamExecution          (新增——替换旧的LiveChat+TaskKanban Tab)
│   ├── StepTimeline       (新增——垂直步骤时间线)
│   │   └── StepCard       (新增——单步骤卡片: 状态图标+Agent头像+耗时+文件数)
│   │       └── FilePreview (复用——Markdown/代码/JSON 文件预览)
│   ├── StepTerminal       (新增——当前步骤的只读终端，复用 WorkerTerminal 事件渲染)
│   ├── WorkspacePanel     (复用 M12 WorkspacePanel——展示 Team 共享工作区文件树)
│   └── RoleEvolutionBadge (新增——角色演化通知浮层)
├── TeamReport             (保留+修改——最终报告渲染，增加文件下载列表)
└── TeamHistory            (新增——历史 Team 运行列表 + 对比)
```

### 5.2 组件 Props 接口

```typescript
// StepTimeline
interface StepTimelineProps {
  steps: StepState[];                    // 所有步骤的状态
  activeStepId: string | null;           // 当前正在执行的步骤
  onStepClick: (stepId: string) => void; // 点击展开步骤详情
}

interface StepState {
  id: string;
  title: string;
  assigneeName: string;
  assigneeId: string | null;
  status: "pending" | "running" | "done" | "error" | "skipped";
  files: string[];
  durationSecs: number | null;
  stepsUsed: number | null;
  error: string | null;
}

// StepCard (StepTimeline 的子组件)
interface StepCardProps {
  step: StepState;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onFileClick: (filePath: string) => void;
}

// StepTerminal
interface StepTerminalProps {
  events: TeamSSERawEvent[];   // 当前步骤的所有 step.* 事件
  isRunning: boolean;
}

// WorkspacePanel (复用 M12 组件，调整数据源)
interface WorkspacePanelProps {
  basePath: string;             // Team 工作区根目录
  files: WorkspaceFile[];
  onFileClick: (path: string) => void;
}

// RoleEvolutionBadge
interface RoleEvolutionBadgeProps {
  evolutions: RoleEvolution[];  // 角色变化列表
  onDismiss: () => void;
}

// TeamReport
interface TeamReportProps {
  report: { title: string; content: string };
  steps: StepResult[];          // 所有步骤的结果摘要
  workspaceFiles: WorkspaceFile[];
  onDownloadAll: () => void;
}

// TeamHistory
interface TeamHistoryProps {
  teamId: string;
}
```

### 5.3 数据流

```
POST /api/teams/{id}/execute → plan_id
     │
     ▼
useTeamSSE(team_id, plan_id)  → EventSource("GET /api/teams/{id}/stream?plan_id=...")
     │
     ├── plan_created        → stepStore.setSteps(...)
     ├── step.started        → stepStore.setStepStatus(id, "running")
     ├── step.tool_start     → terminalStore.append(stepId, event)
     ├── step.tool_result    → terminalStore.append(stepId, event)
     ├── step.file_updated   → workspaceStore.addFile(stepId, file)
     ├── step.worker_done    → stepStore.markDone(id, result) + workspaceStore.refresh()
     ├── step.worker_error   → stepStore.markError(id, error)
     ├── role_evolved        → stepStore.addEvolution(ev)
     └── team_done           → stepStore.markComplete(report)
     
Zustand Stores (新建):
  useTeamStore:
    - planId, task, steps[], evolutions[], report
    - activeStepId, setActiveStep()
    - events grouped by step_id
```

### 5.4 新建/修改文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/TeamDashboard.tsx` | **重写** | 去掉 Tab 切换，改为 Setup → Execution 两阶段 |
| `frontend/src/components/team/StepTimeline.tsx` | **新建** | 垂直步骤时间线组件 |
| `frontend/src/components/team/StepCard.tsx` | **新建** | 单步骤卡片 |
| `frontend/src/components/team/StepTerminal.tsx` | **新建** | 只读 Worker 终端（事件渲染） |
| `frontend/src/components/team/RoleEvolutionBadge.tsx` | **新建** | 角色演化通知 |
| `frontend/src/components/team/TeamReport.tsx` | **保留+修改** | 增加文件列表 + 下载 |
| `frontend/src/components/team/TeamHistory.tsx` | **新建** | 历史记录列表 |
| `frontend/src/hooks/useTeamSSE.ts` | **新建** | Team SSE EventSource hook |
| `frontend/src/api/teams.ts` | **修改** | 增加 executeTeam, useTeamStream, useTeamHistory, useTeamFiles |
| `frontend/src/stores/useTeamStore.ts` | **新建** | Zustand store——步骤状态 + SSE 事件缓冲 |
| `frontend/src/types/team.ts` | **修改** | 增加 TeamSSEEvent, StepState, TeamReport 等类型 |

### 5.5 删除文件清单

| 文件 | 原因 |
|------|------|
| `frontend/src/pages/team/LiveChat.tsx` | GroupChat 聊天框——不再需要 |
| `frontend/src/components/team/DebatePanel.tsx` | 辩论面板——不聊天 = 无辩论 |
| `frontend/src/components/team/TaskKanban.tsx` | 旧看板——StepTimeline 替代 |
| `frontend/src/components/team/HealthPanel.tsx` | GroupChat 健康指标——不适用 Worker 模式 |

---

## 6. 删除/新增/保留清单（精确到文件）

### 6.1 后端——删除

| 文件 | 操作 | 行数 |
|------|------|------|
| `engines/team/engine.py` | 重写（全文替换） | 310→250 |
| `engines/team/planner.py` | 删除 PlanManager | -260 |
| `engines/team/debate.py` | 删除 | -130 |
| `engines/world/messages.py` | 删除 team 分支（~53行） | 修改 |
| `engines/world/state.py` | 删除 team 分支（~34行） | 修改 |
| `engines/world/engine.py` | 删除 team_task + post_process 分支（~11行） | 修改 |
| `engines/world/streaming.py` | 删除 group_cancel_token（~15行） | 修改 |
| `api/sse.py` | 删除 team 分支（~120行） | 修改 |
| `api/teams.py` | 重写 execute + 新增 stream/history/files（~120行改） | 修改 |
| `engines/agent_factory/tools.py` | 删除 TEAM_AGENT_TOOLS + submit_deliverable + finish_task（~30行） | 修改 |

### 6.2 后端——新增

| 文件 | 操作 | 行数 |
|------|------|------|
| `engines/team/engine.py` | 重写 | +250 |
| `engines/team/coordinator.py` | 新建 | +100 |
| `engines/team/workspace.py` | 新建 | +50 |

### 6.3 后端——保留

| 文件 | 说明 |
|------|------|
| `engines/team/decomposer.py` | 任务分解（独立） |
| `engines/team/role_evolution.py` | 角色演化（独立） |
| `engines/team/versus.py` | Team 对抗 |
| `engines/team/learning_curve.py` | 学习曲线 |
| `engines/team/report.py` | 报告编译（可能需小改） |
| `engines/team/diagnostics.py` | 诊断 |
| `models/team_orm.py` | TeamRow（不变） |
| `models/plan_orm.py` | PlanRow（world_id 保留但废弃，不删列） |
| `api/teams.py` (CRUD + suggest-roles + evaluate + score + versus + learning-curve) | 保留，仅修改 execute |

### 6.4 前端——删除

| 文件 | 原因 |
|------|------|
| `frontend/src/pages/team/LiveChat.tsx` | 聊天框不再需要 |
| `frontend/src/components/team/DebatePanel.tsx` | 辩论检测不再需要 |
| `frontend/src/components/team/TaskKanban.tsx` | 被 StepTimeline 替代 |
| `frontend/src/components/team/HealthPanel.tsx` | 不再适用（没有 GroupChat 健康指标） |

### 6.5 前端——新增

| 文件 | 说明 |
|------|------|
| `frontend/src/components/team/StepTimeline.tsx` | 垂直步骤时间线 |
| `frontend/src/components/team/StepCard.tsx` | 步骤卡片 |
| `frontend/src/components/team/StepTerminal.tsx` | 只读 Worker 终端 |
| `frontend/src/components/team/RoleEvolutionBadge.tsx` | 角色演化通知 |
| `frontend/src/components/team/TeamHistory.tsx` | 历史记录 |
| `frontend/src/hooks/useTeamSSE.ts` | Team SSE hook |
| `frontend/src/stores/useTeamStore.ts` | Zustand store |

### 6.6 前端——修改

| 文件 | 说明 |
|------|------|
| `frontend/src/pages/TeamDashboard.tsx` | 重写为两阶段（Setup→Execution） |
| `frontend/src/api/teams.ts` | 增加 execute/stream/history/files hooks |
| `frontend/src/types/team.ts` | 增加新类型定义 |
| `frontend/src/components/team/TeamReport.tsx` | 增加文件下载 |

---

## 7. API 端点变更

### 7.1 新增端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/teams/{team_id}/stream?plan_id={plan_id}` | SSE 流——Team 执行过程实时推送 |
| `GET` | `/api/teams/{team_id}/history` | 历史 Team 运行列表（已有 `/api/teams/{id}/plan/history`——统一） |
| `GET` | `/api/teams/{team_id}/files/{path:path}` | 读取 Team 工作区文件内容 |

### 7.2 修改端点

| 方法 | 路径 | 变更 |
|------|------|------|
| `POST` | `/api/teams/{team_id}/execute` | **重写**——不再创建 World/注册 SSE/猴子补丁。改为创建新 TeamEngine → 执行 → 返回 plan_id。前端通过 `/stream` 获得实时事件。 |

### 7.3 保留端点（不改）

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST/GET/DELETE` | `/api/teams[/{id}]` | CRUD |
| `POST` | `/api/teams/suggest-roles` | 角色推荐 |
| `POST` | `/api/teams/{id}/evaluate` | 团队评估 |
| `POST` | `/api/teams/{id}/score` | 多维评分 |
| `POST` | `/api/teams/versus` | Team 对抗 |
| `GET` | `/api/teams/{id}/learning-curve` | 学习曲线 |

---

## 8. 执行流程图

```
POST /api/teams/{id}/execute
        │
        ▼
TeamEngine.__init__(team, db)
        │
        ▼
TeamEngine.execute(model_client)
        │
        ├─1─ _load_agents()  ← DB
        ├─2─ decompose_task() ← LLM (decomposer.py)
        ├─3─ _init_workspace() ← 创建目录 + shared 文件
        ├─4─ yield plan_created
        ├─5─ _create_plan_row() ← DB
        │
        ├─6─ for step in _order_steps(steps):
        │       │
        │       ├── _create_worker(step, agent, workspace)
        │       ├── _build_step_context(step, completed)
        │       ├── yield step.started
        │       │
        │       ├── worker.execute(step_task)
        │       │       └── yield step.tool_start / step.tool_result /
        │       │            step.file_updated / step.worker_done
        │       │
        │       ├── 收集 StepResult → completed[step_id]
        │       ├── _update_plan_row(step_id, "done", result)
        │       │
        │       └── _evaluate_roles(step, result, agents, model_client)
        │               └── yield role_evolved (if changes)
        │
        ├─7─ _compile_report() ← 从 workspace 读取所有产出
        ├─8─ yield team_done
        └─9─ _finalize_plan(report) ← DB
```

---

## 9. 验收标准（设计 Phase）

- [x] 新 TeamEngine 接口文档完成——所有公开方法有完整签名 + docstring
- [x] Team SSE 事件 schema 定义完成——11 种事件类型，每种 data 字段精确到类型
- [x] 工作区隔离模型文档完成——目录结构 + 隔离规则 + 与 M12 的边界
- [x] 删除/新增/保留清单完成——每个文件精确到操作类型
- [x] 前端组件树设计完成——每个组件的 props 接口 + 数据源
- [x] 所有设计产物在 `docs/design/m9-redesign.md` 中（单一文件，Step 109–110 引用）

---

> **最后更新:** 2026-08-08
> **维护者:** 晓音_Stingray
> **版本:** 8.0-设计稿
> **下一步:** Step 109 — 后端重构（按本文档实现）
