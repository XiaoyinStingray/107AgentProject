# 人生实验室 · Life Lab — Plan State 5

> **文档目的：** 第五阶段——从"会聊天的 Agent"到"能干活的 Agent"。设计先行，接口先行。
> **上一阶段：** State 4（Agent 内核强化——工具真实化、上下文连续、scratchpad）
> **当前状态：** Agent 基础设施已就绪。但 Agent 仍然只能说话，不能产出可交付的成果。
> **核心问题：** 用户说"帮我调研 XX 并写份报告"→ Agent 应该产出文件，不是聊天记录。
> **本阶段目标：** Worker 工作台 → 双轨工作区 → 多 Agent 协作 → 管道编排 → 自主调度。
>
> **设计原则：**
> - **接口先于代码。** 每个模块的抽象接口、SSE 事件 schema、数据模型在设计 Phase 完成，实现 Phase 直接引用。
> - **不重复 Team 模式的错误。** Team 的问题是 GroupChat（聊天协议）和 Task Execution（执行协议）硬拼。Worker 用单一协议：Agent 决策 → 工具执行 → 反馈。
> - **每个 Phase 独立可跑。** Phase 23 完成就能演示——单 Agent 在终端干活。后续 Phase 是在此基础上的扩展，不回溯修改 Phase 23 的核心接口。

---

## Step 速查表

| Step | Phase | 名称 | 依赖 | 核心产出 | 估时 |
|------|-------|------|------|----------|------|
| **📐 Phase 22: 核心设计（不写代码）** | | | | | |
| 86 | 22.1 | 接口与协议设计 | — | WorkspaceProvider 抽象 / SSE 事件 schema / Agent 决策协议 / Tool 注册接口 | 4h |
| 87 | 22.2 | 工作流与状态机设计 | 86 | Agent 生命周期 / Worker 状态机 / 错误恢复流程 / 文件锁协议 | 3h |
| **🛠️ Phase 23: Worker 核心** | | | | | |
| 88 | 23.1 | AgentWorker 引擎 | 87 | 单 Agent 决策循环 + 5 个工具 + SSE 事件生成 | 6h |
| 89 | 23.2 | 终端式前端 | 88 | 打字机效果终端 + 文件面板 + 实时步骤展示 | 5h |
| 90 | 23.3 | 安全沙盒 | 88 | Python 子进程隔离 + 模块黑名单 + workspace 限制 | 3h |
| T10 | — | Phase 23 测试 | 88–90 | Worker 引擎测试 + 工具测试 + E2E 全链路 | 3h |
| **🔀 Phase 24: 双轨工作区** | | | | | |
| 91 | 24.1 | WorkspaceProvider 实现 | 88 | LocalWorkspace + CloudWorkspace (SSH) + 连接管理 | 5h |
| 92 | 24.2 | 工作区切换前端 | 91 | 工作区选择器 + SSH 配置 + 文件浏览器 | 3h |
| T11 | — | Phase 24 测试 | 91–92 | 双轨文件操作一致性 + SSH 断连恢复 | 3h |
| **👥 Phase 25: 多 Agent + 管道** | | | | | |
| 93 | 25.1 | 共享工作区引擎 | 91 | 多 Agent 同 workspace + 文件锁 + 任务队列 + 依赖等待 | 5h |
| 94 | 25.2 | 管道编排引擎 | 93 | DAG 拓扑 + 并行执行 + 节点间文件传递 | 4h |
| 95 | 25.3 | 管道前端 | 94 | 节点配置面板 + 连线 + 运行监控（用 React Flow，不自己写拖拽） | 6h |
| T12 | — | Phase 25 测试 | 93–95 | 共享工作区并发 + 管道 E2E + 前端交互 | 4h |
| **⏰ Phase 26: 自主调度 + 发布** | | | | |
| 96 | 26.1 | 自主调度器 + 演示 | 88, 91 | Cron + 文件监视器 + check_in + 3 条演示脚本 | 5h |
| 97 | 26.2 | 部署 + 文档 | 96 | Docker 打包 + 安装指南 + 落地页 + 演示录制 | 4h |

> **共 14 个 Step。** 设计 2 步（只画图不写代码），实现 10 步，测试 3 步。
> **总计估时：** ~59 小时（一人 + AI）

---

## 目录

- [为什么加设计 Phase](#为什么加设计-phase)
- [Phase 22: 核心设计](#phase-22-核心设计)
- [Phase 23: Worker 核心](#phase-23-worker-核心)
- [Phase 24: 双轨工作区](#phase-24-双轨工作区)
- [Phase 25: 多 Agent + 管道](#phase-25-多-agent--管道)
- [Phase 26: 自主调度 + 发布](#phase-26-自主调度--发布)
- [附录 A: 接口清单（设计 Phase 产出）](#附录-a-接口清单设计-phase-产出)
- [附录 B: 风险与可控性评估](#附录-b-风险与可控性评估)

---

## 为什么加设计 Phase

**Team 模式的教训：**

```
Team 模式怎么失败的？
  
  plan-state3 写了: TaskDecomposer + PlanManager + GroupChat → 工作流引擎
  实际做出来:    decomposer → planner → engine → sse 里塞 team_task → 
               messages 里塞 team 分支 → streaming 里塞 cancel token →
               前端看板监听从 sse 解析的 plan_updated 事件 →
               协调器每隔 N tick 手动催促 ...
  
  结局: ~1500 行代码，功能能用但不稳定，关键路径散落在 6 个文件中，
        没有人能说清楚一个 Team 任务从创建到完成的完整状态转换。
```

**Worker 模式怎么避免：**

1. **设计 Phase 先定义所有接口。** 在写任何代码之前，`WorkspaceProvider` 的方法签名、SSE 事件类型、Agent 决策 prompt 模板、Tool 注册方式——全部写成文档 + Python Protocol 类。
2. **状态机显式建模。** Agent 在 Worker 中的生命周期有且仅有 N 个状态。状态转换有且仅有 M 条路径。错误恢复有明确的 fallback 状态。写代码时不猜——查状态机图。
3. **模块边界硬隔离。** `AgentWorker` 不 import `FastAPI`。`WorkspaceProvider` 不 import `LifeAgent`。工具函数不 import `SSE`。每个模块只依赖抽象接口。

---

## Phase 22: 核心设计

> **目标：** 不写一行实现代码。产出 5 份设计文档 + 3 个 Python Protocol 类 + 2 个状态机图 + 1 份 SSE 事件 schema。Phase 23–26 的所有实现直接引用这些设计产物。
> **规则：** 本 Phase 的产出是 `.py` 文件中的 Protocol/ABC/数据类定义 + `.md` 文件中的流程图。不写任何 `async def execute` 之类的实现。

### Step 86 — 接口与协议设计

> **产出物（只定义，不实现）：**

#### 1. WorkspaceProvider 协议

```python
# engines/worker/workspace.py — 只定义接口，不实现

class FileInfo(NamedTuple):
    path: str
    size: int
    modified_at: str

class SandboxResult(NamedTuple):
    stdout: str
    stderr: str
    exit_code: int

class WorkspaceProvider(ABC):
    """Agent 操作文件系统的统一抽象。
    实现类: LocalWorkspace, CloudWorkspace
    设计约束: 所有 path 参数相对于 workspace root，实现负责拼接和安全校验。
    """

    @abstractmethod
    async def write_file(self, path: str, content: str) -> str: ...
    
    @abstractmethod
    async def read_file(self, path: str) -> str: ...
    
    @abstractmethod
    async def list_files(self, directory: str = "") -> list[FileInfo]: ...
    
    @abstractmethod
    async def delete_file(self, path: str) -> bool: ...
    
    @abstractmethod
    async def run_python(self, code: str, timeout: int = 30) -> SandboxResult: ...
    
    @abstractmethod
    async def exists(self, path: str) -> bool: ...
    
    @property
    @abstractmethod
    def location_description(self) -> str: ...  # "本地: ~/workspaces/xxx" 或 "云端: ubuntu@10.0.0.1"
```

#### 2. Worker SSE 事件 Schema

```python
# engines/worker/events.py — 只定义事件类型

# 所有 SSE 事件的 JSON 结构:
# { "type": "<WorkerEventType>", "data": {...}, "timestamp": "ISO8601" }

WorkerEventType = Literal[
    "worker.started",       # Worker 启动，data: {run_id, agent_name, task}
    "worker.plan",          # Agent 制定计划，data: {steps: [{title, estimated_tools}]}
    "worker.step_decision", # Agent 决策，data: {step_index, action: "tool_call"|"deliverable"|"done", reason}
    "worker.tool_start",    # 工具开始执行，data: {tool_name, args}
    "worker.tool_result",   # 工具执行结果，data: {tool_name, result_summary, duration_ms, success}
    "worker.reflection",    # Agent 反思，data: {satisfied: bool, plan_changed: bool, thought}
    "worker.file_updated",  # 文件变更，data: {files: [{path, size}]}
    "worker.done",          # Agent 判断完成，data: {reason, total_steps, files}
    "worker.error",         # 错误，data: {step_index, error_type, message}
    "worker.summary",       # 最终汇总，data: {deliverables, self_rating, key_findings}
]
```

每个事件类型的 `data` 字段精确到字段名和类型。实现时不得增减字段。

#### 3. Agent 决策协议

Agent 在每个 step 收到的不是"在 GroupChat 里发言"的 prompt，而是一个**结构化决策 prompt**：

```
你正在完成一项任务。当前是第 {step_index} 步。

## 任务
{task}

## 你的计划
{plan_summary}

## 已完成
{completed_steps}

## 工作区文件
{file_list}

## 上一步
上一步操作: {last_action}
上一步结果: {last_result}

现在请决定下一步。你必须用以下 JSON 格式回复（不要输出其他内容）:

{
  "decision": "tool_call" | "deliverable" | "done",
  "tool_name": "web_search" | "run_python" | "write_file" | "read_file" | "list_files" | null,
  "tool_args": {...} | null,
  "deliverable_summary": "..." | null,
  "reason": "为什么做这个决定（一句话）"
}

规则:
- 如果是第 1 步，必须先制定计划
- 如果上一步结果不符合预期，考虑调整后续步骤
- 如果所有子任务完成且产出物已保存，选择 done
- 最多 20 步，请合理分配
```

**设计决策：JSON 格式而非自由文本。** 这是从 Team 模式学到的关键教训——GroupChat 中 Agent 的发言是自然语言，解析 tool call 靠 AutoGen 内部机制，不可控。Worker 模式下，Agent 的输出必须可预测地解析。

#### 4. Tool 注册接口

```python
# engines/worker/tools.py — 只定义注册方式

class ToolSpec(NamedTuple):
    name: str
    description: str       # 一段话，出现在 Agent 决策 prompt 的工具列表中
    parameters: dict       # JSON Schema 格式
    handler: Callable      # async def handler(**kwargs) -> str

# 注册方式:
WORKER_TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="web_search",
        description="搜索互联网。参数: query (搜索词)。返回前 5 条结果的标题和摘要。",
        parameters={"query": {"type": "string"}},
        handler=web_search_handler,
    ),
    # ... 其余 4 个
]
```

工具通过 `WorkspaceProvider` 操作文件——不直接 `open()` 或 `subprocess.run()`。

#### 5. 多 Agent 协作协议（预设计，Phase 25 用）

```python
# 文件锁协议（Agent 之间通过文件系统协调，不通过消息队列）

# Agent A 要写 report.md:
#   1. 创建 report.md.lock（空文件，标记占用）
#   2. 写入 report.md
#   3. 删除 report.md.lock

# Agent B 要读 report.md:
#   1. 检查 report.md.lock 是否存在 → 存在则等待（最多 30s）
#   2. 读取 report.md

# 任务队列通过 workspace 中的 .tasks/ 目录实现:
#   .tasks/pending/    → 待处理任务文件（JSON）
#   .tasks/claimed/    → 已被 Agent 认领
#   .tasks/done/       → 已完成
```

#### 验收标准（Step 86）

- [ ] 5 个 Protocol/数据类文件创建，每个类的方法都有完整 docstring 和类型注解
- [ ] SSE 事件 schema 覆盖 10 种事件类型，每种类型的 data 字段有明确的 TS 等价类型
- [ ] Agent 决策 prompt 模板写定——后续实现不得修改 JSON 字段名
- [ ] Tool 注册接口定义——新增工具只需加一个 ToolSpec，不修改引擎代码

---

### Step 87 — 工作流与状态机设计

> **产出物（只定义，不实现）：**

#### 1. Worker 状态机

```
                    ┌─────────┐
         create ──→ │  IDLE   │
                    └────┬────┘
                         │ execute(task)
                         ▼
                    ┌─────────┐
              ┌────→│ PLANNING│
              │     └────┬────┘
              │          │ plan ready
              │          ▼
              │     ┌─────────┐     tool_call     ┌──────────┐
              │     │DECIDING │──────────────────→│EXECUTING │
              │     └────┬────┘                    └────┬─────┘
              │          │ done                         │ tool done
              │          ▼                              ▼
              │     ┌─────────┐                    ┌──────────┐
              │     │  DONE   │                    │REFLECTING│
              │     └─────────┘                    └────┬─────┘
              │                                        │
              │          ┌─────────────────────────────┘
              │          │ continue (回到 DECIDING)
              │          │ revise_plan (回到 PLANNING)
              │          │ done (到 DONE)
              │          │ error (到 ERROR)
              │          ▼
              │     ┌─────────┐
              └─────│  ERROR  │──→ (重试 / 跳过 / 终止)
                    └─────────┘
```

**状态转换规则（精确到条件）：**

| 当前状态 | 事件 | 下一状态 | 条件 |
|---------|------|---------|------|
| IDLE | execute(task) | PLANNING | task 非空 |
| PLANNING | plan_ready | DECIDING | plan.steps 非空 |
| DECIDING | agent_chooses("tool_call") | EXECUTING | tool_name 在注册表中 |
| DECIDING | agent_chooses("done") | DONE | - |
| EXECUTING | tool_success | REFLECTING | 返回值可解析 |
| EXECUTING | tool_error | REFLECTING | 超时/权限/网络错误 |
| REFLECTING | agent_chooses("continue") | DECIDING | step < MAX_STEPS |
| REFLECTING | agent_chooses("revise") | PLANNING | step < MAX_STEPS |
| REFLECTING | agent_chooses("done") | DONE | - |
| REFLECTING | step >= MAX_STEPS | DONE | 强制终止 |
| 任何 | cancel | DONE | 用户取消 |
| 任何 | fatal_error | ERROR | 不可恢复的错误 |

#### 2. 错误恢复策略

```python
# 按错误类型分级处理

# Level 1: 可重试（自动重试 1 次）
#   - web_search 网络超时 → 等 2s → 重试
#   - run_python 超时 → 提示 Agent 简化代码 → 重试

# Level 2: 可跳过（Agent 自己决定）
#   - 搜索无结果 → Agent 决定: 换关键词 / 跳过此步
#   - 文件读取失败（不存在）→ Agent 决定: 先创建 / 跳过

# Level 3: 致命（终止 Worker）
#   - LLM API 连续 3 次失败
#   - 磁盘空间不足
#   - SSH 连接断开且无法重连
```

#### 3. Workspace 生命周期

```
创建 Worker
  → workspace_root = {base_dir}/{run_id}/
  → 子目录: files/  .tasks/  .logs/
  
Worker 运行中
  → 所有 write_file 写入 files/
  → 文件锁放在 files/
  → Agent 决策日志写入 .logs/decision_log.jsonl

Worker 完成/取消/错误
  → 保留 workspace（用户可下载）
  → 7 天后自动清理（定时任务）
  → 用户可主动删除: DELETE /api/workers/{run_id}
```

#### 4. 管道状态机（预设计，Phase 25 用）

```
Pipeline = DAG(Node)

每个 Node:
  ┌─────────┐     ┌──────────┐     ┌──────────┐
  │ PENDING │────→│ RUNNING  │────→│ COMPLETE │
  └─────────┘     └────┬─────┘     └──────────┘
       ↑               │
       │               ├─ error → ┌───────┐
       │               │          │ ERROR │
       │               │          └───┬───┘
       │               │              │
       │               └─ cancel → ┌────────┐
       │                           │CANCELLED│
       │                           └────────┘
       │
  依赖节点未完成 → PENDING
```

**管道执行规则：**
- 拓扑排序 → 按层级执行
- 同一层级的节点并行（最多 3 个并发）
- 某节点 ERROR → 依赖它的下游节点全部 SKIPPED
- 不依赖该节点的同层节点继续执行

#### 验收标准（Step 87）

- [ ] Worker 状态机图覆盖 6 个状态 + 10 条转换路径，每条标注触发条件
- [ ] 错误分级表覆盖 5+ 种常见错误，每种有明确的恢复策略
- [ ] Workspace 目录结构定义——后续工具实现直接引用
- [ ] 管道状态机定义——后续 PipelineEngine 实现直接引用

---

## Phase 23: Worker 核心

> **前置：** Phase 22 设计产物就绪。所有实现直接引用 Phase 22 的 Protocol/状态机/Schema。
> **目标：** 单 Agent 能在终端式工作台里独立完成任务——搜索、写代码、产出文件。

### Step 88 — AgentWorker 引擎

> **目标：** 实现设计文档中定义的 Worker 状态机 + 5 个工具 + SSE 事件流。

#### 实现要点

1. **状态机驱动。** `AgentWorker` 内部维护 `state: WorkerState`，每次状态转换通过 `_transition(new_state)` 记录日志 + 发射 SSE 事件。
2. **工具全部通过 WorkspaceProvider。** 初始实现用 `LocalWorkspace`（Phase 24 再引入 CloudWorkspace）。
3. **Agent 决策解析有容错。** JSON 解析失败 → 重试一次（重新发 prompt + 强调格式要求）→ 仍失败 → 进入 ERROR 状态。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/engine.py` | **新建** | `AgentWorker`——状态机驱动的决策循环 |
| `backend/src/engines/worker/tools.py` | **新建** | 5 个 tool handler + ToolSpec 注册 |
| `backend/src/engines/worker/prompts.py` | **新建** | Agent 决策 prompt 模板 + 工具描述生成 |
| `backend/src/engines/worker/events.py` | **新建** | SSE 事件数据类（从 Phase 22 设计搬过来） |
| `backend/src/api/workers.py` | **新建** | `POST /api/workers/execute`（SSE stream） |
| `backend/src/main.py` | 修改 | 注册 workers router |

**复用 State 4：**
- `LifeAgent` 的 `inject_context`（上下文连续）
- `LifeAgent.autogen_agent.on_messages()`（LLM 调用）
- Tool 闭包模式（Worker 的 tool handler 捕获 `WorkspaceProvider` 和 `agent_id`）

**不复用的（故意隔离）：**
- ❌ `WorldEngine`——Worker 不创建 World，不走 tick 循环
- ❌ `SelectorGroupChat`——单 Agent solo
- ❌ `PlanManager`——Agent 自己维护计划（在 scratchpad 中）

#### 验收标准

- [ ] 输入任务 → Worker 经过 IDLE → PLANNING → DECIDING → EXECUTING → REFLECTING 循环，最终到 DONE
- [ ] 每个状态转换有日志 + SSE 事件
- [ ] `web_search` 返回真实搜索结果（DuckDuckGo）
- [ ] `write_file` + `read_file` → Agent 能读写自己的工作区文件
- [ ] `run_python` 在子进程中执行 → Agent 看到 stdout/stderr
- [ ] Agent 能主动判断"完成了"→ 发射 `worker.done`
- [ ] Agent JSON 格式输出解析失败 → 自动重试 1 次 → 仍失败 → worker.error + 终止

---

### Step 89 — 终端式前端

> **目标：** 不是聊天框。是终端——用户看着 Agent 一行一行地工作。

#### 关键交互设计

1. **打字机效果。** SSE 事件到达 → 逐字符渲染，不是一次性加载。给用户"它真的在做事"的感觉。
2. **工具调用卡片。** `web_search` 结果以可展开卡片展示，不是纯文本。"找到 5 条结果 → [展开]"。
3. **文件面板。** 左侧文件树实时更新——新文件闪烁，大小显示。
4. **错误高亮。** 工具失败时终端显示红色文本 + Agent 的应对策略。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/WorkerBench.tsx` | **新建** | 工作台主页面——布局 + SSE hook |
| `frontend/src/components/worker/WorkerTerminal.tsx` | **新建** | 终端组件——打字机效果 + 事件行渲染 |
| `frontend/src/components/worker/WorkspacePanel.tsx` | **新建** | 文件树面板——实时更新 + 下载按钮 |
| `frontend/src/api/workers.ts` | **新建** | `useWorkerExecute` hook（EventSource） |
| `frontend/src/App.tsx` | 修改 | `/worker` 路由 |
| `frontend/src/components/layout/Sidebar.tsx` | 修改 | M12 Worker 入口 |

#### 验收标准

- [ ] 终端逐行渲染——每行出现有 30-50ms 延迟（视觉上有"干活"的感觉）
- [ ] `web_search` 结果显示为折叠卡片（标题 + 摘要 + URL），点击展开
- [ ] 文件面板实时更新——`file_updated` 事件到达时新增条目 + 闪烁动画
- [ ] 完成后下载按钮可点击 → 浏览器下载真实文件
- [ ] 停止按钮 → `EventSource.close()` → Worker 终止

---

### Step 90 — 安全沙盒

> **目标：** `run_python` 不能破坏系统。最多浪费 30 秒 CPU。

#### 实现要点

```
防护层次:
  1. 静态检查: 正则匹配 import os / import subprocess / import socket → 拒绝执行
  2. 路径限制: 所有文件操作必须在 workspace root 内
  3. 超时: 30 秒后 SIGKILL
  4. 输出截断: stdout 最多返回 10KB, stderr 最多 5KB
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/sandbox.py` | **新建** | 静态检查 + subprocess 执行 + 超时控制 |

#### 验收标准

- [ ] `print("hello")` → stdout="hello\n", exit_code=0
- [ ] `import os; os.system("ls")` → 拒绝（命中黑名单）
- [ ] `while True: pass` → 30s 超时
- [ ] 输出超过 10KB → 截断 + 末尾标注 `[... 输出已截断]`

---

### Step T10 — Phase 23 测试

| 被测模块 | 覆盖内容 |
|---------|---------|
| AgentWorker 状态机 | 6 状态全路径覆盖、JSON 解析容错、MAX_STEPS 强制终止 |
| 5 个工具 | 正常输入/异常输入/并发调用/WorkspaceProvider mock |
| E2E 全链路 | 真实 LLM: 任务→计划→搜索→写文件→自检→完成 |

---

## Phase 24: 双轨工作区

> **前置：** Phase 23 完成。Worker 在 LocalWorkspace 上稳定运行。
> **目标：** 同一套 Worker 代码，工作区可切换到远程云服务器。

### 设计决策（Phase 24 前置）

**WorkspaceProvider 的切换点在哪里？**

在 API 层——不在 Worker 引擎内部。Worker 引擎只接受 `WorkspaceProvider` 参数，不知道是本地还是云端。API 层根据用户请求参数创建对应的 provider 注入 Worker。

```
POST /api/workers/execute
  Body: {
    "agent_id": "...",
    "task": "...",
    "workspace": {
      "type": "local" | "cloud",
      // local:  { "path": "~/projects/xxx" }
      // cloud:  { "host": "...", "port": 22, "user": "...", "key": "...", "path": "/data/xxx" }
    }
  }
  → API 层根据 workspace.type 创建 LocalWorkspace 或 CloudWorkspace
  → 注入 AgentWorker
  → Worker 引擎不感知差异
```

**SSH 连接管理：**

- 每个 CloudWorkspace 实例持有一个 SSH 连接
- Worker 结束时关闭连接
- 连接断开 → 自动重连 1 次 → 仍失败 → Worker 进入 ERROR
- SSH 密钥仅存在内存中，不序列化到数据库或日志

### Step 91 — WorkspaceProvider 实现

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/workspace.py` | **新建** | `WorkspaceProvider` ABC + `LocalWorkspace` + `CloudWorkspace` |
| `backend/src/engines/worker/engine.py` | 修改 | `AgentWorker.__init__` 接受 `WorkspaceProvider` 参数 |
| `backend/src/api/workers.py` | 修改 | 新增 `POST /api/workers/test-connection`（SSH 连通性测试） |
| `requirements.txt` | 修改 | `+ asyncssh` |

#### 验收标准

- [ ] `LocalWorkspace.write_file("test.md", "hello")` → 文件出现在本地目录
- [ ] `CloudWorkspace.write_file("test.md", "hello")` → 文件出现在云端目录（SFTP）
- [ ] `CloudWorkspace.run_python("print(42)")` → stdout="42"，在云端执行（ssh exec）
- [ ] SSH 连接断开 → 自动重连 → 成功 → Worker 继续
- [ ] SSH 连接断开 → 重连失败 → Worker 进入 ERROR 状态

---

### Step 92 — 工作区切换前端

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/components/worker/WorkspaceSelector.tsx` | **新建** | 本地目录选择 / 云端 SSH 配置表单 + 连接测试 |
| `frontend/src/components/worker/CloudFileBrowser.tsx` | **新建** | 云端文件树——通过 `list_files` API 展示 |
| `frontend/src/pages/WorkerBench.tsx` | 修改 | 集成 WorkspaceSelector |

#### 验收标准

- [ ] 本地模式：可输入/浏览本地路径
- [ ] 云端模式：填 SSH 信息 → 点"测试连接"→ 显示连通状态 + 延迟
- [ ] 连通后 → 列出云端目录
- [ ] 工作区切换不刷新页面

---

### Step T11 — Phase 24 测试

| 被测模块 | 覆盖内容 |
|---------|---------|
| LocalWorkspace | 所有方法 + 路径穿越防护 |
| CloudWorkspace | SFTP 读写 + SSH exec + 断连重试 |
| E2E | 同任务双轨分别执行 → 产出文件一致性 |

---

## Phase 25: 多 Agent + 管道

> **前置：** Phase 24 完成。WorkspaceProvider 抽象稳定。
> **目标：** 多个 Agent 在同一工作区协作 + 管道编排。

### 设计决策（Phase 25 前置）

**Agent 之间怎么沟通？**

不聊天。通过文件。

```
Agent A 产出 data/trends.json
  → Agent B 依赖此文件
  → Agent B 的 depends_on: ["data/trends.json"]
  → Coordinator 检测到文件存在 → 启动 Agent B
  → Agent B read_file("data/trends.json") → 开始工作
```

这避免了 GroupChat 的所有复杂性。不需要消息路由、不需要发言顺序、不需要身份冲突检测。文件就是接口。

**管道和共享工作区的关系：**

- 共享工作区：多个 Agent 自由协作，通过文件锁 + 任务队列协调
- 管道：预设的 DAG——节点间依赖明确，按拓扑顺序执行，不自由

管道是共享工作区的**特化**——加了顺序约束。底层用同一个 `WorkspaceCoordinator`。

### Step 93 — 共享工作区引擎

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/coordinator.py` | **新建** | 文件锁 + 任务队列 + 依赖等待 |
| `backend/src/api/workers.py` | 修改 | `POST /api/workers/execute` 支持 `agents: [{id, task, depends_on}]` |

#### 验收标准

- [ ] 2 Agent 同 workspace → 各自文件互见
- [ ] Agent B 依赖 `data/trends.json` → 等待直到 Agent A 创建该文件 → 自动启动
- [ ] 两个 Agent 同时写同一文件 → 文件锁排队，无冲突

---

### Step 94 — 管道编排引擎

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/pipeline.py` | **新建** | DAG 拓扑排序 + 层级并行执行 |
| `backend/src/models/pipeline_orm.py` | **新建** | Pipeline 持久化 |
| `backend/src/api/pipelines.py` | **新建** | CRUD + execute 端点 |
| `backend/src/db.py` | 修改 | 注册 pipeline_orm |

#### 验收标准

- [ ] 3 节点串行管道按序执行
- [ ] 2 节点无依赖 → 并行执行
- [ ] 某节点失败 → 下游 SKIPPED，不依赖它的节点继续
- [ ] 管道可保存/加载

---

### Step 95 — 管道前端

> **关键是降低复杂度。** 不用拖拽式 DAG 编辑器——用**配置面板式**。

```
┌─────────────────────────────────────────────────────┐
│  🔗 Agent 管道                                       │
│                                                     │
│  ┌─ 节点列表 ──────────────────────────────────────┐ │
│  │                                                │ │
│  │  #1 [小林 (ISTJ) ▼]                            │ │
│  │    任务: [搜索 AI Agent 框架_______________]     │ │
│  │    依赖: (无)                                   │ │
│  │    ──────────────────────────────────────       │ │
│  │  #2 [小刚 (ESTJ) ▼]                            │ │
│  │    任务: [分析对比数据___________________]       │ │
│  │    依赖: [#1 ▼]                                │ │
│  │    ──────────────────────────────────────       │ │
│  │  #3 [小红 (ENFP) ▼]                            │ │
│  │    任务: [撰写趋势报告___________________]       │ │
│  │    依赖: [#2 ▼]                                │ │
│  │    ──────────────────────────────────────       │ │
│  │                                                │ │
│  │  [+ 添加节点]                                   │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  管道预览:  #1 → #2 → #3                            │
│                                                     │
│  [▶ 运行管道]                                       │
└─────────────────────────────────────────────────────┘
```

**为什么不用拖拽？** 拖拽式 DAG 编辑器对 3-5 个节点的管道是过度设计。下拉选择依赖关系更简单、更不出错、移动端也能用。如果以后需要拖拽，在这个数据结构上加 React Flow 只要换 UI 层——后端数据模型不变。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/pages/PipelinePage.tsx` | **新建** | 管道管理——列表 + 创建 + 运行监控 |
| `frontend/src/components/pipeline/PipelineEditor.tsx` | **新建** | 节点配置面板 + 依赖选择 + 预览 |
| `frontend/src/components/pipeline/PipelineMonitor.tsx` | **新建** | 运行监控——节点状态颜色 + 实时进度 |
| `frontend/src/api/pipelines.ts` | **新建** | CRUD + execute SSE hook |
| `frontend/src/App.tsx` | 修改 | `/pipeline` 路由 |

#### 验收标准

- [ ] 创建管道 → 添加 3 个节点 → 设置依赖 → 保存
- [ ] 运行管道 → 节点按序执行 → 颜色变化（灰→蓝→绿/红）
- [ ] 节点完成 → 可下载该节点的产出文件
- [ ] 管道运行中可取消

---

### Step T12 — Phase 25 测试

| 被测模块 | 覆盖内容 |
|---------|---------|
| WorkspaceCoordinator | 文件锁并发/依赖等待/队列 |
| PipelineEngine | 拓扑排序/并行/失败传播 |
| E2E | 3 Agent 管道全链路 |

---

## Phase 26: 自主调度 + 发布

> **前置：** Worker 核心稳定（Phase 23 完成即可）。双轨、管道、协作等扩展可不依赖。
> **目标：** Agent 能自己定时启动。项目可对外发布。

### Step 96 — 自主调度器 + 演示

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/scheduler.py` | **新建** | Cron + 文件监视器 + check_in |
| `backend/src/api/workers.py` | 修改 | scheduler 在 FastAPI lifespan 中启动 |
| `scripts/demo-worker.sh` | **新建** | 单 Agent 调研报告演示脚本 |
| `scripts/demo-pipeline.sh` | **新建** | 管道协作演示脚本 |
| `docs/demo-scripts.md` | **新建** | 演示台词 + 时间轴 |

#### 验收标准

- [ ] Agent 设定 `daily 08:00` → 第二天自动执行
- [ ] 文件监视：新文件放入监控目录 → Agent 自动处理
- [ ] 3 条演示可独立跑通，每条 2-3 分钟

---

### Step 97 — 部署 + 文档

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `Dockerfile` | **新建** | 多阶段构建 |
| `frontend/src/pages/Landing.tsx` | **新建** | 落地页 |
| `README.md` | 重写 | 面向用户的 README |
| `docs/quickstart.md` | **新建** | 5 分钟快速开始 |

#### 验收标准

- [ ] `docker compose up` → 完整产品可访问
- [ ] README 包含：截图 + 安装命令 + 快速开始
- [ ] 落地页包含：hero + 特性 + 终端录屏 GIF

---

## 附录 A: 接口清单（设计 Phase 产出）

| # | 接口/协议 | 定义位置 | 实现位置 | 依赖它的模块 |
|---|----------|---------|---------|------------|
| 1 | `WorkspaceProvider` | `workspace.py` (Phase 22) | `workspace.py` (Phase 24) | tools, engine, coordinator |
| 2 | `WorkerEvent` schema | `events.py` (Phase 22) | `events.py` (Phase 23) | engine, api/workers, 前端 |
| 3 | Agent 决策协议 | `prompts.py` (Phase 22) | `prompts.py` (Phase 23) | engine |
| 4 | `ToolSpec` 注册 | `tools.py` (Phase 22) | `tools.py` (Phase 23) | engine |
| 5 | Worker 状态机 | 设计文档 (Phase 22) | `engine.py` (Phase 23) | engine, api/workers |
| 6 | 管道节点数据模型 | `pipeline.py` (Phase 22) | `pipeline.py` (Phase 25) | pipeline, 前端 |
| 7 | 文件锁协议 | 设计文档 (Phase 22) | `coordinator.py` (Phase 25) | coordinator |

**每个接口在设计 Phase 产出后即冻结。** 实现 Phase 只能引用，不能修改——如需修改，先回到设计文档改，再改实现。

---

## 附录 B: 风险与可控性评估

| 模块 | 复杂度 | 风险 | 为什么可控 |
|------|--------|------|-----------|
| AgentWorker 引擎 | 中 | 低 | 状态机驱动，每步可单测。不依赖 World/GroupChat/PlanManager |
| 5 个工具 | 低 | 低 | web_search=httpx, 文件操作=pathlib, run_python=subprocess |
| 终端前端 | 中 | 低 | SSE 已有成熟方案（M2/M3），打字机效果是 CSS animation |
| CloudWorkspace | 中 | 中 | asyncssh 成熟库。风险在连接管理——用显式状态机控制 |
| 共享工作区 | 中 | 中 | 文件锁用 asyncio.Lock，不引入分布式协议。Agent 不聊天，只共享文件 |
| 管道引擎 | 中 | 低 | 拓扑排序是经典算法。风险在并行执行——限制最大并发数 |
| 管道前端 | 中 | 低 | 配置面板式，不写拖拽。如果效果好，后续换 React Flow 只需换 UI 层 |
| 调度器 | 低 | 低 | Cron 检查 + 文件监视 = asyncio 定时器，无外部依赖 |
| 部署 | 低 | 低 | Docker 多阶段构建，标准操作 |

**最大的风险已经排除：** 不重复 Team 模式——不在 GroupChat 上堆任务执行。Worker 是单一协议：Agent 决策 → 工具执行 → 反馈。没有发言顺序、没有身份冲突、没有 tick 同步。

---

> **最后更新:** 2026-07-31
> **维护者:** 晓音_Stingray
> **版本:** 5.0 (Plan State 5)
> **基准:** State 4 已完成
> **核心改动:** 设计先于实现——Phase 22 只定义接口不写代码，Phase 23–26 全部引用 Phase 22 的设计产物
