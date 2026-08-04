# 人生实验室 · Life Lab — Plan State 7

> **文档目的：** 第七阶段——平台柔化 + M12 深度化。两个方向，小而精。
> **上一阶段：** State 6（M11 游戏化互动 + M10/M12 增强 + 零成本推广——全部完成）
> **当前状态：** 12 个模块端到端可用。但用户的控制力弱——参数硬编码、Pipeline 没有循环、worker 不能处理附件、工具不能按节点定制。本阶段补上这些。

---

## Step 速查表

| Step | 名称 | 依赖 | 核心产出 | 估时 |
|------|------|------|----------|------|
| **⚙️ 平台柔化** | | | | |
| 103 | 用户可调参数面板 | config.py | Settings API + 前端面板 + 全部硬编码替换为 settings 引用 | 2h |
| **🔧 M12 深度化** | | | | |
| 104 | Pipeline Loop + 附件拖拽 | State 5 Pipeline | 回边+条件+迭代上限 + 拖拽上传 PDF/MD/CSV 到 workspace | 4.5h |
| 105 | 特殊工具节点 + 可选工具 | 104, State 5 Worker | per-node 工具过滤 + 4 个特殊工具 + Worker 工具开关 | 5h |

> **共 3 个 Step，~12 小时。** 独立——103 和 104/105 可并行。

---

## Step 103 — 用户可调参数面板

> **目标：** 把硬编码在 `config.py` 和各 engine 里的参数暴露给用户。一个面板——滑块+开关+预设——改完即生效。
> **设计原则：** 不引入新配置格式。`UserSettings` 是 Pydantic 模型——默认值来自现有硬编码。改一个参数 = 改一个字段。

### 需要暴露的参数

```
┌─ ⚙️ 平台设置 ─────────────────────────────────────────────────┐
│                                                              │
│ 🧠 Agent 决策                          [恢复此组默认]          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 思考深度 (temperature)     [0.3──────●──0.8──────1.5]    │ │
│ │  低=更确定  高=更多样                                      │ │
│ │                                                          │ │
│ │ 决策随机性                  [0%───●──5%──────20%]         │ │
│ │  Agent 偶尔做反常选择的概率                                  │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ 💬 M11 场景                             [恢复此组默认]          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 主动搭话频率                [很少───●──────经常]            │ │
│ │                                                          │ │
│ │ 空闲暂停时间                [1min──●─5min────30min]       │ │
│ │                                                          │ │
│ │ 情绪衰减速度                [慢─────●──────快]             │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ 🛠️ M12 Worker                          [恢复此组默认]          │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ 最大步数                    [10─────●30─────50]           │ │
│ │                                                          │ │
│ │ 自我修正次数                [1──────●3──────10]           │ │
│ │  (Agent 最多允许改几版)                                     │ │
│ │                                                          │ │
│ │ 超时时间 (分钟)              [5──────●15─────30]           │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ [全部恢复默认]  [保存]                                          │
└──────────────────────────────────────────────────────────────┘
```

### 参数与硬编码的对应关系

| 面板参数 | 现有硬编码位置 | 默认值 |
|---------|--------------|--------|
| 思考深度 (temperature) | `config.py:LLM_TEMPERATURE_THINK` / `LLM_TEMPERATURE_ACT` | think=0.8, act=0.5 |
| 决策随机性 | `prompt_templates.py` 行为准则第 5 条 "偶尔做反常选择（概率约 5%）" | 5% |
| 主动搭话频率 | `ProactiveChatManager.ts` 内部常量 | 4-8 分钟 |
| 空闲暂停时间 | `GameScene.tsx` 硬编码 5 分钟 | 5 分钟 |
| 情绪衰减速度 | `EmotionEngine.ts:decay_interval` | 15s |
| 最大步数 | `engine.py:MAX_ITERATIONS` | 30 |
| 自我修正次数 | Worker 硬编码（无上限——只要有步数就一直改） | 3 |
| 超时时间 | Worker 硬编码（无全局超时——只有单步 tool 30s 超时） | 15 分钟 |

### 实现

```python
# config.py — 新增

class UserSettings(BaseModel):
    """用户可调的运行时参数。通过 API 读写，localStorage 前端缓存。"""
    
    # Agent 决策
    temperature_think: float = Field(default=0.8, ge=0.1, le=1.5)
    temperature_act: float = Field(default=0.5, ge=0.1, le=1.5)
    randomness_pct: float = Field(default=5.0, ge=0.0, le=30.0)
    
    # M11 场景
    proactive_chat_interval_min: int = Field(default=6, ge=1, le=30)
    idle_pause_minutes: int = Field(default=5, ge=1, le=60)
    emotion_decay_seconds: int = Field(default=15, ge=5, le=60)
    
    # M12 Worker
    worker_max_steps: int = Field(default=30, ge=5, le=50)
    worker_max_revisions: int = Field(default=3, ge=1, le=10)
    worker_timeout_minutes: int = Field(default=15, ge=5, le=30)

# 全局单例——启动时从 DB 加载，无则用默认值
_settings: UserSettings | None = None

def get_settings() -> UserSettings:
    if _settings is None:
        load_settings()
    return _settings
```

### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/config.py` | 修改 | 新增 `UserSettings` 模型 + 全局单例 + load/save |
| `backend/src/api/settings.py` | **新建** | `GET/PUT /api/settings` |
| `backend/src/main.py` | 修改 | 注册 settings router |
| `backend/src/llm/client.py` | 修改 | `create_model_client` 从 settings 读温度——不再读 `config.settings` 常量 |
| `backend/src/engines/worker/engine.py` | 修改 | `MAX_ITERATIONS` → `get_settings().worker_max_steps`；新增全局超时 |
| `backend/src/engines/persona/prompt_templates.py` | 修改 | 随机偏差百分比 → `get_settings().randomness_pct` |
| `frontend/src/pages/SettingsPage.tsx` | **新建** | 设置面板——滑块+开关+恢复默认+保存 |
| `frontend/src/api/settings.ts` | **新建** | `useSettings` / `useUpdateSettings` hooks |
| `frontend/src/App.tsx` | 修改 | `/settings` 路由 |
| `frontend/src/components/layout/Sidebar.tsx` | 修改 | 侧边栏底部齿轮图标 → 设置页 |

### 验收标准

- [ ] 打开设置页 → 8 个滑块显示当前值（默认值首次）
- [ ] 拖动"思考深度"到 0.3 → 保存 → Worker 任务的 Agent 发言更确定（手动对比）
- [ ] 拖动"主动搭话频率"到"经常"→ M11 Agent 搭话间隔明显缩短
- [ ] 点击"恢复默认"→ 参数回到初始值
- [ ] 刷新页面 → 设置保持（localStorage + API 双重持久化）
- [ ] 各个 engine 读取的参数确实来自 settings（不再是硬编码常量）
- [ ] 滑块有范围限制——不能设到非法值（`ge`/`le` 在 Pydantic 层拦截）

---

## Step 104 — Pipeline Loop + 附件拖拽

> **目标：** 两项——① Pipeline 支持回边形成循环（质检不通过 → 回到分析重新来）；② Worker 任务支持拖拽上传附件（PDF/MD/CSV 预置到 workspace）。

### ① Pipeline Loop

#### 设计

当前 Pipeline 是有向无环图（DAG）。加 loop 后变成有向图——允许回边。

```
[数据采集] → [数据分析] → [报告生成] → [质检]
                 ↑                          │
                 └────── condition ──────────┘
                        质检: FAILED
                        max_iter: 3
```

**回边的定义：** 一条从下游节点指向回上游节点的边，带有 condition 和 max_iter。

```python
@dataclass
class PipelineEdge:
    from_node: str
    to_node: str
    loop: bool = False              # 是否是回边
    condition: str | None = None    # 触发回边的条件（如 "FAILED" 或 "score < 0.7"）
    max_iterations: int = 3         # 最大循环次数
```

**执行逻辑：**

```
PipelineEngine.execute():
  order = topological_sort(nodes, edges)  # 拓扑排序（回边不参与排序）
  iteration_counts = {}                   # 追踪每段循环的迭代次数
  
  for node in order:
    run_node(node)
    
    # 检查以该节点为起点的回边
    for edge in get_back_edges_from(node):
      if edge.condition in node.output:   # 条件满足
        if iteration_counts[edge] < edge.max_iterations:  # 未超限
          # 将 edge.from_node 到 edge.to_node 之间的节点全部重新入队
          re_enqueue(path_between(edge.to_node, edge.from_node))
          iteration_counts[edge] += 1
        else:
          logger.warning(f"循环达到上限 {edge.max_iterations}，跳过回边 {edge.from_node}→{edge.to_node}")
```

**前端：** 管线编辑器加一个"添加回边"按钮——从质检节点拖回线到分析节点。回边显示为虚线（和非回边的实线区分），线上标注条件文本和迭代上限。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/pipeline.py` | 修改 | `PipelineEdge` 加 `loop/condition/max_iter` 字段；`PipelineEngine` 加回边检测 + 条件判断 + 迭代计数 |
| `frontend/src/components/pipeline/PipelineEditor.tsx` | 修改 | 加"添加回边"按钮；回边虚线渲染 + 条件/上限编辑 |

### ② 附件拖拽

#### 设计

WorkerBench 任务输入框下方加一个文件投递区。拖 PDF/MD/CSV/TXT 进去 → `POST /api/workers/upload` → 写入 workspace → SSE `file_updated`。

```
┌─ 任务 ──────────────────────────────────────────────┐
│                                                     │
│ [帮我分析这份数据，写一份趋势报告___________________]  │
│                                                     │
│ ┌─ 附件 ──────────────────────────────────────────┐  │
│ │  📄 sales-2025.csv  (128KB)  [✕]                │  │
│ │  📄 report-template.md (2KB)  [✕]               │  │
│ │                                                 │  │
│ │  ┌──────────────────────────────────────────┐   │  │
│ │  │  📁 拖拽文件到这里，或点击选择              │   │  │
│ │  └──────────────────────────────────────────┘   │  │
│ └─────────────────────────────────────────────────┘  │
│                                                     │
│ [▶ 执行]                                             │
└─────────────────────────────────────────────────────┘
```

Agent 的决策 prompt 自动加一行：

```
## 工作区已有文件（由用户提供）
- sales-2025.csv (128KB) — 原始数据文件
- report-template.md (2KB) — 报告模板，请按此结构填写
```

**实现：** 纯前端 File API + 一个上传端点。上传在 Worker 启动前完成——Agent 看到 workspace 时文件已经就位。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/api/workers.py` | 修改 | `POST /api/workers/upload`——接收文件 → 校验类型(仅 pdf/md/csv/txt) → 写入 workspace |
| `frontend/src/components/worker/FileDropZone.tsx` | **新建** | 拖拽区——高亮+文件列表+删除 |
| `frontend/src/pages/WorkerBench.tsx` | 修改 | 集成 FileDropZone + 上传逻辑 |

#### 验收标准 (Step 104)

- [ ] Pipeline 边上加 `loop=true, condition="FAILED", max_iter=3` → 质检节点输出含 FAILED → 回到分析节点 → 最多循环 3 次
- [ ] 循环达到上限 → 跳过回边 → 日志记录警告
- [ ] 拖 CSV 文件到投递区 → 上传成功 → workspace 出现该文件 → Agent 上下文包含文件信息
- [ ] 拖 `.exe` / `.dll` → 拒绝（仅允许 pdf/md/csv/txt）
- [ ] 文件列表可删除（✕ 按钮）——删除同时从 workspace 移除
- [ ] 无循环的 Pipeline 行为不变（向后兼容）

---

## Step 105 — 特殊工具节点 + 可选工具

> **目标：** 两项——① Pipeline 的节点可以挂只有该节点能用的特殊工具（思维导图生成器、时间线渲染器等）；② Worker 单次任务的工具可以由用户勾选开关。

### ① 特殊工具节点

#### 设计

Pipeline 节点定义加 `extra_tools: list[str]`。Agent 在该节点执行时，`extra_tools` 中的工具追加到基础工具集。

```
Pipeline:
  [数据采集] ← tools: [web_search, write_file, read_file]
  [思维导图] ← tools: 同上 + [mindmap_generate]
  [报告]     ← tools: [write_file, read_file]
```

```python
# pipeline.py

@dataclass
class PipelineNode:
    agent_id: str
    task: str
    extra_tools: list[str] = field(default_factory=list)  # 本节点专属工具
```

AgentWorker 在节点开始时注册 `base_tools + extra_tools`。节点结束时恢复到 `base_tools`。

**4 个预设特殊工具：**

| 工具 | 输入 | 产出 | 实现 |
|------|------|------|------|
| `mindmap_generate(topic)` | 主题 | Markdown Mermaid 格式思维导图 → `mindmap.md` | 预设 LLM prompt——"请基于{topic}生成 Mermaid 格式的思维导图" |
| `chart_generate(data_json, chart_type)` | JSON 数据 + 图表类型 | matplotlib 生成 PNG → `chart.png` | Python 子进程——`import matplotlib; plt.bar(...); plt.savefig()` |
| `timeline_generate(events_json)` | 事件 JSON 数组 | 交互式时间线 HTML → `timeline.html` | 预设 HTML 模板——填入事件数据 |
| `diff_analyze(file_a, file_b)` | 两个文件路径 | 差异分析报告 → `diff_report.md` | LLM 对比两份文件内容——输出差异+建议 |

**为什么是"预设"而不是"Agent 自己写工具"：** 预设意味着工具的实现是 Python 函数——可控、可测、安全。Agent 只需要知道"这个节点我能调 mindmap_generate(topic)"。

#### 工具注册

```python
# tools.py

SPECIAL_TOOLS = {
    "mindmap": ToolSpec(
        name="mindmap_generate",
        description="基于给定主题生成 Mermaid 格式的思维导图，保存为 mindmap.md",
        parameters={"topic": {"type": "string"}},
        handler=mindmap_handler,
        output_file="mindmap.md",
    ),
    "chart": ToolSpec(
        name="chart_generate",
        description="基于 JSON 数据生成图表（支持 bar/line/pie），保存为 chart.png",
        parameters={"data_json": {"type": "string"}, "chart_type": {"type": "string"}},
        handler=chart_handler,
        output_file="chart.png",
    ),
    "timeline": ToolSpec(...),
    "diff": ToolSpec(...),
}
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/tools.py` | 修改 | 新增 `SPECIAL_TOOLS` 注册表 + 4 个 handler |
| `backend/src/engines/worker/pipeline.py` | 修改 | `PipelineNode` 加 `extra_tools`；执行时按节点注册/注销工具 |
| `backend/src/engines/worker/engine.py` | 修改 | `AgentWorker` 支持 `extra_tools` 参数 |
| `frontend/src/components/pipeline/PipelineEditor.tsx` | 修改 | 节点编辑面板加"特殊工具"多选 |

### ② 单任务可选工具

#### 设计

WorkerBench 任务面板加一行工具开关——复选框，默认全选。用户可以用"只给搜索和写文件"来限制 Agent 行为。

```
┌─ 可用工具 ───────────────────────────────────────────┐
│ [✓] web_search    [✓] write_file    [✓] read_file    │
│ [✓] list_files    [✓] run_python    [ ] install_pkg  │
└──────────────────────────────────────────────────────┘
```

```python
# POST /api/workers/execute
{
    "agent_id": "...",
    "task": "...",
    "enabled_tools": ["web_search", "write_file", "read_file", "run_python"]
    # ← 只注册这些工具。不在此列表中的 Agent 看不到。
}
```

AgentWorker 初始化时按 `enabled_tools` 过滤 `ToolSpec` 列表。Agent 的决策 prompt 也只列可用的工具。

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/worker/engine.py` | 修改 | `AgentWorker.__init__` 加 `enabled_tools` 参数——过滤 ToolSpec |
| `backend/src/api/workers.py` | 修改 | `execute` 端点加 `enabled_tools` 字段 |
| `frontend/src/components/worker/ToolSelector.tsx` | **新建** | 工具开关——复选框组 |
| `frontend/src/pages/WorkerBench.tsx` | 修改 | 集成 ToolSelector |

#### 验收标准 (Step 105)

- [ ] Pipeline 节点"思维导图"的 extra_tools = ["mindmap"] → Agent 在该节点可调 mindmap_generate
- [ ] 节点完成后 → 下一个节点（extra_tools=[]）→ Agent 不能调 mindmap_generate
- [ ] mindmap_generate("AI Agent 框架对比") → workspace 产出 mindmap.md（Mermaid 格式）
- [ ] chart_generate 在沙盒中跑 matplotlib → 产出 chart.png（沙盒安全规则适用）
- [ ] WorkerBench 取消勾选"run_python" → Agent 收到任务 → 决策 prompt 不包含 run_python → Agent 全程不能调
- [ ] enabled_tools 为空 → 拒绝执行 + 提示"至少选择一个工具"
- [ ] 不传 enabled_tools → 默认所有工具可用（向后兼容）

---

> **最后更新:** 2026-08-01
> **维护者:** 晓音_Stingray
> **版本:** 7.0 (Plan State 7)
> **基准:** State 6 已完成
> **设计重点:** 小而精——3 个 Step / 12h。不加新模块，把已有模块的控制力交给用户。
