# 人生实验室 · Life Lab — Plan State 4

> **文档目的：** 第四阶段——Agent 属性强化。不新增用户可见模块，而是深度改造 Agent 内核。
> **上一阶段：** [Plan State 3](plan-state3.md)（Step 51–76，Phase 14–17，三大模块已交付/进行中）
> **当前状态：** 11 个模块端到端联通、前端表现力强（8/10）、但 Agent 内核弱（3.4/10）。
>   - Agent 的 4 个 tool 全是 stub——调用后返回占位字符串，不产生真实副作用。
>   - 每个 tick 清空 AutoGen 消息缓冲并重建 system prompt——Agent 没有持续意识流。
>   - M11 场景 Agent 精灵由前端 EmotionEngine + mock 对话池驱动，与后端 WorldEngine 完全脱节。
>   - 记忆检索仅有关键词匹配 + 时间衰减，没有反思固化和跨 episode 迁移。
> **本阶段目标：** 工具真实化 → 上下文连续化 → 场景-Brain 联动 → 记忆固化。让 Agent 从"木偶"变"活物"。
>
> **与 State 3 的关系：** State 3 长器官（新模块），State 4 强内核（改引擎）。State 3 的 M1–M11 保持不动，State 4 在其下改造 WorldEngine / LifeAgent / Tool 体系。**对外 API 不变，对内行为升级。**
>
> **设计原则：** 先改底层再改上层、每步一个可观测的行为变化、禁止破坏现有 SSE 协议。

---

## Step 速查表

| Step | Phase | 名称 | 依赖 | 核心产出 | 估时 |
|------|-------|------|------|----------|------|
| **🧠 Phase 18: Agent 内核复活** | | | | | |
| 77 | 18.1 | 消除 tick 上下文清空 | — | `inject_context` 改为追加 UserMessage 而非覆盖 system prompt；新增上下文压缩 | 6h |
| 78 | 18.2 | Agent Scratchpad | 77 | 私有笔记 tool + LifeAgent._notes + 上下文自动注入最近笔记 | 5h |
| 79 | 18.3 | 工具真实化 | 77, 78 | send_message 真实投递 / set_goal 写入目标列表 / observe 读取公开状态 / tool 闭包注入 WorldEngine 引用 | 12h |
| T7 | — | Phase 18 测试 | 77–79 | 后端 4 测试文件 + 回归全量 + E2E 场景 | 4h |
| **🔗 Phase 19: Agent 能力扩展** | | | | | |
| 80 | 19.1 | 动态重规划 | 79 | revise_plan tool + PlanManager 重规划方法 + SSE plan_revised 事件 + 前端看板联动 | 8h |
| 81 | 19.2 | M11 场景-Brain 联动 | 79 | SceneEngine → WorldEngine 桥接 + 前端对话切 SSE + 移动变为 tool call + AutonomousMover SSE 驱动 | 14h |
| T8 | — | Phase 19 测试 | 80–81 | 后端 3 测试文件 + 前端组件测试 + 场景全链路 E2E | 5h |
| **🌱 Phase 20: Agent 成长与深度** | | | | | |
| 82 | 20.1 | 情景记忆固化 | 79 | MemoryConsolidator + 每 episode 结束反思 + lesson 类型记忆 + 检索时类型过滤 | 10h |
| 83 | 20.2 | 行为指纹 + Web 搜索 | 82 | behavior_fingerprint 数据采集 + 偏好路径可视化 + web_search tool | 12h |
| T9 | — | Phase 20 测试 | 82–83 | 后端 3 测试文件 + 前端指纹组件测试 + 长期运行稳定性测试 | 5h |
| **⚡ Phase 21: 架构深化（可选）** | | | | | |
| 84 | 21.1 | 事件驱动架构原型 | 79 | EventBus + agent 实时响应 + 中断当前 tick 机制 + AutoGen 兼容性验证 | 16h |
| 85 | 21.2 | 代码执行沙盒 | 84 | Docker/subprocess 沙盒 + run_python tool + 安全隔离 + Team 模式集成 | 12h |

> **共 13 个 Step。** 核心开发 6 步（77–79, 80–81, 82–83），可选开发 2 步（84–85），测试 3 步（T7–T9）。Phase 18 是强制前置——做完它，Agent 才从"戏剧舞台"变成"活物"。
> **总计估时：** ~94 小时（一人 + AI），其中 Phase 18=27h, Phase 19=27h, Phase 20=27h, Phase 21=28h。

---

## 目录

- [架构设计：改内核不改界面](#架构设计改内核不改界面)
- [Phase 18: Agent 内核复活](#phase-18-agent-内核复活)
  - [Step 77 — 消除 tick 上下文清空](#step-77--消除-tick-上下文清空)
  - [Step 78 — Agent Scratchpad](#step-78--agent-scratchpad)
  - [Step 79 — 工具真实化](#step-79--工具真实化)
  - [Step T7 — Phase 18 测试](#step-t7--phase-18-测试)
- [Phase 19: Agent 能力扩展](#phase-19-agent-能力扩展)
  - [Step 80 — 动态重规划](#step-80--动态重规划)
  - [Step 81 — M11 场景-Brain 联动](#step-81--m11-场景-brain-联动)
  - [Step T8 — Phase 19 测试](#step-t8--phase-19-测试)
- [Phase 20: Agent 成长与深度](#phase-20-agent-成长与深度)
  - [Step 82 — 情景记忆固化](#step-82--情景记忆固化)
  - [Step 83 — 行为指纹 + Web 搜索](#step-83--行为指纹--web-搜索)
  - [Step T9 — Phase 20 测试](#step-t9--phase-20-测试)
- [Phase 21: 架构深化（可选）](#phase-21-架构深化可选)
  - [Step 84 — 事件驱动架构原型](#step-84--事件驱动架构原型)
  - [Step 85 — 代码执行沙盒](#step-85--代码执行沙盒)
- [附录 A: 改动文件汇总与频次](#附录-a-改动文件汇总与频次)
- [附录 B: 核心调用链（改造前后对比）](#附录-b-核心调用链改造前后对比)
- [附录 C: 风险矩阵](#附录-c-风险矩阵)

---

## 架构设计：改内核不改界面

### 核心决策

State 3 已经建立了完整的用户界面体系（11 个模块、56 项菜单、Phaser 场景系统）。State 4 不新增任何用户可见的菜单或页面——**所有改动都在引擎层**，用户通过现有界面感受到 Agent "变聪明了"。

```
State 3（已完成）                    State 4（本阶段）
━━━━━━━━━━━━━━━━━━━━━━━━━━          ━━━━━━━━━━━━━━━━━━━━━━━━━━━
M1–M11 全部菜单保持不动              不改任何前端路由/菜单
SSE 协议格式不变                     不改 _event_to_dict 输出格式
REST API 端点不变                    不改 endpoint URL 和 method
                                     改：
                                     ├─ LifeAgent 内部状态管理
                                     ├─ Tool 函数副作用
                                     ├─ WorldEngine tick 流程
                                     ├─ SceneEngine ↔ WorldEngine 桥接
                                     ├─ MemoryRetriever → MemoryConsolidator
                                     └─ M11 MapScene 对话/移动数据源
```

**设计规则：**
- 前端的 `SSEEvent` TypeScript 接口不增不减——现有字段足够承载新事件类型
- `SimEvent` Pydantic 模型可加字段（`data` dict 天然可扩展），不可删字段
- 所有 tool 签名不变（仍是 `async def tool(args) -> str`），只改函数体
- 外部可见的行为变化通过 SSE 事件的新 `type` 值体现（如 `plan_revised`、`memory_consolidated`）

---

### 改造前后对比：Agent 感知-决策-行动循环

```
┌─── 改造前（每个 tick）──────────────────────────────────────┐
│                                                             │
│  1. WorldEngine._inject_world_context()                     │
│     └─ 从 DB 读状态 → 拼文本 → agent.inject_context()       │
│         └─ ⚠️ 覆盖 system prompt + 清空所有对话历史          │
│                                                             │
│  2. _stream_group_tick()                                    │
│     └─ AutoGen SelectorGroupChat.run_stream()               │
│         └─ Agent LLM 生成发言/调用 tool                      │
│             └─ ⚠️ tool 返回占位字符串，不产生副作用           │
│                                                             │
│  3. _post_process_tick()                                    │
│     └─ 解析 tool call description → 手动应用"副作用"         │
│         └─ ⚠️ Agent 看不到 tool 的真实执行结果               │
│                                                             │
│  4. _finish_tick() → events 落库 → tick++ → 循环             │
│     └─ ⚠️ 下个 tick 回到步骤 1，Agent 丢失所有上下文         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─── 改造后（每个 tick）──────────────────────────────────────┐
│                                                             │
│  1. WorldEngine._inject_world_context()                     │
│     └─ 从 DB 读状态 → 拼 UserMessage → agent.add_context()  │
│         └─ ✅ 追加到消息历史末尾，不覆盖 system prompt        │
│         └─ ✅ 消息超过阈值时 LLM 自动摘要压缩                 │
│                                                             │
│  2. _stream_group_tick()                                    │
│     └─ AutoGen SelectorGroupChat.run_stream()               │
│         └─ Agent LLM 生成发言/调用 tool                      │
│             └─ ✅ tool 函数内部操作 WorldEngine 产生真实副作用 │
│             └─ ✅ tool 返回值反映真实执行结果                 │
│                                                             │
│  3. _post_process_tick()                                    │
│     └─ ✅ 大部分副作用已被 tool 实时执行，此处只做收尾        │
│         └─ 关系更新 / 目标检查 / 冲突检测（保持不变）         │
│                                                             │
│  4. _finish_tick() → events 落库 → tick++                   │
│     └─ ✅ 对话历史保留，Agent 记住本 tick 发生了什么          │
│     └─ ✅ 每 N tick 触发 MemoryConsolidator 反思             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 18: Agent 内核复活

> **目标：** 让 Agent 拥有持续的"意识流"和真实的行动反馈。这是整个 State 4 的基石——Phase 19/20 全部依赖 Phase 18 的产出。
> **策略：** 从底层到上层——先改 `inject_context`（消除清空），再加 scratchpad（私有持久状态），最后让 tool 产生真实副作用。这个顺序保证了每一步都有可观测的行为变化。

### Step 77 — 消除 tick 上下文清空

> **目标：** Agent 的 system prompt 只在初始化时设置一次。每个 tick 的世界状态以 UserMessage 追加到消息历史末尾，不再覆盖 system prompt。对话历史自然累积，Agent 能"记住"本 session 中发生过什么。
> **关键指标：** 改完后，同一个 World 的第 5 个 tick 的 Agent 能引用第 1 个 tick 的对话内容，而不再"失忆"。

#### 当前行为（要消除的）

```python
# factory.py LifeAgent.inject_context — 当前实现
def inject_context(self, world_state: str, memories):
    new_msg = build_system_message(persona, background, goals, memories, world_state)
    self._agent._system_messages = [SystemMessage(content=new_msg)]  # ⚠️ 覆盖
    ctx._messages.clear()  # ⚠️ 清空所有对话历史
```

每次调用 `inject_context`：
1. 重新构建完整的 system prompt（人格+背景+目标+记忆+世界状态，~2000 token）
2. 覆盖 AutoGen 内部的 system message 列表
3. **清空** AutoGen 内部消息缓冲（包含之前所有 tick 的对话历史和 tool call 记录）

结果：Agent 的 LLM 上下文窗口里，只能看到当前 tick 的世界状态 + 本轮对话。它不知道上个 tick 发生了什么。

#### 目标行为

```python
# factory.py LifeAgent — 改造后
def __init__(self, ...):
    # system prompt 只在初始化时设置一次
    self._base_system_message = build_system_message(persona, background, goals)
    self._agent._system_messages = [SystemMessage(content=self._base_system_message)]
    self._context_count = 0  # 追踪追加的上下文消息数

def inject_context(self, world_state: str, memories):
    # 1. 构建 context user message（不含人格——人格已在 system prompt 中）
    context_msg = self._build_context_message(world_state, memories)
    # 2. 追加到消息历史末尾，而非覆盖 system prompt
    self._agent._model_context.add_message(
        UserMessage(content=context_msg, source="world")
    )
    self._context_count += 1
    # 3. 如果消息历史过长 → LLM 压缩
    if self._context_count >= self._COMPRESS_THRESHOLD:
        self._compress_history()

def _compress_history(self):
    """当消息历史超过阈值时，LLM 摘要前半部分"""
    messages = self._agent._model_context._messages
    half = len(messages) // 2
    old_messages = messages[:half]
    # LLM 摘要 old_messages → 一条压缩消息替换前半
    summary = self._summarize(old_messages)
    self._agent._model_context._messages = [
        SystemMessage(content=self._base_system_message),
        UserMessage(content=f"[上下文摘要] {summary}", source="system"),
        *messages[half:],
    ]
    self._context_count = len(messages) - half + 1
```

#### 设计：上下文消息结构

```
┌──────────────────────────────────────────────┐
│ SystemMessage                               │
│ ┌──────────────────────────────────────────┐│
│ │ 人格画像（200-400 字）                    ││
│ │ 核心价值观                               ││
│ │ 决策风格参数                             ││
│ │ 行为准则                                 ││
│ └──────────────────────────────────────────┘│
├──────────────────────────────────────────────┤
│ UserMessage (source="world", tick=0)        │
│ ┌──────────────────────────────────────────┐│
│ │ ⏰ 当前 tick: 0                          ││
│ │ 📍 位置: 图书馆                          ││
│ │ 👀 你看到: 小红在自习、小明在找书         ││
│ │ 🧠 相关记忆: ...                         ││
│ │ 📋 活跃目标: 期末考到 3.5 GPA            ││
│ └──────────────────────────────────────────┘│
├──────────────────────────────────────────────┤
│ UserMessage (source="agent_xxx", tick=0)    │  ← AutoGen 对话历史
│ "我觉得今天应该先复习高数..."                │     （不再清空！）
├──────────────────────────────────────────────┤
│ UserMessage (source="agent_yyy", tick=0)    │
│ "同意，不过线代也很紧急..."                  │
├──────────────────────────────────────────────┤
│ UserMessage (source="world", tick=1)        │  ← 下个 tick 的世界状态
│ ⏰ 当前 tick: 1 ...                         │     （追加，不覆盖）
└──────────────────────────────────────────────┘
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/agent_factory/factory.py` | **重写** | `LifeAgent.inject_context`：追加 UserMessage 替代覆盖 system prompt；新增 `_build_context_message`、`_compress_history`、`_summarize` 方法 |
| `backend/src/engines/persona/prompt_templates.py` | 修改 | `build_system_message` 拆分为两个函数：`build_system_message(persona, background, goals)` 只含人格（初始化用），`build_context_message(world_state, memories)` 只含世界状态（每 tick 追加用） |
| `backend/src/engines/world/engine.py` | 修改 | `_reset_agent_contexts` 不再清空消息缓冲——只标记 `_context_count = 0`；`_inject_world_context` 的调用逻辑不变（签名兼容） |
| `backend/src/engines/world/state.py` | 修改 | `_build_world_context` 和 `_build_agent_context` 输出格式适配新的 `build_context_message`——不再包含身份锁定协议（身份协议留在 system prompt 中不变） |
| `backend/src/engines/arena/engine.py` | 修改 | Arena 的 `inject_context` 调用适配新签名（Arena 场景短，不需要压缩） |
| `backend/src/engines/arena/battle_royale.py` | 修改 | 同上 |
| `backend/src/engines/bench/scheduler.py` | 修改 | Bench 的 `inject_context` 调用适配新签名 |
| `backend/tests/test_agent_factory.py` | 修改 | `test_inject_context_*` 测试用例重写：验证消息追加而非覆盖；新增 `test_context_compression`、`test_context_accumulation_across_ticks` |
| `backend/tests/test_prompt_templates.py` | 修改 | 新增 `test_build_context_message_*` 测试用例 |

**⚠️ `inject_context` 调用方全量（6 处，改签名后必须全部适配）：**

| 调用位置 | 文件 | 行号 | 场景 |
|---------|------|------|------|
| WorldEngine._inject_world_context | `engines/world/engine.py` | 123 | 每个 tick 注入（主路径） |
| ArenaEngine._run_duel_with_timeout | `engines/arena/engine.py` | 123, 126 | 竞技场 Agent A/B |
| BattleRoyaleRunner.run_debate | `engines/arena/battle_royale.py` | 130 | 大乱斗 |
| BatchScheduler._run_single_bench | `engines/bench/scheduler.py` | 180 | 批量评测 |

#### 验收标准

- [ ] 同一个 World 中，第 N+1 个 tick 的 Agent 消息能引用第 N 个 tick 的对话内容（手动验证：创建 World → 跑 5 tick → 检查第 5 tick 的 Agent 发言是否提及前几个 tick 的事件）
- [ ] `inject_context` 不再覆盖 `_system_messages`——通过 `test_inject_context_preserves_system_message` 断言 system prompt 内容在 5 次 inject 后不变
- [ ] 消息数超过 `_COMPRESS_THRESHOLD`（默认 20 条）时，自动触发压缩——压缩后消息数 < 原消息数
- [ ] 压缩后的对话摘要能保留关键信息（手动验证：压缩后 Agent 仍能正确回答"刚才谁说了什么"）
- [ ] 6 处 `inject_context` 调用全部适配新签名，无运行时错误
- [ ] 回归：后端全量 pytest 通过（含 Arena/Bench 相关测试）
- [ ] 回归：SSE stream 格式不变，前端无需修改

---

### Step 78 — Agent Scratchpad

> **目标：** 每个 Agent 持有一个私有的、跨 tick 持久化的笔记空间。Agent 可以用 `write_note` 记录观察/计划/想法，这些笔记在每个 tick 的上下文中自动可见。这为 Agent 提供了真正的"工作记忆"——不被 tick 清空影响。
> **依赖：** Step 77（上下文不再每 tick 清空，笔记追加到上下文尾部）

#### 设计

```
Agent 视角的笔记使用流程：

Tick 1: Agent 调用 write_note("小红今天没来图书馆——她可能在准备比赛")
        → 写入 self._notes[{tick:1, content:"..."}]
        → 下个 tick 的上下文自动包含 "📝 你的笔记: 小红今天没来图书馆..."

Tick 3: Agent 调用 read_notes()
        → 返回最近 5 条笔记
        → Agent 发现小红已经连续 3 tick 没出现在图书馆
        → Agent 调用 write_note("小红已连续缺席 3 tick——推测她在秘密备考")

Tick 5: Agent 的上下文自动包含最近笔记
        → Agent 基于笔记积累做出更明智的决策
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/agent_factory/tools.py` | 修改 | 新增 `write_note(content)` 和 `read_notes()` 两个 tool 函数 |
| `backend/src/engines/agent_factory/factory.py` | 修改 | `LifeAgent.__init__` 新增 `self._notes: list[dict] = []`；`inject_context` 的 `_build_context_message` 自动追加最近 5 条笔记 |
| `backend/src/models/agent.py` | 修改 | `AgentResponse` 新增 `notes: list[dict] = []` 字段 |
| `backend/src/models/agent_orm.py` | 修改 | `AgentRow` 新增 `notes_json TEXT` 列（存储 JSON 数组） |
| `backend/src/db.py` | 修改 | 增量迁移：`ALTER TABLE agents ADD COLUMN notes_json TEXT DEFAULT '[]'` |
| `backend/src/engines/world/state.py` | 修改 | `_build_world_context` 中不再需要手动拼接 note 相关信息（factory 层已处理） |
| `backend/tests/test_agent_tools.py` | 修改 | 新增 `test_write_note`、`test_read_notes`、`test_notes_persist_across_ticks` |
| `backend/tests/test_agent_factory.py` | 修改 | 新增 `test_inject_context_includes_notes` |

**Tool 签名：**

```python
async def write_note(content: str) -> str:
    """在私有笔记中记录一条信息。用于追踪观察、计划、想法。
    笔记会在后续 tick 的上下文中自动可见。
    Args:
        content: 笔记内容（建议 20-200 字）
    Returns:
        确认消息，含当前笔记总数
    """

async def read_notes(limit: int = 5) -> str:
    """读取最近的私有笔记。
    Args:
        limit: 返回最近 N 条（默认 5）
    Returns:
        格式化的笔记列表（tick + 内容）
    """
```

**注意：** `write_note` 和 `read_notes` 需要访问 `LifeAgent` 实例（读写 `self._notes`）。因此它们不能是模块级函数——必须以 closure 形式创建，捕获 agent 引用。这与 Step 79 的 tool 闭包改造使用同一机制。

#### 验收标准

- [ ] Agent 调用 `write_note("测试笔记")` → tool 返回值包含确认信息 + 笔记总数
- [ ] `read_notes()` 返回最近 N 条笔记，按 tick 倒序排列
- [ ] 下个 tick 的上下文自动包含最近 5 条笔记（格式：`📝 你的笔记:\n- [Tick 1] 测试笔记`）
- [ ] Agent 笔记持久化到 SQLite——World 重启后笔记不丢失
- [ ] 笔记数量上限为 100 条/agent，超出时自动删除最旧的
- [ ] `DEFAULT_AGENT_TOOLS` 新增 `write_note` 和 `read_notes`（从 4 个 tool 变为 6 个）
- [ ] 回归：现有测试全部通过（新增 tool 不影响已有 tool 的行为）

---

### Step 79 — 工具真实化

> **目标：** Agent 的每个 tool 调用都产生真实的、可观测的副作用。Agent 看到的不再是占位字符串，而是自己行动的真实结果。这是整个 State 4 的**核心改造**——做完这一步，Agent 才真正"活在"世界里。
> **依赖：** Step 77（上下文连续）+ Step 78（scratchpad 机制——tool 闭包模式在此步完整实现）

#### 设计：Tool 闭包模式

当前 tool 是模块级 `async def` 函数——无法访问 WorldEngine 实例。改造后，tool 在 `WorldEngine.__init__` 中以 closure 形式创建，捕获 `self`（WorldEngine）引用：

```python
# tools.py — 改造后（概念代码）
def make_agent_tools(engine: "WorldEngine", agent_id: str) -> list:
    """为指定 Agent 创建 tool 闭包集合。每个 tool 通过 closure 访问 WorldEngine。"""

    async def send_message(target_name: str, content: str, tone: str = "neutral") -> str:
        """向另一个 Agent 发送消息。对方将在本 tick 内收到并可以立即回复。"""
        target = engine._find_agent_by_name(target_name)
        if target is None:
            return f"❌ 找不到名为 {target_name} 的人。请检查名字是否正确。"
        # 真实投递：将消息推入目标 agent 的 pending 队列
        engine._pending_messages.append({
            "from": agent_id,
            "to": target.id,
            "content": content,
            "tone": tone,
            "tick": engine.current_tick,
        })
        # 触发目标 agent 的即时响应（如果当前在 GroupChat 中）
        engine._notify_incoming_message(target.id, agent_id, content)
        return f"✅ 消息已发送给 {target_name}。对方将在本回合内看到。"

    async def set_goal(description: str, priority: int = 1) -> str:
        """设定一个新目标。目标会出现在你的活跃目标列表中。"""
        agent = engine.agents[agent_id]
        new_goal = {"id": str(uuid.uuid4()), "description": description,
                     "priority": priority, "status": "active",
                     "created_tick": engine.current_tick}
        agent.goals.append(new_goal)  # 真实写入 agent.goals
        engine._goal_check_pending = True  # 标记需要 LLM 检查
        return f"✅ 新目标已设定（优先级 {priority}）：{description}"

    async def observe(target: str) -> str:
        """观察某人或某物，获取当前公开状态。"""
        target_agent = engine._find_agent_by_name(target)
        if target_agent:
            state = engine._get_agent_public_state(target_agent.id)
            return f"🔍 {target} 的当前状态：\n{state}"
        return f"🔍 你观察了 {target}。{engine._describe_environment(target)}"

    async def think_aloud(thought: str) -> str:
        """记录内心独白。其他 Agent 看不到。"""
        engine._record_thought(agent_id, thought)
        return f"🤔 思考已记录。"

    return [send_message, think_aloud, set_goal, observe]
```

#### 每 tool 的真实副作用对照

| Tool | 改造前（stub） | 改造后（真实副作用） |
|------|---------------|---------------------|
| `send_message` | `return "消息已发送给 {target}"` | 推入 `_pending_messages` 队列 → 触发目标 agent 即时响应 → 目标可在同一 tick 内回复 |
| `think_aloud` | `return "思考已记录: {thought}"` | 写入 `engine._thought_log[agent_id]` → SSE 推 thought_stream 事件 → 前端思维流实时展示 |
| `set_goal` | `return "新目标已设定: {desc}"` | 追加到 `agent.goals` 列表 → 标记 `_goal_check_pending=True` → 触发 LLM 目标完成度检查 |
| `observe` | `return "正在观察: {target}"` | 读取目标 agent 的公开状态（情绪/位置/最近行为）→ 返回结构化描述 |
| `write_note` | （新增于 Step 78） | 写入 `agent._notes` → 持久化到 SQLite |
| `read_notes` | （新增于 Step 78） | 从 `agent._notes` 读取 → 格式化返回 |
| `submit_deliverable` | （Team 专用） | 写入 `PlanManager.current_step.result` → 广播 `plan_updated` SSE 事件 |
| `finish_task` | （Team 专用） | 标记 `PlanManager.all_done=True` → 触发报告生成 |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/agent_factory/tools.py` | **重写** | 删除模块级 tool 函数；改为 `make_agent_tools(engine, agent_id) → list` 和 `make_team_tools(engine, agent_id) → list` 工厂函数；每个 tool 是 closure，捕获 engine 和 agent_id |
| `backend/src/engines/agent_factory/factory.py` | **重写** | `LifeAgent.__init__` 不再接受静态 `tools` 参数——tool 由 WorldEngine 在运行时分发；`replace_tools` 改为接受 tool factory 而非 tool list |
| `backend/src/engines/world/engine.py` | **重写** | `__init__` 中为每个 agent 调用 `make_agent_tools(self, agent.id)`；新增 `_pending_messages`、`_thought_log`、`_find_agent_by_name`、`_get_agent_public_state`、`_describe_environment`、`_record_thought`、`_notify_incoming_message` 方法 |
| `backend/src/engines/world/messages.py` | 修改 | `_build_action_description` 适配新的 tool 名称；`_tool_call_to_event` 解析 title 不再依赖 description 字符串——直接读 `arguments` |
| `backend/src/engines/world/state.py` | 修改 | `_apply_action` 中的 `_handle_send_message`、`_handle_set_goal` 等改为**验证** tool 已产生的副作用，而非创建副作用——副作用已在 tool 函数中实时产生 |
| `backend/src/engines/world/streaming.py` | 修改 | `_stream_group_tick` 中，收到 `send_message` tool call 后，立即将目标 agent 的回复插入当前流 |
| `backend/src/api/teams.py` | 修改 | `execute_team` 中 `agent.replace_tools(TEAM_AGENT_TOOLS)` 改为 `agent.replace_tools(make_team_tools(engine, agent.id))` |
| `backend/src/engines/team/engine.py` | 修改 | 不再通过 `replace_tools` 静态切换 tool set——改为 TeamEngine.execute 时传入 team context |
| `backend/tests/test_agent_tools.py` | **重写** | 所有 tool 测试改为集成测试（需要 WorldEngine fixture）——因为 tool 现在是 closure |
| `backend/tests/test_agent_factory.py` | 修改 | `LifeAgent.__init__` 测试适配新签名 |
| `backend/tests/test_world_engine_runtime.py` | 修改 | 新增 tool 副作用验证测试 |

**⚠️ 最关键的架构决策：tool 闭包的生命周期**

```
WorldEngine.__init__
  └─ for agent in agents:
       tools = make_agent_tools(self, agent.id)   ← 捕获 engine 引用
       agent.autogen_agent._tools = tools          ← 注入 AutoGen Agent

每个 tick:
  └─ GroupChat.run_stream()
       └─ Agent LLM 调用 tool
            └─ tool 函数内: engine._pending_messages.append(...)  ← 操作真实的 WorldEngine 实例
            └─ tool 返回值 → AutoGen 将其作为 tool result 传给 Agent → Agent 看到真实反馈

WorldEngine 销毁:
  └─ tool 闭包随 engine 一起被 GC
```

**⚠️ 风险：** tool 闭包捕获 `engine` 引用后，如果 tool 在 engine 销毁后仍被调用（如 Arena 的 cleanup），会访问已释放的资源。解决方案：tool 函数内增加 `if engine._destroyed: return "⚠️ 世界已结束"` 守卫。

#### 验收标准

- [ ] Agent A 调用 `send_message("小红", "周末一起复习")` → tool 返回包含 ✅ 的确认 → 小红在同一 tick 内的下一次发言中引用了这条消息
- [ ] Agent 调用 `set_goal("考到 3.5 GPA", priority=1)` → `agent.goals` 列表新增一条记录 → `_goal_check_pending` 变为 True → 下个 goal check 周期检测到新目标
- [ ] Agent 调用 `observe("小红")` → 返回小红的当前情绪、位置、最近行为（不含隐私信息）
- [ ] Agent 调用 `think_aloud("我觉得小红在躲我")` → 前端思维流中出现 `thought_stream` 事件
- [ ] `send_message` 指向不存在的 agent → tool 返回 `❌ 找不到名为 XXX 的人`（而非占位成功消息）
- [ ] 同一个 tool 在一个 tick 内被同一 Agent 多次调用 → 每次都产生真实副作用（不覆盖、不静默）
- [ ] 回归：`DEFAULT_AGENT_TOOLS` 和 `TEAM_AGENT_TOOLS` 的引用处全部适配新的 factory 模式
- [ ] 回归：M2 单人剧场/M3 群体沙盒/M4 竞技场/M9 Team 全部正常运行

---

### Step T7 — Phase 18 测试

> **目标：** Step 77–79 的全部自动化测试 + 跨模块回归。Phase 18 改动了 Agent 系统的最底层（LifeAgent / Tool / WorldEngine._inject_world_context），必须确保所有依赖这些底层的模块不被破坏。

#### 测试清单

**Layer 1：单元/集成测试（新增/重写）**

| 被测模块 | 测试文件 | 覆盖内容 |
|---------|---------|---------|
| `factory.py` inject_context | `tests/test_agent_factory.py` | 消息追加而非覆盖、system prompt 保持、压缩触发/结果、notes 自动注入 |
| `prompt_templates.py` | `tests/test_prompt_templates.py` | `build_context_message` 新函数、`build_system_message` 不包含世界状态 |
| `tools.py` (重写后) | `tests/test_agent_tools.py` | 每个 tool 的真实副作用、闭包正确性、边界情况（目标不存在/重复操作/engine 销毁） |
| `world/engine.py` | `tests/test_world_engine_runtime.py` | `_pending_messages` 生命周期、`_find_agent_by_name`、`_get_agent_public_state` |

**Layer 2：跨模块集成测试**

| 被测链路 | 测试文件 | 覆盖内容 |
|---------|---------|---------|
| inject_context → GroupChat | `tests/test_group_chat_termination.py` | 上下文累积后 Agent 能引用历史对话 |
| tool 副作用 → SSE 流 | `tests/test_sse.py` | send_message 触发即时回复、thought_stream 事件到达前端 |
| Team 模式 tool 切换 | `tests/test_team_engine.py` | TEAM_AGENT_TOOLS factory 模式正确、submit_deliverable 链接 PlanManager |

**Layer 3：E2E 全链路**

| 用例 | 步骤 | 验证点 |
|------|------|--------|
| `test_agent_memory_across_ticks` | ① 创建 2 Agent → ② 启动群体沙盒 → ③ 手动在 tick 1 让 Agent A 说"我喜欢猫" → ④ 跑到 tick 5 → ⑤ 检查 Agent B 的发言是否可能引用"猫" | Agent B 在第 5 tick 的发言中提及猫（说明对话历史被保留） |
| `test_tool_real_side_effects` | ① 创建 Agent → ② 启动单人剧场 → ③ 观察 think_aloud 事件出现在思维流 → ④ 观察 set_goal 后目标列表更新 | tool 调用产生可见的 SSE 事件 |
| `test_notes_survive_restart` | ① 创建 Agent → ② 启动模拟 → ③ Agent 写笔记 → ④ 停止模拟 → ⑤ 重启同一 World → ⑥ 检查 Agent 上下文包含之前的笔记 | 笔记从 SQLite 恢复 |

**Layer 4：全量回归**

| 命令 | 通过标准 |
|------|---------|
| `cd backend && PYTHONPATH=src python -m pytest tests/ -v` | 全量通过（360+ → 不减少） |
| `cd frontend && npx vitest run` | 全量通过（263+ → 不减少） |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_agent_factory.py` | 重写 | 适配 inject_context 新行为 |
| `backend/tests/test_agent_tools.py` | 重写 | 适配 tool 闭包模式 |
| `backend/tests/test_prompt_templates.py` | 修改 | 新增 context message 测试 |
| `backend/tests/test_world_engine_runtime.py` | 修改 | 新增 tool 副作用测试 |
| `backend/tests/test_e2e_agent_memory.py` | **新建** | 跨 tick 记忆保留 E2E |
| `backend/tests/test_e2e_tool_effects.py` | **新建** | tool 副作用全链路 |

#### 验收标准

- [ ] 新增/重写的 4 个后端测试文件全部通过（Mock LLM）
- [ ] 2 个 E2E 测试全部通过（真实 LLM API）
- [ ] 全量回归：后端 ≥360 passed、前端 ≥263 passed
- [ ] M2 单人剧场手工验证：跑 5 tick，第 5 tick 的思维流提及第 1 tick 的事件
- [ ] M3 群体沙盒手工验证：Agent A 调用 send_message 后，Agent B 立即回复
- [ ] M9 Team 手工验证：任务执行正常、deliverable 提交正常

---

## Phase 19: Agent 能力扩展

> **目标：** 在 Phase 18 的"活着的 Agent"基础上，增加两件事——① Team 模式支持动态重规划（Agent 能主动调整计划）；② M11 场景精灵由后端 WorldEngine 驱动（不再脱节）。
> **策略：** 两条线可以并行推进——Step 80 是纯后端（planning 引擎改造），Step 81 是前后端联合（场景-Brain 桥接）。但 Step 80 更快（8h），建议先做。

### Step 80 — 动态重规划

> **目标：** Team 模式下，Agent 发现某个子任务不可行或需要调整时，能主动调用 `revise_plan` tool 修改计划。PlanManager 收到后更新步骤依赖图、广播 `plan_revised` SSE 事件，其他 Agent 实时感知计划变更。
> **依赖：** Step 79（tool 真实化——revise_plan tool 需要访问 PlanManager 实例）

#### 设计

```
当前（静态 checklist）：
  TaskDecomposer 分解 5 步 → PlanManager 按序执行 → 每 tick check_progress
  ⚠️ Agent 不能修改计划——即使发现某步不切实际，只能硬着头皮做

改造后（动态重规划）：
  Agent 调用 revise_plan("竞品分析", "改为快速竞品扫描", "现有方案需要登录 10 个 App 太耗时")
    → PlanManager.revise_plan(step_index, new_title, reason)
      → 更新 step.title 和 step.reason
      → 广播 plan_revised SSE 事件 → 前端看板实时更新
      → 通知 PM agent："计划已调整，请确认新方向"
```

#### 前端看板联动

```
┌─────────────────────────────────────────────────────┐
│  📋 任务看板                                         │
│                                                     │
│  DOING                                              │
│  ├ 竞品分析  👤 小明  ████ 40%                      │
│  │  ⚠️ 小明建议修改：改为快速竞品扫描                 │
│  │     原因：现有方案需要登录 10 个 App 太耗时        │
│  │     [✓ 接受修改] [✗ 坚持原计划]                   │
│  │                                                 │
│  TODO                                               │
│  ├ 功能设计 PRD  👤 小刚  ⬜ 0%                      │
│  │  （等待竞品分析完成后开始）                        │
│  └ ...                                             │
└─────────────────────────────────────────────────────┘
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/team/planner.py` | 修改 | `PlanManager` 新增 `revise_plan(step_index, new_title, reason)`、`insert_step(after_index, title, assignee)`、`mark_blocked(step_index, reason)` 方法；`check_progress` 中增加"当前步骤连续 N tick 无进展 → 建议重规划"的逻辑 |
| `backend/src/engines/agent_factory/tools.py` | 修改 | 新增 `revise_plan(step_title, new_title, reason)` tool——仅在 TEAM_AGENT_TOOLS 中可用；tool 闭包捕获 plan_manager 引用 |
| `backend/src/engines/team/decomposer.py` | 修改 | `decompose_task` 返回的 steps 增加 `dependencies: list[int]` 字段（步骤间依赖关系）；新增 `re_decompose(remaining_steps, reason)` 函数——某步失败后 LLM 重新分解剩余工作 |
| `backend/src/engines/team/engine.py` | 修改 | `TeamEngine.on_tick` 中，plan 变更后调用 `_sync_plan_to_db` 持久化 |
| `backend/src/api/sse.py` | 修改 | SSE generator 中新增 `plan_revised` 事件类型（与 `plan_updated` 平行） |
| `frontend/src/pages/team/TaskKanban.tsx` | 修改 | 监听 `plan_revised` SSE 事件 → 卡片显示修改建议 → 用户可批准/拒绝（PoC 阶段：自动批准 + 通知；P1 阶段：交互式批准） |
| `frontend/src/types/team.ts` | 修改 | `PlanStep` 新增 `dependencies: number[]`、`revision_history: {tick, reason, old_title, new_title}[]` |
| `backend/tests/test_team_planner.py` | 修改 | 新增 `test_revise_plan`、`test_insert_step`、`test_mark_blocked`、`test_auto_suggest_revision` |
| `backend/tests/test_team_engine.py` | 修改 | 新增 `test_plan_revised_event_emitted` |

#### 验收标准

- [ ] Agent 在 Team 任务中调用 `revise_plan("竞品分析", "快速竞品扫描", "原方案太耗时")` → PlanManager 更新步骤 → `plan_revised` SSE 事件发射
- [ ] 前端看板收到 `plan_revised` 后，对应卡片显示修改建议标记
- [ ] `PlanManager` 检测到同一 step 连续 8 tick 无 deliverable → 自动发射 `coordinator_nudge` 建议重规划
- [ ] `re_decompose` 对剩余步骤重新分解后，新步骤的 dependencies 正确指向已完成步骤
- [ ] 修改历史记录在 `step.revision_history` 中完整保留
- [ ] 回归：Team 全链路测试通过（创建 Team → 执行 → 计划变更 → 报告）

---

### Step 81 — M11 场景-Brain 联动

> **目标：** 让 M11 的游戏场景 Agent 不再是"会动的 emoji"，而是由后端 WorldEngine 驱动的真实 Agent。场景中的对话走 GroupChat SSE（不再走独立 LLM 调用），Agent 的移动由 tool call 驱动（不再由前端 AutonomousMover 随机决定），情绪状态从 WorldEngine 的 agent 心智模型同步（不再由前端 EmotionEngine 独立计算）。
> **依赖：** Step 79（工具真实化——move_to / interact_with tool）

#### 设计：改造前后对比

```
改造前（场景与大脑脱节）：
┌──────────────────────┐     ┌──────────────────────┐
│ 前端 MapScene.ts      │     │ 后端 SceneEngine      │
│                      │     │                      │
│ AutonomousMover      │     │ SceneEngine 内存 dict │
│  → 随机选目标 tile    │     │  → AgentSpriteData   │
│  → 本地 tween 移动    │     │  → 仅供 GET state    │
│                      │     │                      │
│ EmotionEngine        │     │ generate_dialogue_llm │
│  → 关键词正则匹配     │     │  → 独立 LLM 调用      │
│  → 5 链情绪计算      │     │  → 不走 GroupChat     │
│                      │     │                      │
│ dialogue.ts          │     │                      │
│  → mock 池随机取      │     │                      │
│  → 独立 fetchDialogue │     │                      │
└──────────────────────┘     └──────────────────────┘
        ↑ 完全没有数据流 ↑

改造后（场景是 WorldEngine 的可视化前端）：
┌──────────────────────┐     ┌──────────────────────────────┐
│ 前端 MapScene.ts      │     │ 后端 WorldEngine + SceneEngine│
│                      │     │                              │
│ AgentSprite          │←SSE─│ WorldEngine.tick_stream()    │
│  → 位置/动作/情绪     │     │  → move_to tool → 位置更新    │
│  由 SSE 事件驱动      │     │  → 对话走 GroupChat SSE       │
│                      │     │  → 情绪来自 agent.emotion     │
│ AutonomousMover      │     │                              │
│  → 退化为 tween 动画器 │     │ SceneEngine                  │
│  → 目标由 SSE 指定    │     │  → 场景物品状态管理           │
│                      │     │  → 快照/存档                  │
│ EmotionEngine        │     │  → 随机事件触发器             │
│  → 保留前端情绪渲染   │     │  → 桥接 WorldEngine           │
│  → 数据源切换为 SSE   │     │                              │
│                      │     │                              │
│ dialogue.ts          │     │                              │
│  → 降级为 SSE 断线   │     │                              │
│  时的 fallback mock  │     │                              │
└──────────────────────┘     └──────────────────────────────┘
```

#### 数据流：一个场景 tick 的完整路径

```
1. WorldEngine.tick_stream() 开始
     ↓
2. _inject_world_context()
   → 每个 Agent 收到场景上下文："你现在在图书馆，周围有小红、小刚..."
     ↓
3. Agent A 的 LLM 决策: "我想走过去跟小红说话"
   → 调用 move_to(tile_x=4, tile_y=3)
   → tool 更新 agent.position → SSE 推 move_to 事件
     ↓
4. 前端 MapScene 收到 move_to SSE 事件
   → AutonomousMover.tweenTo(4, 3) → 精灵平滑移动
     ↓
5. Agent A 到达后调用 send_message("小红", "你在看什么书?")
   → GroupChat 正常流转 → SSE 推 agent_message 事件
     ↓
6. 前端收到 agent_message → 显示对话气泡
   → 同时触发 EmotionEngine.onDialogue → 情绪微调（前端表现层）
     ↓
7. tick 结束 → SceneEngine 保存快照 → 下一个 tick
```

#### 涉及文件

**后端：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/agent_factory/tools.py` | 修改 | 新增 `move_to(tile_x, tile_y)` 和 `interact_with(item_id)` tool——场景专用 |
| `backend/src/engines/world/messages.py` | 修改 | `_build_action_description` 新增 move_to/interact_with 的 description |
| `backend/src/engines/scene/engine.py` | **重写** | 删除 `generate_dialogue_llm()`（对话走 GroupChat）；删除独立 LLM 调用；保留场景状态管理+快照+随机事件；新增 `SceneBridge` 类——将 SceneEngine 挂载到 WorldEngine |
| `backend/src/api/scenes.py` | 修改 | `POST /scenes/{id}/interact` 不再调用独立 LLM——改为转发到 WorldEngine；新增 `POST /scenes/{id}/start` 端点——创建 WorldEngine 并启动场景模拟 |
| `backend/src/api/sse.py` | 修改 | 场景 SSE 复用现有 SSE 端点——`/api/worlds/{world_id}/stream`，增加 `move_to` 和 `interact_with` 事件类型的序列化 |

**前端：**

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/game/scenes/MapScene.ts` | **重写** | 对话数据源从 `dialogue.ts` 切换为 SSE EventSource；移动从 `AutonomousMover` 本地决策切换为 SSE `move_to` 事件驱动；Agent 状态同步从 `syncAgentsInPlace` 切换为 SSE 事件流 |
| `frontend/src/game/dialogue.ts` | 降级 | 保留 mock 池作为 SSE 断线时的 fallback；删除 `fetchDialogue`（不再独立调 LLM API） |
| `frontend/src/game/AutonomousMover.ts` | 重写 | 删除移动决策逻辑（不再随机选目标）；改为纯 tween 执行器——接收 `{tileX, tileY}` 目标 → 计算路径 → tween 到目标 |
| `frontend/src/game/emotion/EmotionEngine.ts` | 修改 | 情绪计算的数据源从本地关键词匹配切换为 SSE `emotion_update` 事件；`onDialogue` 和 `onProximityCheck` 保留但改为从 SSE 事件触发 |
| `frontend/src/game/sprites/AgentSprite.ts` | 修改 | `setEmotion` 不变；新增 `moveTo(tileX, tileY)` 方法——触发 walk tween |
| `frontend/src/pages/GameScene.tsx` | 修改 | 新增 SSE 连接管理（复用 `useSSE` hook）；场景启动时创建 World + 连接 SSE；场景切换时断开 SSE + 停止 World |
| `frontend/src/api/scenes.ts` | 修改 | 新增 `useStartScene` mutation（`POST /api/scenes/{id}/start`）；`useSceneState` 改为从 SSE 事件派生而非轮询 |

#### 验收标准

- [ ] 场景启动后，Agent 精灵不再随机漫游——移动由 SSE `move_to` 事件驱动
- [ ] 两个 Agent 相邻时的对话气泡内容来自 WorldEngine GroupChat（而非 mock 池随机）
- [ ] Agent 的情绪状态由后端 `agent.emotional_state` 通过 SSE 同步到前端精灵
- [ ] 断开 SSE 连接后，对话回退到 mock 池（降级策略生效）
- [ ] 用户拖拽 Agent 到新位置 → `POST /scenes/{id}/interact` → 写入 WorldEngine → SSE 广播给所有客户端
- [ ] 6 个场景（library/dorm/classroom/art/lab/sakura）全部能启动 + Agent 自主移动 + 对话
- [ ] 回归：M1–M10 全部模块不受影响（场景 World 的 `world_type` 新增 `"scene"`，隔离于 solo/group/team）
- [ ] 前端性能：5 Agent 同屏 + SSE 驱动 → 帧率 ≥ 30fps

---

### Step T8 — Phase 19 测试

> **目标：** Step 80–81 的全部自动化测试 + 场景全链路 E2E + 跨 Phase 回归。

#### 测试清单

**Layer 1：后端单元/集成测试**

| 被测模块 | 测试文件 | 覆盖内容 |
|---------|---------|---------|
| `planner.py` 重规划 | `tests/test_team_planner.py` | revise/insert/block 方法、自动建议触发、依赖图更新 |
| `decomposer.py` re_decompose | 追加到同上 | 重新分解后步骤数量、dependencies 正确性 |
| `scene/engine.py` SceneBridge | `backend/tests/test_scene_engine.py` | WorldEngine 挂载/卸载、快照一致性、随机事件注入 |
| Scene SSE 事件 | `tests/test_sse.py` | move_to/interact_with/emotion_update 事件格式 |

**Layer 2：前端组件测试**

| 被测组件 | 测试文件 | 覆盖交互 |
|---------|---------|---------|
| `TaskKanban.tsx` | 追加到现有测试 | plan_revised 事件渲染、修改建议卡片 |
| `MapScene.ts` (重写后) | `frontend/src/game/scenes/__tests__/` | SSE 事件驱动精灵移动、对话气泡源自 SSE、降级到 mock |
| `AutonomousMover.ts` (重写后) | 同上 | tweenTo 正确执行、路径计算 |

**Layer 3：E2E 全链路**

| 用例 | 步骤 | 验证点 |
|------|------|--------|
| `test_scene_full_chain` | ① 创建 3 Agent → ② 启动 library 场景 → ③ 等待 5 tick → ④ 观察 Agent 位置变化 → ⑤ 观察对话气泡出现 | SSE 驱动移动+对话、Agent 位置变更有 tool call 记录、对话内容与人格一致 |
| `test_team_replan_chain` | ① 创建 Team → ② 执行任务 → ③ 等待第一个 plan_revised 事件 → ④ 验证前端看板更新 | revise_plan 触发、plan_revised SSE 到达前端、看板卡片更新 |

**Layer 4：全量回归**

| 命令 | 通过标准 |
|------|---------|
| `pytest tests/ -v` | 全量通过 |
| `npx vitest run` | 全量通过 |

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/tests/test_scene_bridge.py` | **新建** | SceneBridge 单元测试 |
| `backend/tests/test_e2e_scene.py` | **新建** | 场景全链路 E2E |
| `frontend/src/game/scenes/__tests__/MapScene.test.ts` | **新建** | 场景 SSE 驱动测试 |
| `frontend/src/game/__tests__/AutonomousMover.test.ts` | **新建** | Tween 执行器测试 |

#### 验收标准

- [ ] 新增 4 个测试文件全部通过
- [ ] E2E 场景全链路通过（真实 LLM）
- [ ] 全量回归：后端 ≥ 原数量、前端 ≥ 原数量
- [ ] 场景 5 Agent 连续运行 30 tick 无崩溃、无 SSE 断连
- [ ] Team 重规划手工验证：Agent 主动修改计划 → 前端看板立刻显示变更

---

## Phase 20: Agent 成长与深度

> **目标：** 让 Agent 不仅能活在当下（Phase 18）、能做事（Phase 19），还能从经历中学习、展现可观测的"成长"。这是最能体现学术深度和竞赛亮点的部分。
> **策略：** Step 82 做记忆固化（内部成长机制），Step 83 做行为指纹（外部可观测的成长证据）+ Web 搜索（连接真实世界）。

### Step 82 — 情景记忆固化

> **目标：** 每个 World/episode 结束后，LLM 反思 Agent 的关键经历 → 提取教训 → 写入 memories 表（type="lesson"）→ 下次相似场景自动召回。Agent 能表现出"上次我学会了..."的行为。
> **依赖：** Step 79（tool 真实化——记忆固化触发时机在 World 结束时，需要 WorldEngine 的 finish hook）

#### 设计

```
Episode 结束时的记忆固化流程：

1. WorldEngine.run() 结束 或 World.status → "finished"
     ↓
2. MemoryConsolidator.consolidate(agent_id, events, tick_range)
     ↓
3. LLM 反思 prompt:
   "以下是你在过去 {N} 个 tick 中的关键经历：
    {event_summary}
   
   请反思：
   1. 你学到了什么？（最多 3 条教训）
   2. 你做对了什么？（最多 2 条成功经验）
   3. 你犯了什么错误？（最多 2 条教训）
   4. 下次遇到类似情况，你会怎么做？"
     ↓
4. LLM 返回结构化 JSON → 提取 2-5 条记忆
     ↓
5. 每条记忆写入 memories 表：
   {agent_id, type: "lesson", content: "...", importance: 0.7-0.9, keywords: [...]}
     ↓
6. 发射 memory_consolidated SSE 事件 → 前端可展示"Agent 学到了什么"
     ↓
7. 下一个 World 中，如果场景相似 → MemoryRetriever.retrieve 会召回这些 lesson
   → Agent 的上下文中出现 "🧠 过往教训: 上次在图书馆，你学会了提前占座..."
```

#### MemoryRetriever 改造

当前检索：纯关键词匹配 → 返回所有匹配的记忆，不区分类型。

改造后：
```python
class MemoryRetriever:
    async def retrieve(self, agent_id, context, top_k=5,
                       types=None):  # 新增 types 过滤
        """types: ["episodic", "semantic", "lesson"] 或 None=全部"""
        ...
        # lesson 类型记忆优先展示（importance 更高）
        lessons = [m for m in all_matches if m.type == "lesson"]
        others = [m for m in all_matches if m.type != "lesson"]
        return lessons[:3] + others[:top_k - len(lessons[:3])]
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/agent_factory/memory.py` | **重写** | 新增 `MemoryConsolidator` 类（consolidate 方法 + LLM 反思 prompt）；`MemoryRetriever.retrieve` 增加 `types` 参数 + lesson 优先排序 |
| `backend/src/engines/world/engine.py` | 修改 | `run()` 结束后触发 `MemoryConsolidator.consolidate`；`_finish_tick` 可选：每 N tick 做一次增量固化 |
| `backend/src/models/memory.py` | 修改 | `MemoryResponse` 新增 `memory_type` 字段（默认 "episodic"，可选 "lesson"/"reflection"/"skill"）；`Memory` ORM 新增 `memory_type` 列 |
| `backend/src/db.py` | 修改 | 增量迁移：`ALTER TABLE memories ADD COLUMN memory_type TEXT DEFAULT 'episodic'` |
| `backend/src/engines/persona/prompt_templates.py` | 修改 | `build_context_message` 中，记忆注入时优先展示 lesson 类型记忆 |
| `backend/src/api/sse.py` | 修改 | 新增 `memory_consolidated` SSE 事件类型 |
| `backend/tests/test_memory_retriever.py` | 修改 | 新增 `test_retrieve_filters_by_type`、`test_lesson_priority`、`test_consolidate_from_events` |
| `backend/tests/test_memory_consolidator.py` | **新建** | MemoryConsolidator 单元测试（Mock LLM） |

#### 验收标准

- [ ] World 结束时，`MemoryConsolidator.consolidate` 被调用 → 每个 Agent 生成 2-5 条 lesson 记忆
- [ ] lesson 记忆的 `importance` 自动设为 0.7-0.9（高于普通 episodic 记忆的 0.3-0.5）
- [ ] 下一个 World 中，如果场景相似 → `MemoryRetriever.retrieve` 返回的 lesson 记忆排在前面
- [ ] Agent 的上下文中出现 "🧠 过往教训: ..." → Agent 的行为受其影响（手动验证：Agent 不会重复同样的错误）
- [ ] `memory_consolidated` SSE 事件被前端接收（前端可选择性展示，非强制）
- [ ] 增量固化：每 10 tick 自动触发一次轻量反思（仅生成 1-2 条笔记，不阻塞 tick 流程）
- [ ] 回归：MemoryRetriever 的原有测试全部通过（types=None 的默认行为不变）

---

### Step 83 — 行为指纹 + Web 搜索

> **目标：** 两部分——① 在 Agent 运行过程中采集决策数据（每个 tick 的 tool 选择、对话风格、情绪变化），构建"行为指纹"并可视化；② 新增 `web_search` tool，让 Agent 能查询真实世界信息。
> **依赖：** Step 82（记忆固化——指纹数据是记忆的另一种形式）；Step 79（tool 真实化——web_search 使用同一闭包模式）

#### 设计：行为指纹数据模型

```python
# 每 tick 采集一条 BehaviorTrace
@dataclass
class BehaviorTrace:
    agent_id: str
    tick: int
    world_id: str
    tools_called: list[str]          # ["think_aloud", "send_message"]
    message_count: int               # 本 tick 发言次数
    message_avg_length: int          # 平均消息长度
    emotion_start: str               # tick 开始时的情绪
    emotion_end: str                 # tick 结束时的情绪
    targets_interacted: list[str]    # 互动对象
    goal_progress_pct: float         # 目标完成度

# 跨 tick 聚合 → 行为指纹
@dataclass
class BehaviorFingerprint:
    agent_id: str
    total_ticks: int
    tool_distribution: dict[str, int]     # {"think_aloud": 45, "send_message": 12, ...}
    emotion_trajectory: list[str]         # ["neutral", "anxious", "anxious", "happy", ...]
    social_network: dict[str, int]        # {"小红": 8, "小刚": 3}  互动次数
    decision_pattern: str                 # LLM 总结: "倾向于先观察再行动，在压力下变得更社交"
    consistency_score: float              # 行为与人格基线的一致性 (0-1)
```

#### 前端：偏好路径可视化

```
┌─────────────────────────────────────────────┐
│  🧬 行为指纹 · 小林 (INTJ)                    │
│                                             │
│  决策偏好路径:                                │
│  ┌─────────────────────────────────────┐    │
│  │ observe ──→ think_aloud ──→ 决策    │ 45%│
│  │ think_aloud ──→ send_message        │ 30%│
│  │ set_goal ──→ observe ──→ 决策      │ 15%│
│  │ send_message (冲动)                  │ 10%│
│  └─────────────────────────────────────┘    │
│                                             │
│  LLM 总结: 小林是典型观察者——75% 的情况下    │
│  先观察再行动。但在与小红互动时变得更主动。    │
│                                             │
│  ⚠️ 偏离预警: tick 12-15 行为偏离 INTJ 基线  │
│  （情绪从 neutral 跳变到 anxious）            │
└─────────────────────────────────────────────┘
```

#### web_search tool 设计

```python
async def web_search(query: str) -> str:
    """搜索互联网获取信息。用于查资料、验证假设、获取外部知识。
    Args:
        query: 搜索关键词
    Returns:
        前 3 条搜索结果的标题+摘要
    """
    # P0: 使用免费搜索 API（DuckDuckGo Instant Answer / SerpAPI free tier）
    # 缓存: 同一 query 在 5 分钟内不重复请求
    results = await _search_provider.search(query, max_results=3)
    return _format_search_results(results)
```

#### 涉及文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/agent_factory/fingerprint.py` | **新建** | `BehaviorTrace` + `BehaviorFingerprint` 数据类；`FingerprintCollector` 每 tick 采集；`FingerprintAnalyzer` LLM 总结决策模式 |
| `backend/src/engines/world/engine.py` | 修改 | 每 tick 结束时调用 `FingerprintCollector.collect`；World 结束时调用 `FingerprintAnalyzer.analyze` 生成指纹 |
| `backend/src/engines/agent_factory/tools.py` | 修改 | 新增 `web_search(query)` tool |
| `backend/src/api/bench.py` | 修改 | 新增 `GET /api/bench/agents/{id}/fingerprint` 端点 |
| `frontend/src/components/bench/FingerprintView.tsx` | **新建** | 行为指纹可视化组件（偏好路径图 + LLM 总结 + 偏离预警） |
| `frontend/src/pages/BenchLab.tsx` | 修改 | Bench 页面新增 "行为指纹" tab |
| `backend/src/llm/search.py` | **新建** | Web 搜索 provider 抽象层（DuckDuckGo 实现 + 缓存） |
| `backend/tests/test_fingerprint.py` | **新建** | FingerprintCollector + FingerprintAnalyzer 测试 |
| `backend/tests/test_agent_tools.py` | 修改 | 新增 `test_web_search`、`test_web_search_cache` |

#### 验收标准

- [ ] 每个 tick 结束时 `BehaviorTrace` 被正确采集（tool 调用/情绪/互动对象）
- [ ] World 结束后 `BehaviorFingerprint` 包含完整的 tool distribution + emotion trajectory + LLM 总结
- [ ] `GET /api/bench/agents/{id}/fingerprint` 返回指纹 JSON → 前端渲染偏好路径图
- [ ] `web_search("科大图书馆开放时间")` → 返回 1-3 条真实搜索结果 → Agent 在对话中引用搜索结果
- [ ] 同一 query 在 5 分钟内不重复请求（缓存生效）
- [ ] 搜索 API 不可用时 → tool 返回 "⚠️ 搜索服务暂不可用"（不阻塞 Agent）
- [ ] 回归：所有现有测试通过

---

### Step T9 — Phase 20 测试

> **目标：** Step 82–83 的全部自动化测试 + 长期运行稳定性测试。

#### 测试清单

| 被测模块 | 测试文件 | 覆盖内容 |
|---------|---------|---------|
| `MemoryConsolidator` | `tests/test_memory_consolidator.py` | consolidate 触发/输出格式/LLM mock/空事件处理 |
| `MemoryRetriever` type filter | `tests/test_memory_retriever.py` | lesson 优先排序/types 过滤/混合类型检索 |
| `FingerprintCollector` | `tests/test_fingerprint.py` | 每 tick 采集/跨 tick 聚合/异常事件处理 |
| `web_search` tool | `tests/test_agent_tools.py` | 搜索返回格式/缓存/API 不可用 fallback |
| 长期稳定性 | `tests/test_stability_long_run.py` | 10 Agent × 50 tick 连续运行、内存泄漏检测、SSE 断连恢复 |

#### 验收标准

- [ ] 新增 3 个测试文件全部通过
- [ ] 长期稳定性测试：50 tick 内无崩溃、无内存持续增长、SSE 自动重连成功
- [ ] 全量回归通过

---

## Phase 21: 架构深化（可选）

> **状态：** 本 Phase 的两个 Step 是深度改造，风险高、工时长。建议在 Phase 18-20 全部稳定后再评估是否启动。竞赛时间充裕就做，赶 deadline 就跳过。

### Step 84 — 事件驱动架构原型

> **目标：** 在保留 AutoGen GroupChat 的基础上，引入 EventBus 层——Agent 的 tool 调用（如 send_message）立即以事件形式广播，目标 Agent 可以在当前 tick 中断并响应，而不是等到下一轮 GroupChat。这是 Step 79 的"即时消息投递"的进一步泛化。
>
> **核心挑战：** AutoGen 的 SelectorGroupChat 是 turn-based 的——假设串行发言。在发言序列中间插入"目标 Agent 的中断响应"需要自定义 GroupChat Manager。这需要深入 AutoGen 源码级别的工作。
>
> **建议：** 先做 prototype，在一个简化的 2-agent 场景中验证可行性。如果 AutoGen 不兼容，则降级为 Step 79 的"pending message + 下轮响应"模式。

#### 涉及文件（待 prototype 后细化）

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/world/event_bus.py` | **新建** | EventBus 类：subscribe/publish/优先级队列 |
| `backend/src/engines/world/messages.py` | 修改 | 自定义 AutoGen GroupChat Manager——支持中断注入 |
| `backend/src/engines/world/streaming.py` | 修改 | SSE 流支持 out-of-order 事件 |

#### 验收标准

- [ ] Agent A 调用 send_message → Agent B 在同一 tick 内回复（不再等下一轮 GroupChat）
- [ ] 两个 Agent 同时 send_message 给同一目标 → 按优先级排队（不丢消息）
- [ ] AutoGen GroupChat 不崩溃、不产生孤儿 task
- [ ] 降级方案就绪：如果事件驱动模式不稳定，回退到 Step 79 的 pending message 模式

---

### Step 85 — 代码执行沙盒

> **目标：** Team 模式下，Agent 产出不只停留在"文本描述的技术方案"——Agent 可以写代码、运行、看输出、迭代修改。
>
> **安全隔离：** 使用 Docker 容器（首选）或受限 subprocess（fallback）。沙盒必须满足：
> - 无网络访问（或仅白名单域名）
> - 文件系统只写 `/tmp`（不持久）
> - CPU/内存硬限制（1 核 / 256MB）
> - 超时 30 秒自动 kill

#### 涉及文件（待 Phase 20 后细化）

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/src/engines/agent_factory/tools.py` | 修改 | 新增 `run_python(code)` tool——提交到沙盒 → 等待输出 → 返回结果 |
| `backend/src/engines/team/sandbox.py` | **新建** | DockerSandbox / SubprocessSandbox 实现 |
| `backend/src/engines/team/engine.py` | 修改 | TeamEngine.execute 时初始化沙盒 |

---

## 附录 A: 改动文件汇总与频次

| 文件 | 77 | 78 | 79 | 80 | 81 | 82 | 83 | 84 | 85 | 频次 |
|------|----|----|----|----|----|----|----|----|----|------|
| `tools.py` | - | 🟡 | 🔴 | 🟡 | 🟡 | - | 🟡 | - | 🟡 | **6** |
| `factory.py` | 🔴 | 🟡 | 🔴 | - | - | - | - | - | - | **3** |
| `engine.py` (world) | 🟡 | - | 🔴 | - | - | 🟡 | 🟡 | 🔴 | - | **4** |
| `messages.py` | - | - | 🟡 | - | 🟡 | - | - | 🔴 | - | **2** |
| `state.py` | 🟡 | 🟡 | 🟡 | - | - | - | - | - | - | **3** |
| `streaming.py` | - | - | 🟡 | - | - | - | - | 🔴 | - | **1** |
| `memory.py` | - | - | - | - | - | 🔴 | - | - | - | **1** |
| `prompt_templates.py` | 🟡 | - | - | - | - | 🟡 | - | - | - | **2** |
| `sse.py` | - | - | - | 🟡 | 🟡 | 🟡 | - | - | - | **3** |
| `planner.py` | - | - | - | 🔴 | - | - | - | - | - | **1** |
| `decomposer.py` | - | - | - | 🟡 | - | - | - | - | - | **1** |
| `team/engine.py` | - | - | 🟡 | 🟡 | - | - | - | - | 🟡 | **2** |
| `scene/engine.py` | - | - | - | - | 🔴 | - | - | - | - | **1** |
| `agent.py` (model) | - | 🟡 | - | - | - | - | - | - | - | **1** |
| `agent_orm.py` | - | 🟡 | - | - | - | - | - | - | - | **1** |
| `memory.py` (model) | - | - | - | - | - | 🟡 | - | - | - | **1** |
| `db.py` | - | 🟡 | - | - | - | 🟡 | - | - | - | **2** |
| `arenas/engine.py` | 🟡 | - | - | - | - | - | - | - | - | **1** |
| `arenas/battle_royale.py` | 🟡 | - | - | - | - | - | - | - | - | **1** |
| `bench/scheduler.py` | 🟡 | - | - | - | - | - | - | - | - | **1** |
| `api/scenes.py` | - | - | - | - | 🟡 | - | - | - | - | **1** |
| `api/teams.py` | - | - | 🟡 | - | - | - | - | - | - | **1** |
| `api/bench.py` | - | - | - | - | - | - | 🟡 | - | - | **1** |
| **前端** | | | | | | | | | | |
| `MapScene.ts` | - | - | - | - | 🔴 | - | - | - | - | **1** |
| `dialogue.ts` | - | - | - | - | 🟡 | - | - | - | - | **1** |
| `AutonomousMover.ts` | - | - | - | - | 🔴 | - | - | - | - | **1** |
| `AgentSprite.ts` | - | - | - | - | 🟡 | - | - | - | - | **1** |
| `EmotionEngine.ts` | - | - | - | - | 🟡 | - | - | - | - | **1** |
| `GameScene.tsx` | - | - | - | - | 🟡 | - | - | - | - | **1** |
| `TaskKanban.tsx` | - | - | - | 🟡 | - | - | - | - | - | **1** |
| `FingerprintView.tsx` | - | - | - | - | - | - | 🔴 | - | - | **1** |
| `BenchLab.tsx` | - | - | - | - | - | - | 🟡 | - | - | **1** |

> 🔴 = 核心改动（重写主要逻辑） | 🟡 = 联动改动（适配 API 变化）

---

## 附录 B: 核心调用链（改造前后对比）

### inject_context 调用链

```
改造前:
  WorldEngine._inject_world_context()
    → agent.inject_context(context, memories)
      → build_system_message(persona, background, goals, memories, context)
      → self._agent._system_messages = [SystemMessage(...)]  ← 覆盖
      → ctx._messages.clear()                                 ← 清空

改造后:
  WorldEngine._inject_world_context()
    → agent.inject_context(context, memories)
      → context_msg = build_context_message(context, memories)
      → self._agent._model_context.add_message(UserMessage(context_msg))  ← 追加
      → if self._context_count >= threshold: self._compress_history()
```

### Tool 调用链

```
改造前:
  Agent LLM → 调用 send_message("小红", "你好")
    → tools.send_message("小红", "你好")
      → return "消息已发送给 小红"  ← stub
    → AutoGen 把返回值作为 tool result 给 Agent
    → Agent 看到 "消息已发送给 小红"（假反馈）

  _post_process_tick:
    → _tool_call_to_event(message)
      → _build_action_description("send_message", {"target": "小红", "content": "你好"})
      → "对小红说: 你好"  ← 解析 description 字符串来产生"副作用"

改造后:
  Agent LLM → 调用 send_message("小红", "你好")
    → tools.send_message("小红", "你好")
      → target = engine._find_agent_by_name("小红")
      → engine._pending_messages.append({...})       ← 真实副作用
      → engine._notify_incoming_message(...)          ← 即时通知
      → return "✅ 消息已发送给 小红。对方将在本回合内看到。"  ← 真实反馈
    → AutoGen 把返回值作为 tool result 给 Agent
    → Agent 看到真实结果

  _post_process_tick:
    → 验证 _pending_messages 已处理（不再创建副作用——副作用已在 tool 中完成）
```

### M11 对话调用链

```
改造前:
  MapScene.scanAndDialogue()
    → fetchDialogue(from, to, scene)
      → POST /api/scenes/{id}/interact
        → SceneEngine.generate_dialogue_llm(from, to, scene)
          → 独立 LLM 调用（不走 AutoGen）
          → 返回 {"message": "...", "emotion": "happy"}
    → MapScene 显示对话气泡

改造后:
  WorldEngine.tick_stream()
    → GroupChat.run_stream()
      → Agent A 调用 send_message("小红", "你在看什么书?")
        → tool 真实投递 + SSE 推 agent_message 事件
    → MapScene SSE onmessage
      → 收到 agent_message 事件 → 显示对话气泡
      → （SSE 断线时才走 fetchDialogue mock fallback）
```

---

## 附录 C: 风险矩阵

| 风险 | 概率 | 影响 | 涉及 Step | 缓解措施 |
|------|------|------|----------|---------|
| AutoGen 内部 API 不稳定（`_model_context` 私有属性） | 中 | 高——inject_context 改造依赖它 | 77 | 研究 AutoGen 0.7 源码确认 `_model_context.add_message` 行为；准备 monkey-patch 方案 |
| Tool 闭包导致 WorldEngine 无法 GC | 中 | 中——内存泄漏 | 79 | 每个 tool 开头加 `if engine._destroyed: return` 守卫；WorldEngine 加 `__del__` 清理 |
| 上下文累积导致 token 爆炸 | 高 | 中——LLM 报 400 或成本飙升 | 77 | `_compress_history` 阈值设为 15 条消息（约 6000 token）；超阈值自动 LLM 摘要 |
| SSE 协议变化导致前端崩溃 | 低 | 高——破坏了现有 M1-M10 的所有 SSE 消费者 | 79, 81 | 新事件 type 只在 data.type 字段中区分；现有字段（agent_id/content/tick）不变 |
| M11 改 SSE 后延迟增大（每句对话走 LLM） | 高 | 中——用户体验下降 | 81 | 保留 mock 对话池作为快速 fallback；SSE 断线时自动切换 |
| Arena/Bench 的 inject_context 调用与新签名不兼容 | 低 | 高——破坏 M4/M10 | 77 | T7 测试覆盖全部 6 处调用；CI 中跑 Arena/Bench 相关测试 |
| MemoryConsolidator 的 LLM 反思产生低质量 lesson | 中 | 低——不影响系统运行 | 82 | prompt 中提供 3 个 example；lesson 写入前做基本校验（非空、长度>10） |
| web_search 依赖外部 API 稳定性 | 中 | 低——tool 可降级 | 83 | DuckDuckGo 免费 API 不需要 key；增加 5 分钟缓存减少请求；API 不可用时返回友好错误 |
| 代码执行沙盒安全漏洞 | 低 | 高——恶意代码可能逃逸 | 85 | Docker 容器 + 无网络 + 只写 /tmp + CPU/内存限制；仅 Team 模式可用；默认关闭 |

---

> **最后更新:** 2026-07-30
> **维护者:** 晓音_Stingray
> **版本:** 4.0 (Plan State 4)
> **基准:** [agent-improvement-plan.md](agent-improvement-plan.md) 诊断报告 + [plan-state3.md](plan-state3.md) Step 77-76 完成状态
> **设计重点:** 改内核不改界面——Agent 从"木偶"变"活物"。P0 强制做 Phase 18，P1 做 Phase 19，P2 做 Phase 20，Phase 21 可选。
