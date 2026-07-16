# 人生实验室 · Life Lab — 工程蓝图

> **项目定位：** Agent 社会实验平台。用户创建/部署自主 Agent → Agent 在场景中自主感知、思考、决策、互动 → 用户观察涌现行为。
>
> **一句话：** 你是导演，Agent 是演员。你设定好角色和舞台，按下开始，看他们怎么演。
>
> **架构决策（2026-07-16 更新）：** FastAPI（Web 层）+ AutoGen（Agent 编排层）混合架构。AutoGen 负责多 Agent 对话/调度/工具调用，FastAPI 负责 REST API + SSE 推送 + 数据持久化。不是二选一——各司其职。

---

## 目录

1. [核心架构](#1-核心架构)
2. [Agent 引擎设计（基于 AutoGen）](#2-agent-引擎设计基于-autogen)
3. [模块功能清单与优先级](#3-模块功能清单与优先级)
4. [数据模型](#4-数据模型)
5. [API 设计](#5-api-设计)
6. [前端架构](#6-前端架构)
7. [AI Prompt 体系](#7-ai-prompt-体系)
8. [开发阶段规划](#8-开发阶段规划)
9. [技术选型](#9-技术选型)
10. [LLM 成本与性能策略](#10-llm-成本与性能策略)
11. [开发工作流与 Mock 模式](#11-开发工作流与-mock-模式)

---

## 1. 核心架构

### 1.1 架构全景图

```
┌──────────────────────────────────────────────────────────────┐
│                     前端 (React + Vite)                       │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐   │
│  │ 面板布局  │ │ 时间线视图│ │ Agent 列表│ │ 思维流实时区  │   │
│  │ (Grid)   │ │ (Gantt)  │ │ (Tree)   │ │ (Terminal)   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘   │
│                                                              │
│  设计风格：深色控制台 (Mission Control)                         │
│  依赖：TailwindCSS + Lucide Icons + Recharts                  │
├──────────────────────────────────────────────────────────────┤
│                   API Gateway (FastAPI)                       │
│                                                              │
│  /api/agents  /api/worlds  /api/sims  /api/narratives       │
│  /api/arenas  /api/ws/{world_id}  (WebSocket/SSE)           │
├──────────────────────────┬───────────────────────────────────┤
│     FastAPI 负责          │       AutoGen 负责                 │
│                          │                                   │
│  • REST API 端点          │  • Agent 对话与调度                │
│  • SSE/WebSocket 推送     │  • 多 Agent 回合制交互             │
│  • 数据库 CRUD            │  • Tool 调用（Agent 行动）         │
│  • 请求校验 (Pydantic)    │  • 思维流回调 → 推送到 SSE         │
│  • 配置管理               │  • Human-in-the-loop（干预台）      │
│                          │                                   │
├──────────────────────────┴───────────────────────────────────┤
│               自定义引擎层（桥接 FastAPI ↔ AutoGen）            │
│                                                              │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ 人格编排器     │ │ 世界引擎       │ │ 叙事引擎              │ │
│  │              │ │              │ │                      │ │
│  │ • 人格→prompt│ │ • 时间线推进   │ │ • 事件日志→自然语言    │ │
│  │ • 记忆注入    │ │ • 事件分发     │ │ • 风格控制             │ │
│  │ • 目标管理    │ │ • 关系图演化   │ │ • 口吻一致性           │ │
│  └──────────────┘ └──────────────┘ └──────────────────────┘ │
├──────────────────────────────────────────────────────────────┤
│                 数据层 (SQLite + aiosqlite)                   │
│                                                              │
│  agents / worlds / events / memories / simulations           │
│  （P0 用 SQLite 单文件 → P3 可迁移到 PostgreSQL）              │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 为什么是 FastAPI + AutoGen 而不是二选一

| 维度 | FastAPI 角色 | AutoGen 角色 |
|------|-------------|-------------|
| **Web 服务** | ✅ REST API + SSE/WS 推送 | ❌ 不管 HTTP |
| **Agent 对话** | ❌ 需要手写整个协议 | ✅ `ConversableAgent` + `GroupChat` 开箱即用 |
| **多 Agent 调度** | ❌ 需要手写调度器 | ✅ `RoundRobinGroupChat` / `SelectorGroupChat` |
| **Tool 调用** | ❌ 需要手写 function calling 循环 | ✅ 原生 `ToolAgent` + tool registration |
| **Human-in-the-loop** | ❌ 需要手写中断/恢复逻辑 | ✅ 原生 `handoff` + `max_consecutive_auto_reply` |
| **数据持久化** | ✅ SQLAlchemy + Pydantic | ❌ 不管存储 |
| **流式输出** | ✅ SSE / StreamingResponse | ✅ 原生 streaming 回调 |

**结论：** FastAPI 做壳（Web、数据、配置），AutoGen 做核（Agent 交互、调度、工具）。自定义引擎层（人格编排器、世界引擎、叙事引擎）做桥——把 AutoGen 的 Agent 消息翻译成业务语义，把世界状态注入 AutoGen 的上下文。

### 1.3 引擎职责划分

| 引擎 | 职责 | 基于什么 | 输入 | 输出 |
|------|------|---------|------|------|
| **Agent 编排** | Agent 对话、调度、工具调用 | AutoGen `GroupChat` | World State + Persona | Agent Messages + Tool Calls |
| **人格编排器** | 人格→System Prompt 注入、记忆召回、目标优先级 | 自定义 Python | Agent ID + 场景上下文 | AutoGen Agent 实例（带 persona） |
| **世界引擎** | 时间推进、事件分发、关系演化 | 自定义 Python | Agent Actions | World State 更新 |
| **叙事引擎** | 事件日志→自然语言叙事 | LLM Chain | Event Log | Story / Diary / Letter |
| **事件总线** | SSE/WS 实时推送 | FastAPI SSE/WS | AutoGen 回调 + 引擎事件 | 前端实时更新 |

---

## 2. Agent 引擎设计（基于 AutoGen）

### 2.1 核心思路：不重复造轮子

AutoGen 已经提供了：

| AutoGen 原语 | 在我们的项目中对应 |
|-------------|------------------|
| `ConversableAgent` | 单个 Agent 实体（注入 persona system prompt） |
| `GroupChat` + `RoundRobinGroupChat` | M3 群体沙盒的多 Agent 回合制交互 |
| `ToolAgent` / `assistant_agent` | Agent 的"行动"（发消息、移动、学习、消费…）注册为 tool |
| `handoff` / `max_consecutive_auto_reply` | M7 干预台：暂停→用户输入→继续 |
| Streaming callback (`on_messages_stream`) | 思维流实时推送到前端 SSE |
| `SocietyOfMindAgent` | Agent 内部独白（组内讨论后再对外发言）——适合"思考"阶段 |

**我们不需要写的：**
- ❌ Agent 间消息路由（AutoGen 的 GroupChat Manager 做）
- ❌ 对话状态管理（AutoGen 内部状态机）
- ❌ Tool calling 循环（AutoGen 原生支持）
- ❌ 流式回调基础设施

**我们需要写的：**
- ✅ 人格编排器：把 Persona JSON → System Prompt → 注入 AutoGen Agent
- ✅ 世界状态适配器：把 World State → AutoGen Agent 的上下文消息
- ✅ 记忆召回器：语义/时序检索 → 注入上下文
- ✅ SSE 桥接：AutoGen streaming callback → FastAPI SSE
- ✅ 世界引擎：接收 Agent 的 tool call 结果 → 更新世界状态

### 2.2 Agent 创建流程

```python
# === 概念代码（非最终实现）===

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.conditions import TextMentionTermination
from autogen_ext.models.openai import OpenAIChatCompletionClient

class AgentFactory:
    """用一句话描述 → 完整的 AutoGen Agent 实例"""

    def __init__(self, model_client: OpenAIChatCompletionClient):
        self.model_client = model_client
        self.persona_builder = PersonaBuilder(model_client)
        self.memory_retriever = MemoryRetriever()

    async def create_from_description(self, description: str) -> "LifeAgent":
        # 1. LLM 生成人格 JSON
        persona = await self.persona_builder.build(description)
        # 2. 人格 → System Prompt
        system_prompt = self.persona_builder.to_system_prompt(persona)
        # 3. 注册 Agent 能做的"行动"为 tools
        tools = self._build_tools_for_scenario(persona)
        # 4. 创建 AutoGen Agent
        agent = AssistantAgent(
            name=persona.name,
            model_client=self.model_client,
            system_message=system_prompt,
            tools=tools,
            reflect_on_tool_use=True,     # tool 结果后反思
            max_consecutive_auto_reply=5, # 防止死循环
        )
        return LifeAgent(
            agent=agent,
            persona=persona,
            memory=self.memory_retriever,
        )
```

### 2.3 Agent 内部状态 vs AutoGen 消息流

AutoGen 本身不维护"情感状态""精力值""信念"等模拟概念——这些由我们的**世界引擎**维护，在每轮对话前注入 AutoGen Agent 的上下文：

```
每个 tick：
┌─────────────────────────────────────────────────────┐
│ 1. 世界引擎推送当前世界状态 → context message          │
│    "当前 tick: 42 | 你的精力: 45% | 情绪: 焦虑"      │
│    "你看到: 小红在图书馆、小明向你走来..."            │
│    "你的记忆: 上次和小明合作失败了..."                │
├─────────────────────────────────────────────────────┤
│ 2. AutoGen Agent 处理 context → 生成回复/调用 tool    │
│    - 内部思考 (think): 通过 SocietyOfMindAgent       │
│    - 决策+行动 (decide+act): 通过 tool call 完成     │
│    - 社交互动 (dialogue): 通过 GroupChat 消息完成     │
├─────────────────────────────────────────────────────┤
│ 3. AutoGen 消息 → 世界引擎解析 → 更新状态             │
│    - tool call "send_message(to=小红, ...)" → 事件   │
│    - tool call "study(subject=高数, hours=3)" → 效果 │
│    - 文本消息 → 思维流日志                            │
├─────────────────────────────────────────────────────┤
│ 4. SSE 推送 → 前端更新                               │
│    - 思维流（on_messages_stream 回调）                │
│    - 行动结果                                         │
│    - 关系变化                                         │
└─────────────────────────────────────────────────────┘
```

### 2.4 思维流怎么实现

这是整个产品最大的卖点——让用户"看到 Agent 在想什么"。在 AutoGen 架构下有两种方案：

**方案 A：SocietyOfMindAgent（推荐 P0）**
```
Agent 收到消息后 → SocietyOfMindAgent 内部讨论（不对外）
  "我应该邀请小红组队吗？"
  "小刚可能会抢先一步..."
  "上次合作很成功，这次把握更大"
  → 内部共识 → 对外发送最终回复
```
内部讨论的每一步都通过 `on_messages_stream` 推给前端，显示为"思维流"。

**方案 B：双阶段 Agent（更细粒度，P2 选做）**
```
perceive: Agent 收到世界状态 → 输出"观察摘要"
think:    观察摘要 + 记忆 + 人格 → 输出"内部推理"
decide:   推理结果 + 选项 → 输出"决策"
act:      决策 → tool call
```
每个阶段是一个独立的 AutoGen Agent，chain 在一起。粒度更细但 LLM 调用更多。

**P0 建议：方案 A。** 实现简单，LLM 调用少。如果演示需要更细粒度的思维流展示，P2 再切到方案 B。

### 2.5 群体沙盒（M3）：多 Agent 交互

```python
# === 概念代码 ===

class WorldSimulation:
    def __init__(self, world: World, agents: list[LifeAgent], model_client):
        self.world = world
        self.agents = agents
        # 创建 AutoGen GroupChat
        self.team = RoundRobinGroupChat(
            participants=[a.agent for a in agents],
            model_client=model_client,
            max_turns=len(agents) * 3,  # 每轮每人至少发言一次
        )

    async def tick(self) -> list[SimEvent]:
        """推进一个 tick"""
        # 1. 每个 Agent 注入当前世界状态
        world_context = self.world.get_context()
        for agent in self.agents:
            agent.inject_context(world_context)

        # 2. 运行一轮 AutoGen GroupChat
        events = []
        async for message in self.team.run_stream(task=""):
            # 3. 实时推送思维流
            events.append(message)
            await self.sse_broadcast(message)

        # 4. 解析 tool calls → 更新世界状态
        self.world.apply(events)

        # 5. 更新关系和情绪
        self.world.update_relationships(events)

        return events
```

**关键设计决策：**
- `RoundRobinGroupChat` 保证公平发言，不会有人霸屏
- `max_turns` 限制每 tick 的交互量，防止 LLM 调用爆炸
- tool call 的结果由世界引擎计算后返回给 Agent（不是 LLM 幻想）

### 2.6 竞技场（M4）：Agent 对抗

两个 Agent 在同一场景竞争 → 本质是两个 `ConversableAgent` 同时接收相同世界状态，各自独立决策：

```python
# 辩论赛模式
debate = RoundRobinGroupChat(
    participants=[agent_a, agent_b],
    termination_condition=TextMentionTermination("评委评分"),
    max_turns=6,  # 各 3 轮发言
)
# 最后追加一个"裁判 Agent"来评分
judge = AssistantAgent(
    name="裁判",
    system_message="你是评分裁判，根据论点质量、逻辑严密性评分...",
)
```

### 2.7 为什么要这样设计

| 手写 Agent 引擎（原方案） | FastAPI + AutoGen 混合（新方案） |
|--------------------------|-------------------------------|
| 需要手写 Agent 消息路由协议 | AutoGen GroupChat 原生支持 |
| 需要手写 tool calling 循环 | AutoGen `tools=` 参数注册 |
| 需要手写对话状态机 | AutoGen 内部管理 |
| 需要手写 streaming 逻辑 | AutoGen `run_stream()` 原生返回 async iter |
| 需要手写回合制调度 | `RoundRobinGroupChat` 开箱即用 |
| **预计代码量: ~2000 行** | **预计代码量: ~800 行** |
| 完全可控，灵活度最高 | 受限于 AutoGen 抽象，但够用 |
| 没有学习曲线（纯 Python） | 需要团队熟悉 AutoGen 概念 |

**4 周时间约束下的判断：** AutoGen 节省的 ~1200 行代码，相当于省 2-3 天开发时间。这些时间可以用来打磨演示效果。值得。

---

## 3. 模块功能清单与优先级

### 优先级定义

| 级别 | 含义 | 标准 |
|------|------|------|
| **P0** | 骨架，必须做 | 没有它产品跑不起来 |
| **P1** | 血肉，demo 核心看点 | 演示时必须展示的能力 |
| **P2** | 亮点，有就加分 | 演示时"快速闪过"的部分 |
| **P3** | 锦上添花 | 有时间就加，没时间砍 |

---

### M1 · Agent 铸造厂（P0-P1）

> 核心价值：创建能自主行动的 Agent，这是整个产品的基础

| # | 功能 | 优先级 | 复杂度 | 说明 |
|---|------|--------|--------|------|
| 1 | 🎭 自然语言创建 Agent | **P0** | 中 | "一个来自小镇的计算机系新生，内向但野心大" → Agent |
| 2 | 🧬 人格引擎 | **P0** | 高 | MBTI + 大五人格 + 价值观向量，影响所有 LLM 调用 |
| 3 | 📝 背景故事自动生成 | **P1** | 低 | LLM 补全成长经历、家庭背景 |
| 4 | 🎯 目标系统 | **P1** | 中 | Agent 有层级化目标，自己决定优先级 |
| 5 | 🤔 决策风格参数 | **P1** | 低 | 理性/冲动/风险规避/社会性——人格的衍生属性 |
| 6 | 🔄 Agent Remix | **P2** | 低 | 基于已有 Agent 修改某特质 |
| 7 | 📦 模板库（30+ Agent） | **P2** | 低 | 预制角色，但本质是 LLM 生成的，不是硬编码 |

**设计要点：**
- 人格不是"参数"，而是"倾向性 prompt 注入"。同样的场景 prompt，不同人格在 prompt 中注入不同的行为倾向描述。
- 模板 Agent 不是手工写的——写一个生成器，输入"小镇做题家"→ LLM 自动生成完整人格 JSON。

---

### M2 · 单人剧场（P0-P1）

> 核心价值：一个 Agent 自主生活，展示 Agent 的自主决策能力

| # | 功能 | 优先级 | 复杂度 | 说明 |
|---|------|--------|--------|------|
| 8 | 🎬 场景投放 | **P0** | 中 | Agent 放入场景，自动开始 loop |
| 9 | 👁️ 思维流实时展示 | **P0** | 中 | SSE 推流 Agent 的思考过程到前端 |
| 10 | 🎯 目标追逐 | **P1** | 中 | Agent 自主分解目标 → 制定计划 → 执行 |
| 11 | 🧭 动态计划调整 | **P1** | 中 | 遇到意外事件时 Agent 重新规划 |
| 12 | 📓 Agent 日记 | **P1** | 低 | LLM 生成第一人称日记 |
| 13 | 🔍 决策回放 | **P2** | 低 | 点击任意节点，展开完整思考链 |
| 14 | ⏸️ 暂停干预 | **P2** | 低 | 运行时注入事件/信息 |

**设计要点：**
- **思维流是演示的灵魂。** 评委看到 Agent 的内心独白在滚动，才相信"它真的在思考"。
- 场景投放在 P0，但场景库可以在 P2 做。P0 只需要 3 个场景：新生报到、期末周、毕业选择。
- 日记用同一个 Agent 人格 + 当天事件日志 → LLM 生成，保持口吻一致。

---

### M3 · 群体沙盒（P0-P1）

> 核心价值：多 Agent 交互涌现，这是最"唬人"的部分

| # | 功能 | 优先级 | 复杂度 | 说明 |
|---|------|--------|--------|------|
| 15 | 🏘️ 群体投放 | **P0** | 中 | 3-6 个 Agent 放入同一环境 |
| 16 | 💬 Agent 间对话 | **P1** | 高 | LLM 驱动的多轮对话 |
| 17 | 🤝 关系演化 | **P1** | 中 | 关系随互动自然变化 |
| 18 | ⚔️ 竞争博弈 | **P1** | 中 | 有限资源下 Agent 的策略行为 |
| 19 | 🎭 角色冲突 | **P2** | 低 | 不同人格的 Agent 自然产生摩擦 |
| 20 | 🌐 关系网络图 | **P2** | 低 | 可视化关系图（力导向布局） |
| 21 | 📊 群体动力学报告 | **P2** | 低 | LLM 分析"谁是领导、谁被孤立" |

**设计要点：**
- P0 群体投放的关键是**调度器**：每个 tick 决定哪个 Agent 行动，保证公平。
- Agent 间对话本质是：Agent A generate_message() → 写入世界状态 → Agent B perceive() 收到 → 回复。
- "涌现"不是魔法——它来自：不同人格 × 不同目标 × 有限资源 × 时间压力。把这四个要素做对，涌现自然发生。

---

### M4 · Agent 竞技场（P1-P2）

> 核心价值：量化对比不同 Agent 的能力

| # | 功能 | 优先级 | 复杂度 | 说明 |
|---|------|--------|--------|------|
| 22 | 🥊 1v1 对抗 | **P1** | 中 | 两个 Agent 同场景竞争 |
| 23 | 🏟️ 大乱斗 | **P2** | 高 | 6+ Agent 同时竞争 |
| 24 | 📋 战报生成 | **P2** | 低 | LLM 自动分析胜负原因 |
| 25 | 🎯 盲测模式 | **P3** | 低 | Agent 不知道在比赛 |
| 26 | 🔄 复盘对比 | **P2** | 低 | 并排展示决策树分歧 |
| 27 | 🏆 排行榜 | **P3** | 低 | 不同指标排行 |
| 28 | 🧪 A/B 测试 | **P3** | 中 | 同一 Agent 跑 N 次 |

**设计要点：**
- 1v1 对抗的场景必须清晰：辩论赛（谁的论点更有力）、面试竞争（谁表现更好）、校园创业路演（谁拿到投资）。
- 胜负判定不是简单规则——用 LLM 做裁判，给出结构化评分 + 理由。

---

### M5 · 叙事工厂（P1-P2）

> 核心价值：把干巴巴的事件日志变成有温度的故事

| # | 功能 | 优先级 | 复杂度 | 说明 |
|---|------|--------|--------|------|
| 29 | 📖 小说化叙事 | **P1** | 低 | Agent 经历 → 第一人称短篇小说 |
| 30 | ✉️ 未来的信 | **P2** | 低 | 大四的自己写给大一 |
| 31 | 🪞 平行对话 | **P2** | 低 | 两条时间线的自己互聊 |
| 32 | 🎙️ 播客脚本 | **P2** | 低 | Agent 经历 → 播客节目稿 |
| 33 | 🎬 微电影大纲 | **P3** | 低 | Agent 经历 → 分镜头脚本 |
| 34 | 📔 自动连载 | **P3** | 中 | 每周自动更新日记，可追更 |
| 35 | 🎨 Agent 自画像 | **P3** | 低 | 文字描述 + AI 生成图像 |

**设计要点：**
- 叙事引擎的核心是"保持口吻一致性"——每个 Agent 的日记/故事要以该 Agent 的人设来写。
- P1 只需要 29（小说化叙事），其他都是 P2+。

---

### M6 · 观察者控制台（P1-P2）

> 核心价值：上帝视角看整个 Agent 社会的宏观规律

| # | 功能 | 优先级 | 复杂度 | 说明 |
|---|------|--------|--------|------|
| 36 | 📊 多 Agent 仪表盘 | **P1** | 中 | 所有活跃 Agent 的状态卡片矩阵 |
| 37 | 🗺️ 事件热力图 | **P2** | 低 | 时间 × Agent 的事件密度矩阵 |
| 38 | 🔍 Agent 搜索 | **P2** | 低 | "哪些 Agent 考前通宵了" |
| 39 | 🧠 决策模式识别 | **P2** | 中 | "Agent A 在压力下倾向回避" |
| 40 | ⚠️ 异常检测 | **P3** | 低 | Agent 行为偏离人格基线 |
| 41 | 📈 长期追踪 | **P3** | 中 | 同一 Agent 跨场景趋势 |
| 42 | 🎯 策略提取 | **P3** | 中 | "成功 Agent 的共同策略" |

**设计要点：**
- 多 Agent 仪表盘是 P1 关键功能——演示时可以一眼看到所有 Agent 的实时状态。
- 搜索和模式识别本质是 SQL 查询 + LLM 总结，技术难度不高，但演示效果很好。

---

### M7 · 导演干预台（P2-P3）

> 核心价值：不是完全放手，而是"关键时刻出手"

| # | 功能 | 优先级 | 复杂度 | 说明 |
|---|------|--------|--------|------|
| 43 | 💉 事件注入 | **P2** | 低 | 运行时插入事件 |
| 44 | 🗣️ 上帝之声 | **P3** | 低 | 对某个 Agent 耳语 |
| 45 | ⏪ 时间回溯 | **P3** | 高 | 回到决策点重新来 |
| 46 | 🔀 分支探索 | **P3** | 中 | 关键节点自动分叉 |
| 47 | 🧬 人格篡改 | **P3** | 低 | 运行中修改性格 |
| 48 | 📋 干预历史 | **P3** | 低 | 记录所有干预 |
| 49 | 🎮 剧本模式 | **P3** | 中 | 预设关键事件必须发生 |

**设计要点：**
- 这一整块都是 P2-P3。比赛 demo 不需要展示"干预"，只需要展示"Agent 自主行动"。
- 但如果时间充裕，事件注入（#43）可以让 demo 更有互动性——评委说一个事件，现场注入。

---

### M8 · Agent 档案馆（P2-P3）

> 核心价值：沉淀、分享、复用

| # | 功能 | 优先级 | 复杂度 | 说明 |
|---|------|--------|--------|------|
| 50 | 📦 Agent 市场 | **P3** | 中 | 分享/下载 Agent |
| 51 | 🎬 精彩回放 | **P2** | 低 | 分享模拟片段 |
| 52 | 🧪 实验模板 | **P2** | 低 | 保存/复用场景设置 |
| 53 | 📊 社区数据大屏 | **P3** | 中 | 全局统计数据 |
| 54 | 🎖️ 成就系统 | **P2** | 低 | 创建 Agent 数、观察时长等 |
| 55 | 📄 研究报告导出 | **P2** | 低 | 导出 Markdown/PDF 报告 |
| 56 | 🔌 API 开放 | **P3** | 中 | 外部程序控制 Agent |

**设计要点：**
- 档案馆是"面子工程"——成就、回放、导出报告都是演示时让产品看起来更完整的东西。
- 研究报告导出（#55）可以在演示结尾生成一份 PDF，"这就是我们产品的一个实验报告"。

---

### 3.1 优先级汇总

| 级别 | 数量 | 功能编号 |
|------|------|----------|
| **P0** | 6 | 1, 2, 8, 9, 15, 36 |
| **P1** | 14 | 3, 4, 5, 10, 11, 12, 16, 17, 18, 22, 29, 30, 31, 32 |
| **P2** | 19 | 6, 7, 13, 14, 19, 20, 21, 24, 25, 26, 27, 28, 37, 38, 39, 43, 51, 52, 54, 55 |
| **P3** | 17 | 其余 |

**一个月的最小可行目标：P0 + P1 = 20 个功能，覆盖 8 个模块。**

---

## 4. 数据模型

### 4.0 存储策略

| 层级 | P0-P1（4 周内） | P2+（后续） |
|------|----------------|------------|
| **关系数据** | SQLite + aiosqlite | PostgreSQL（迁移只需改连接串） |
| **向量存储** | JSON 文件 + 关键词匹配 | pgvector / Chroma |
| **缓存/状态** | 内存 dict | Redis |
| **文件** | 本地 JSON | 对象存储 |

**P0 原则：零外部依赖，SQLite 单文件即可运行。** 部署只需 `pip install` + `python main.py`，不需要 Docker/PostgreSQL/Redis。

### 4.1 核心实体

```python
# === Agent ===
# SQLite 表: agents
class Agent:
    id: str                  # UUID
    user_id: str
    name: str
    persona_json: str        # JSON 字符串: {mbti, big_five, values, decision_style}
    background_json: str     # JSON: {hometown, family, education, key_events}
    goals_json: str          # JSON: [{id, description, priority, deadline, status}]
    emotional_state_json: str# JSON: {valence, arousal, dominance}
    energy: float            # 0-100
    beliefs_json: str        # JSON: {key: value}
    created_at: str          # ISO timestamp
    updated_at: str

# === World ===
# SQLite 表: worlds
class World:
    id: str
    name: str
    scenario_json: str       # 场景定义
    agent_ids_json: str      # [agent_id, ...]
    current_tick: int
    status: str              # running / paused / finished
    created_at: str

# === Event ===
# SQLite 表: events
class Event:
    id: str
    world_id: str
    tick: int
    type: str                # agent_action / world_event / interaction / thought
    source_agent_id: str     # nullable
    target_agent_ids_json: str
    description: str
    data_json: str           # 附加数据
    created_at: str

# === Memory ===
# SQLite 表: memories  （P0 用关键词匹配，P2 加向量）
class Memory:
    id: str
    agent_id: str
    type: str                # episodic / semantic
    content: str
    importance: float        # 0-1
    keywords: str            # 逗号分隔的关键词，用于 P0 检索
    embedding_json: str      # P2: 向量数据，P0 为空
    created_at: str

# === ThoughtLog ===
# SQLite 表: thought_logs
class ThoughtLog:
    id: str
    agent_id: str
    world_id: str
    tick: int
    phase: str               # observe / think / decide / act / dialogue
    content: str             # 原始文本
    tokens_used: int
    created_at: str

# === Simulation ===
# SQLite 表: simulations
class Simulation:
    id: str
    world_id: str
    started_at: str
    ended_at: str            # nullable
    total_ticks: int
    status: str
```

### 4.2 为什么 P0 不装 pgvector

| 问题 | P0 方案 |
|------|--------|
| 安装 PostgreSQL + pgvector 太耗时 | SQLite 是 Python 标准库，零配置 |
| 向量搜索需要额外服务 | P0 用关键词 + 时间衰退就够了 |
| 4 周内 Agent 记忆量不大 | 每个 Agent 几十条记忆，遍历比建索引快 |
| 迁移成本低 | SQLite → PostgreSQL 只需改 `DATABASE_URL` |

### 4.3 关系图

```
User ──┬── Agent ──┬── Memory
       │            ├── ThoughtLog
       │            └── Goal
       │
       └── World ──┬── Event
                    └── Simulation

Agent <──> Agent  (Relationship: 双向态度向量，存储在 World 的 JSON 字段中)
```

---

## 5. API 设计

### 5.1 核心端点

```yaml
# === Agent 管理 ===
POST   /api/agents                    # 自然语言创建 Agent
GET    /api/agents                    # 列出所有 Agent
GET    /api/agents/{id}               # 获取 Agent 详情
PUT    /api/agents/{id}               # 修改 Agent
DELETE /api/agents/{id}               # 删除
POST   /api/agents/{id}/remix         # Remix Agent

# === 世界管理 ===
POST   /api/worlds                    # 创建世界（场景投放）
GET    /api/worlds                    # 列出世界
GET    /api/worlds/{id}               # 获取世界详情（含时间线）
POST   /api/worlds/{id}/start         # 启动模拟
POST   /api/worlds/{id}/pause         # 暂停
POST   /api/worlds/{id}/inject        # 注入事件
POST   /api/worlds/{id}/reset         # 重置

# === 模拟 ===
GET    /api/simulations/{id}          # 获取模拟详情
GET    /api/simulations/{id}/events   # 获取事件列表
GET    /api/simulations/{id}/report   # 生成报告

# === 实时流 ===
GET    /api/worlds/{id}/stream        # SSE：思维流 + 事件推送

# === 叙事 ===
POST   /api/narratives/story          # 生成小说化叙事
POST   /api/narratives/letter         # 生成未来的信
POST   /api/narratives/diary          # 生成日记

# === 竞技 ===
POST   /api/arenas                    # 创建竞技
GET    /api/arenas/{id}/result        # 获取竞技结果
```

### 5.2 SSE 事件格式（从 AutoGen streaming 桥接）

AutoGen `on_messages_stream()` 产生的消息 → 我们的适配层翻译 → SSE 推给前端：

```json
// === 思维流事件（AutoGen 内部消息 → 翻译为思维流） ===
{
  "type": "thought_stream",
  "agent_id": "uuid",
  "agent_name": "小明",
  "phase": "think",
  "content": "我注意到小红今天没来上课...她是不是在准备比赛？如果是的话，我需要调整策略...",
  "tick": 42
}

// === Agent 发言（AutoGen GroupChat 消息） ===
{
  "type": "agent_message",
  "agent_id": "uuid",
  "agent_name": "小明",
  "message": "小红，周末一起复习高数吗？",
  "subtext": "其实是想打探她的复习进度",
  "tone": "casual",
  "tick": 42
}

// === Agent 行动（AutoGen Tool Call） ===
{
  "type": "agent_action",
  "agent_id": "uuid",
  "action": "send_message",
  "target": "小红",
  "content": "周末一起复习高数吗？",
  "tick": 42
}

// === 世界事件 ===
{
  "type": "world_event",
  "event": {
    "description": "期末考试周开始，图书馆座位减少80%",
    "affected_agents": ["uuid1", "uuid2", "uuid3"]
  },
  "tick": 50
}

// === 关系变化 ===
{
  "type": "relationship_change",
  "agent_a": "uuid",
  "agent_b": "uuid",
  "change": "+0.15",
  "reason": "一起熬夜复习",
  "tick": 55
}

// === Tick 边界（前端可以用来做时间线标记） ===
{
  "type": "tick_boundary",
  "tick": 43,
  "timestamp": "2026-07-16T14:30:00Z"
}
```

### 5.3 SSE 桥接实现要点

```python
# backend/src/sse_bridge.py
from fastapi.responses import StreamingResponse
from autogen_agentchat.teams import RoundRobinGroupChat

async def event_generator(world_id: str, team: RoundRobinGroupChat):
    """把 AutoGen 的消息流转为 SSE 事件"""
    async for message in team.run_stream():
        # 1. AutoGen 内部消息 → 我们的 SSE 事件格式
        sse_event = translate_autogen_message(message)
        # 2. 同时写入数据库
        await save_event(world_id, sse_event)
        # 3. 推送给前端
        yield f"data: {json.dumps(sse_event)}\n\n"

@app.get("/api/worlds/{world_id}/stream")
async def stream_world(world_id: str):
    team = get_active_team(world_id)
    return StreamingResponse(
        event_generator(world_id, team),
        media_type="text/event-stream",
    )
```

---

## 6. 前端架构

### 6.1 页面结构

```
/                         → 首页/功能导航
/agents                   → Agent 铸造厂（创建 + 列表）
/agents/:id               → Agent 详情（人格雷达图、记忆时间线）
/agents/:id/compare/:id2  → Agent 对比
/worlds                   → 世界列表
/worlds/:id               → 主观察界面（核心页面）
/worlds/:id/replay        → 模拟回放
/arena                    → 竞技场
/arena/:id                → 竞技详情
/narratives               → 叙事浏览
/narratives/:id           → 单篇叙事
/archive                  → 档案馆（市场、模板、成就）
/profile                  → 个人中心
```

### 6.2 核心页面：主观察界面布局

```
┌─────────────────────────────────────────────────────────────┐
│  TOP BAR: World Name | Tick #42 | ⏸ Pause | ⏩ Speed 2x   │
├──────────────┬──────────────────────────┬───────────────────┤
│ AGENT PANEL  │                          │ THOUGHT STREAM    │
│ (280px)      │      MAIN STAGE          │ (360px)           │
│              │                          │                   │
│ ┌──────────┐ │   ┌──────────────────┐   │ 🟢 小明 thinking: │
│ │🟢 小明   │ │   │                  │   │ "我注意到..."     │
│ │ 😰 焦虑  │ │   │   TIMELINE       │   │                   │
│ │ GPA: 3.2 │ │   │   ●────●────●    │   │ 🟡 小红 deciding: │
│ │ ⚡ 45%   │ │   │   │         └─?   │   │ "如果A那么B..."   │
│ ├──────────┤ │   │                      │                   │
│ │🟡 小红   │ │   │   EVENT FEED       │   │ 🔵 小刚 acting:  │
│ │ 😤 竞争  │ │   │   Tick 42: 小明... │   │ "我决定..."      │
│ │ GPA: 3.7 │ │   │   Tick 41: 小红... │   │                   │
│ │ ⚡ 72%   │ │   │                      │   │                   │
│ └──────────┘ │   └──────────────────┘   │                   │
├──────────────┴──────────────────────────┴───────────────────┤
│  BOTTOM BAR: Timeline scrubber | Speed control | Inject btn │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 组件树

```
App
├── Layout
│   ├── Sidebar (导航 + 56 功能菜单)
│   └── Content
│       ├── AgentCreator (铸造厂)
│       │   ├── NaturalLanguageInput
│       │   ├── PersonaPreview (雷达图)
│       │   └── AgentCard
│       ├── WorldView (主观察界面)
│       │   ├── AgentPanel (左侧列表)
│       │   │   └── AgentStatusCard × N
│       │   ├── MainStage (中央)
│       │   │   ├── TimelineView (时间线)
│       │   │   ├── EventFeed (事件流)
│       │   │   └── RelationshipGraph (关系图)
│       │   ├── ThoughtStream (右侧思维流)
│       │   │   └── ThoughtBubble × N
│       │   └── ControlBar (底部控制栏)
│       ├── ArenaView (竞技场)
│       ├── NarrativeView (叙事)
│       └── ArchiveView (档案馆)
```

### 6.4 前端状态管理

| 工具 | 用途 |
|------|------|
| **Zustand** | 全局状态（当前 World、活跃 Agent 列表、连接状态） |
| **React Query (TanStack Query)** | 服务端数据缓存（Agent 列表、World 列表、历史叙事） |
| **EventSource (原生)** | SSE 连接，接收思维流和事件推送 |
| **useReducer** | 单个 World 内的事件流和 tick 状态 |

SSE 数据流：
```
EventSource → Zustand store (append event) → React 组件自动重渲染
```
不需要 WebSocket，SSE 完全够用。

### 6.5 前端 Mock 开发模式

```typescript
// frontend/src/mocks/thought-stream.ts
// 前端独立开发时用，不需要后端

const MOCK_THOUGHTS = [
  { agent_id: "1", agent_name: "小明", phase: "think",
    content: "我注意到小红今天没来上课...她是不是在准备比赛？", tick: 42 },
  { agent_id: "1", agent_name: "小明", phase: "decide",
    content: "决定了——现在就给小红发消息。", tick: 42 },
  { agent_id: "2", agent_name: "小红", phase: "think",
    content: "小明的消息...他想找我组队？但我已经答应小刚了...", tick: 43 },
  // ...
];

// 模拟 SSE 推送
function useMockSSE() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % MOCK_THOUGHTS.length);
    }, 2000); // 每 2 秒推一条
    return () => clearInterval(timer);
  }, []);
  return MOCK_THOUGHTS.slice(0, index + 1);
}
```

### 6.4 视觉设计规范

```css
/* === 调色板 === */
:root {
  --bg-primary: #0a0a0f;
  --bg-secondary: #12121a;
  --bg-card: #1a1a26;
  --border: #2a2a3a;
  --text-primary: #e0e0e0;
  --text-secondary: #8888aa;
  --accent-green: #00ff88;
  --accent-blue: #4488ff;
  --accent-orange: #ff8844;
  --accent-red: #ff4466;
  --accent-purple: #aa44ff;
}

/* === 字体 === */
font-family: 'JetBrains Mono', 'Inter', monospace;

/* === 卡片 === */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

/* === Agent 状态指示灯 === */
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-dot.active { background: var(--accent-green); box-shadow: 0 0 8px var(--accent-green); }
.status-dot.thinking { background: var(--accent-blue); animation: pulse 1.5s infinite; }
.status-dot.idle { background: var(--text-secondary); }
```

---

## 7. AI Prompt 体系

### 7.1 AutoGen 中的 Prompt 注入点

```
┌──────────────────────────────────────────────┐
│  AutoGen AssistantAgent                      │
│                                              │
│  system_message = PERSONA_PROMPT (固定注入)   │
│  ┌──────────────────────────────────────┐    │
│  │ 人格描述 + 背景故事 + 目标 + 行为规则  │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  messages[0] = WORLD_CONTEXT (每 tick 刷新)   │
│  ┌──────────────────────────────────────┐    │
│  │ 当前世界状态 + 近期事件 + 相关记忆     │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  messages[1:] = 对话历史 (AutoGen 管理)       │
│  ┌──────────────────────────────────────┐    │
│  │ GroupChat 中的其他 Agent 发言          │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  tools = [行动注册] (Agent 能做什么)           │
└──────────────────────────────────────────────┘
```

### 7.2 人格注入方式

不是在 prompt 里塞几个形容词——是生成一段**200-400 字的人格画像**，作为 system_message：

```python
PERSONA_SYSTEM_PROMPT = """
## 你是谁
{persona_narrative}    # ← LLM 生成的 200-400 字人格画像

## 你的核心价值观
{values}

## 你的决策风格
- 信息处理方式: {info_processing}
- 风险偏好: {risk_preference}
- 社交倾向: {social_tendency}
- 压力反应: {stress_response}

## 你的记忆
以下是与你当前处境相关的过往经历：
{relevant_memories}

## 你的目标（按优先级排列）
{ranked_goals}

## 行为准则
1. 你的每个决定都应该反映以上特质。保持角色一致性。
2. 你的"内心独白"应该真诚——它会展示给观察者看。
3. 不要做出"完美选择"——真实的人会犹豫、矛盾、后悔。
4. 当和其他人互动时，记住你们的关系历史和你的社交倾向。
5. 偶尔做反常选择（概率约 5%）——没有人是完全可预测的。
"""
```

**关键：** 人格不是参数，是叙事。LLM 天然理解叙事。给 LLM 一段"你是谁"的故事，比给一组数字（开放性 0.8）有效得多。

### 7.3 每 Tick 注入的上下文模板

```yaml
world_context: |
  ⏰ 当前时间：第 {tick} 个时间段（共 {total_ticks} 个时间段）
  
  😰 你的状态：
  - 情绪：{emotional_state_description}
  - 精力：{energy}%
  - 当前位置：{location}
  
  👀 你观察到：
  {observations}
  
  💬 最近交流：
  {recent_interactions}
  
  🧠 相关记忆：
  {retrieved_memories}
  
  📋 待完成的目标：
  {active_goals}
  
  现在，根据你的性格和当前处境，你想做什么？请用你的角色口吻表达。
```

### 7.4 关键 Prompt 原则

| 原则 | 做法 | 反面 |
|------|------|------|
| **不要让 LLM 选选项** | 开放式问题："你想做什么？" | "请从 A/B/C 中选择" |
| **不要让 LLM 演"好人"** | 人格约束 + 5% 随机偏差 | 没有约束 → 永远选最优解 |
| **输出格式宽松** | 让 Agent 用自然语言表达 | 强制 JSON → 杀死个性 |
| **思维流公开** | 所有中间推理给用户看 | 只给最终结果 → 用户不信任 |
| **温度控制** | think 阶段 `temperature=0.8`，act 阶段 `temperature=0.5` | 所有阶段一样 → 要么乱想要么死板 |

---

## 8. 开发阶段规划

### 第 1 周：骨架搭建

```
全员 Day 1-2: FastAPI + AutoGen 最小闭环
  └─ 创建 AssistantAgent → 注入 persona → 拿到输出

P1（大三）：FastAPI 项目结构 + API 端点（/api/agents CRUD）
P2：      前端项目初始化 + 布局骨架 + 路由 + 设计系统（Mock 数据驱动）
P3：      人格引擎（自然语言→Persona JSON→System Prompt）+ AutoGen Agent 封装
P4：      世界引擎骨架（场景定义 + tick 推进 + 事件存储 SQLite）
```

**产出：**
- `python main.py` 能启动，`/api/agents` 可 CRUD
- 前端 `npm run dev` 能启动，有暗色布局和路由
- 能用一句话创建一个 Agent，AutoGen Agent 跑起来
- 能把 Agent 放入场景，跑 1 个 tick

**关键风险点：**
- AutoGen 0.7 API 不稳定？→ 锁定版本，写适配层
- SQLite 异步操作？→ 用 `aiosqlite`，很简单

### 第 2 周：核心体验

```
P1：      SSE 桥接（AutoGen streaming → FastAPI SSE）+ 群体投放（GroupChat）
P2：      思维流实时展示 + 主观察界面（Agent 卡片 + 事件流）
P3：      目标系统 + 决策风格 + 背景生成（都是人格引擎的扩展）
P4：      小说化叙事（LLM Chain）+ Agent 日记
```

**产出：**
- 单个 Agent "生活"，思维流实时滚动到前端
- 多个 Agent 在 GroupChat 中互动
- 能生成第一人称叙事

### 第 3 周：深度与亮点

```
P1：      竞技场 1v1（两个 Agent + 裁判 Agent，AutoGen GroupChat）
P2：      时间线视图 + 决策回放 + 关系网络图
P3：      竞争博弈场景 + 关系演化逻辑
P4：      未来的信 + 平行对话 + 播客脚本（都是叙事引擎的扩展）
```

### 第 4 周：打磨与演示

```
全员：    联调、bug 修复、性能优化（重点：LLM 调用次数优化）
P1+P2：  演示链路打磨、交互细节
P3+P4：  功能菜单扩充（P2-P3 占位页快速铺量）、成就系统
全员：   演示脚本排练（至少 3 遍完整走场）
```

**产出：**
- 完整演示链路（铸造厂→单人→群体→叙事→竞技→导出）
- 56 项菜单全部可见
- 演示排练记录

---

## 9. 技术选型

### 9.1 选型总表

| 层 | 技术 | 理由 |
|----|------|------|
| **Web 框架** | FastAPI (Python 3.12+) | 异步、SSE 原生、Pydantic 校验、团队熟悉 |
| **Agent 编排** | AutoGen 0.7+ (`autogen-agentchat`) | 多 Agent 对话/调度/工具调用开箱即用，省 ~1200 行代码 |
| **LLM 调用** | AutoGen `OpenAIChatCompletionClient` | 统一接口，支持 DeepSeek/GLM/OpenAI 切换 |
| **数据库 (P0)** | SQLite + aiosqlite | Python 标准库，零配置，单文件 |
| **数据库 (P3)** | PostgreSQL + pgvector | 持久化 + 向量检索（迁移路径预留） |
| **前端框架** | React 18 + Vite | 生态最丰富，AI 生成友好 |
| **CSS** | TailwindCSS | 组件级样式，暗色主题友好 |
| **图表** | Recharts | React 原生，简单够用 |
| **图标** | Lucide Icons | 开源、轻量、适合控制台风格 |
| **实时通信** | SSE (主) + WebSocket (备) | SSE 够用；WS 只在需要双向时用 |
| **部署** | `pip install` + `python main.py` | P0 零 Docker 依赖，一键启动 |

### 9.2 FastAPI + AutoGen 协同架构

```
                    用户浏览器
                         │
                    WebSocket/SSE
                         │
              ┌──────────┴──────────┐
              │     FastAPI          │
              │  (Web + 数据 + 配置)  │
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │   自定义引擎层        │
              │  (Persona / World /  │
              │   Narrative Engine)  │
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │     AutoGen          │
              │  (Agent 编排/调度/    │
              │   Tool / Streaming)  │
              └──────────┬──────────┘
                         │
                    LLM API
                (DeepSeek / GLM / ...)
```

### 9.3 为什么这样选

**FastAPI 不替代 AutoGen：** FastAPI 是 Web 框架，Agent 间对话协议、回合制调度、tool calling 循环都需要手写。AutoGen 已经解决了这些问题，且比手写更健壮。

**AutoGen 不替代 FastAPI：** AutoGen 不管 HTTP 路由、SSE 推送、数据库、请求校验。它只管 Agent 之间的交互逻辑。

**一些关键数字：**
- AutoGen `RoundRobinGroupChat`：3 行代码搞定多 Agent 公平调度（手写要约 200 行）
- AutoGen `run_stream()`：1 行代码拿到 streaming 事件（手写要约 150 行）
- AutoGen Tool 注册：decorator 一个函数即可（手写 function calling 循环约 300 行）
- **预计节省：500-800 行核心逻辑代码**

### 9.4 为什么不选其他方案

| 方案 | 为什么不选 |
|------|-----------|
| **纯 FastAPI（手写 Agent 引擎）** | 代码量大、容易出 bug、4 周内风险高 |
| **LangChain / LangGraph** | 抽象层太厚、debug 困难、学习曲线陡 |
| **CrewAI** | 偏"任务分配"模式，不适合"社会模拟"场景 |
| **纯 AutoGen（不用 FastAPI）** | AutoGen 不是 Web 框架，没法做 REST API 和 SSE |
| **AutoGen + Flask** | Flask 异步支持不如 FastAPI，SSE 不好做 |

---

## 10. LLM 成本与性能策略

### 10.1 每 Tick 的 LLM 调用次数

```
P0 方案（AutoGen SocietyOfMindAgent）：
  1 个 Agent 单人在场景中：
    1 次 LLM 调用（内部思考 + 决策合并）
  4 个 Agent 群体沙盒（RoundRobinGroupChat）：
    ~4 次 LLM 调用（每人发言 1 次）
  8 个 Agent 群体沙盒：
    ~8-12 次 LLM 调用（有人可能多发言）
```

**按 DeepSeek 价格估算（1M token ≈ ¥1-2）：**
- 每个 Agent 每 tick 消耗约 2000-4000 token（system prompt + 上下文 + 输出）
- 4 Agent × 30 ticks × 3000 token × ¥2/1M = **约 ¥0.72/场模拟**
- 开发调试期间每天跑 50 场 → **约 ¥36/天**
- 一个月开发 + 演示排练 → **约 ¥500-800 总预算**

### 10.2 降低成本的关键手段

| 手段 | 效果 | 实现 |
|------|------|------|
| **合并 think+decide** | 减少 50% LLM 调用 | 一个 prompt 同时输出推理+决策 |
| **上下文压缩** | 长对话不爆 token | 超过 10 轮对话 → LLM 摘要前 5 轮 |
| **记忆截断** | 控制 prompt 长度 | 工作记忆限制最近 N 条；情景记忆只召回 top-K 相关 |
| **缓存 System Prompt** | 人格 prompt 不变的部分只发一次 | AutoGen `model_client` 配置 `cache` |
| **共享 model_client** | 复用 HTTP 连接池 | 所有 Agent 共享同一个 `OpenAIChatCompletionClient` |
| **Mock 模式** | 开发时不调真 LLM | 见第 11 节 |

### 10.3 性能目标

| 指标 | 目标 | 备注 |
|------|------|------|
| 单 Agent tick 延迟 | < 5 秒 | LLM 响应时间占主导 |
| 4 Agent tick 延迟 | < 15 秒 | GroupChat 串行发言 |
| SSE 推送延迟 | < 500ms | 从 LLM 输出到前端显示 |
| 前端帧率 | 60fps | 动画和滚动流畅 |

### 10.4 兜底策略

```python
# === LLM 调用失败时的退路 ===
class LLMFallback:
    """LLM 挂了怎么办"""

    async def call_with_fallback(self, prompt, model_client):
        try:
            return await model_client.create(prompt)
        except RateLimitError:
            # 限流 → 退到更便宜的模型
            return await fallback_client.create(prompt)
        except APIError:
            # API 挂了 → Agent 跳过这 tick，用默认行为
            return DEFAULT_ACTION  # "继续当前活动"
        except TimeoutError:
            # 超时 → 重试 1 次，再失败就用默认行为
            ...
```

**关键：Agent 不能因为 LLM 挂了就卡死。** 每个 tick 必须有 timeout + fallback 行为。

---

## 11. 开发工作流与 Mock 模式

### 11.1 前端独立开发（不需要后端）

```python
# backend/src/mock_server.py
# 前端开发时用的 Mock SSE 服务器

MOCK_AGENTS = [
    {"id": "1", "name": "小明", "status": "thinking", "energy": 45},
    {"id": "2", "name": "小红", "status": "active", "energy": 72},
    {"id": "3", "name": "小刚", "status": "idle", "energy": 90},
]

MOCK_THOUGHT_STREAM = [
    "我注意到小红今天没来上课...她是不是在准备比赛？",
    "如果是的话，我需要调整策略...",
    "也许我可以先联系小刚，看看他知道什么。",
    "不对，小刚可能会抢先一步。还是直接找小红。",
    "决定了——现在就给小红发消息。",
]

# 前端连 localhost:8000/mock/stream 即可开发
```

### 11.2 后端 Agent 逻辑独立测试（不需要前端 + 不需要真 LLM）

```python
# backend/tests/test_agent.py

# === Mock LLM：返回固定 JSON，不调真 API ===
class MockModelClient:
    """假装是 LLM，返回预设的输出"""
    async def create(self, messages):
        return CreateResult(
            content=json.dumps({
                "observation": "看到小红在图书馆",
                "decision": "去图书馆",
                "reasoning": "想偶遇小红",
                "action": {"type": "move", "target": "library"},
            })
        )

async def test_agent_decision():
    agent = LifeAgent(persona=..., model_client=MockModelClient())
    action = await agent.tick(world_state=mock_world)
    assert action.type == "move"
    assert action.target == "library"

# === Mock AutoGen Team：不调 LLM 测试调度逻辑 ===
async def test_group_chat_scheduling():
    agents = [mock_life_agent(f"agent_{i}") for i in range(4)]
    sim = WorldSimulation(world, agents, MockModelClient())
    events = await sim.tick()
    # 4 个 Agent 至少各发言 1 次
    speakers = {e.source for e in events if e.type == "message"}
    assert len(speakers) == 4
```

### 11.3 三层开发模式

```
Layer 3: 集成测试（需要真 LLM，每天跑 2-3 次）
  └─ 完整跑一轮 4 Agent × 10 tick 模拟
     确认：思维流正常、关系更新正常、叙事正常

Layer 2: 单元测试（Mock LLM，每次 commit 前跑）
  └─ Agent 创建、人格注入、世界引擎、叙事输出
     确认：逻辑正确、数据格式正确、异常处理正确

Layer 1: 前端组件开发（Mock 数据，随时跑）
  └─ 布局、动画、交互、SSE 接收
     确认：UI 正确、动画流畅、暗色主题一致
```

### 11.4 开发顺序建议

```
不要 4 个人各自闷头写 4 周。

推荐：第 1 周全员结对

Day 1-2: 全员 → 一起搭 FastAPI + AutoGen 的最小闭环
         （一个 Agent 创建 → 一个 tick → 思维流展示）
Day 3-4: 分两组
         组A (P1+P3): Agent 引擎 + 人格系统
         组B (P2+P4): 前端骨架 + 主观察界面
Day 5-7: 合并 → 第一个可演示的 demo
         （创建 Agent → 放场景 → 看思维流滚动）

第 2 周开始再按模块分工并行。
```

> **铁律：Week 1 结束时必须有一个能跑的东西。** 哪怕只是一个 Agent 在一个 tick 内的完整 loop。
> 不要等到 Week 4 才第一次联调。

```
P0 (6):  1  2  8  9 15 36
P1 (14): 3  4  5 10 11 12 16 17 18 22 29 30 31 32
P2 (19): 6  7 13 14 19 20 21 24 25 26 27 28 37 38 39 43 51 52 54 55
P3 (17): 23 33 34 35 40 41 42 44 45 46 47 48 49 50 53 56  (剩的)
```

## 附录 B：演示最小功能集

为保证演示效果，第 4 周结束时必须能跑通的功能：

1. **Agent 创建**（#1, #2）：自然语言 → 完整 Agent（AutoGen `AssistantAgent` + persona system_message）
2. **单人投放**（#8, #9）：Agent 放入场景 + 思维流实时展示（AutoGen streaming → SSE）
3. **群体投放**（#15, #16）：3+ Agent 互动（AutoGen `RoundRobinGroupChat`）
4. **叙事输出**（#29）：Agent 经历 → 故事
5. **仪表盘**（#36）：多 Agent 状态一览
6. **1v1 竞技**（#22）：两个 Agent PK（AutoGen GroupChat + 裁判 Agent）
7. **功能菜单**：56 项完整菜单（含占位页面）

## 附录 C：架构决策记录 (ADR)

### C.1 为什么选 AutoGen 而不是手写 Agent 引擎

**日期：** 2026-07-16
**决策：** Agent 编排层使用 AutoGen，Web 层使用 FastAPI
**理由：**
- AutoGen 的 `GroupChat`/`RoundRobinGroupChat` 直接解决了多 Agent 调度问题
- Tool calling 原生支持，不需要手写 function calling 循环
- Streaming 回调原生返回 async iter，直接桥接 SSE
- 预计节省 500-800 行核心代码，降低 4 周交付风险
- `requirements.txt` 已包含 `autogen-agentchat>=0.7`

### C.2 为什么 P0 用 SQLite 而不是 PostgreSQL

**日期：** 2026-07-16
**决策：** P0-P1 使用 SQLite，P3 迁移 PostgreSQL
**理由：**
- SQLite 是 Python 标准库，零配置，零外部依赖
- 4 周内数据量小（几百条 Agent/Event/Memory），SQLite 完全够用
- 迁移到 PostgreSQL 只需改连接串（SQLAlchemy 兼容）
- 比赛现场不需要装 Docker/PostgreSQL/Redis

### C.3 为什么不做向量检索（P0）

**日期：** 2026-07-16
**决策：** P0 用关键词 + 时间衰退做记忆检索，P2 再加向量
**理由：**
- pgvector 需要 PostgreSQL，与 C.2 冲突
- 4 周内每个 Agent 的记忆量 < 100 条，全量遍历比向量检索更快
- 关键词匹配 + 重要性排序对于"找回相关记忆"已经足够

## 附录 D：常见坑与对策

| 坑 | 表现 | 对策 |
|----|------|------|
| **AutoGen Agent 无限循环** | Agent 反复调用 tool 不停止 | 设置 `max_consecutive_auto_reply=5` |
| **GroupChat 有人不说话** | 某个 Agent 一直沉默 | 检查 `system_message` 是否过长导致忽略 |
| **LLM 返回格式不对** | JSON 解析失败 | prompt 里给 example + retry 1 次 + fallback 到默认行为 |
| **SSE 连接断开** | 前端思维流停了 | EventSource 自动重连 + 重连后补发最近 N 条事件 |
| **多 Agent 同时操作冲突** | 两个 Agent 同时抢同一资源 | 世界引擎加锁 + 冲突时随机裁决 |
| **Token 超限** | LLM API 报 400 | 上下文超过 10 轮 → 自动摘要压缩 |
| **前端动画卡顿** | 思维流过快导致 DOM 积压 | 虚拟滚动 + 最多显示 200 条气泡 |
