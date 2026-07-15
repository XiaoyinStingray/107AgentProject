# AutoGen 参考代码

> 以下示例基于 `autogen-agentchat>=0.7`，均使用 DeepSeek/GLM 兼容接口

## 1. 基础配置

```python
import asyncio
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.teams import RoundRobinGroupChat, SelectorGroupChat
from autogen_agentchat.conditions import TextMentionTermination, MaxMessageTermination
from autogen_agentchat.messages import TextMessage
from autogen_ext.models.openai import OpenAIChatCompletionClient

# ---- DeepSeek ----
deepseek = OpenAIChatCompletionClient(
    model="deepseek-chat",
    api_key="sk-xxx",
    base_url="https://api.deepseek.com/v1",
)

# ---- GLM (智谱) ----
glm = OpenAIChatCompletionClient(
    model="glm-4-flash",
    api_key="xxx",
    base_url="https://open.bigmodel.cn/api/paas/v4/",
)

# 使用时选择其中一个即可
llm = deepseek  # 或 glm
```

---

## 2. Agent 树（Subagent 嵌套）

**场景**：总指挥 → 拆任务 → 派给子 Agent → 子 Agent 再拆 → 派给孙 Agent

```python
# 终止条件：任何人说 "DONE" 就停
done = TextMentionTermination("DONE")

# ---- 叶子节点：具体干活的 ----
coder = AssistantAgent(
    name="coder",
    model_client=llm,
    system_message="你是程序员，只写代码。完成后说 DONE。",
)

tester = AssistantAgent(
    name="tester",
    model_client=llm,
    system_message="你是测试员，检查代码是否通过测试。完成后说 DONE。",
)

writer = AssistantAgent(
    name="writer",
    model_client=llm,
    system_message="你是文档写手，输出 Markdown 文档。完成后说 DONE。",
)

# ---- 中间层：管几个子 Agent 的小组长 ----
dev_lead = SelectorGroupChat(
    participants=[coder, tester],
    model_client=llm,
    selector_prompt="""你是开发组长。
    收到需求后，先让 coder 写代码 → coder 完成后让 tester 测试。
    测试通过后回复 'DONE'。""",
    termination_condition=done,
)

# ---- 顶层：总指挥 ----
pm = AssistantAgent(
    name="pm",
    model_client=llm,
    system_message="你是项目经理。把用户需求拆成子任务，分给对应小组。完成后说 DONE。",
)

top_team = SelectorGroupChat(
    participants=[pm, dev_lead, writer],  # ← 子团队可以当成员用！
    model_client=llm,
    selector_prompt="""你是总指挥。
    根据用户需求，决定调用 dev_lead（开发）还是 writer（文档）。
    全部完成后说 DONE。""",
    termination_condition=done,
)

# 运行
async def main():
    result = await top_team.run(task="做一个命令行计算器，要求有测试和文档")
    print(result.messages)

asyncio.run(main())
```

**关键点**：`dev_lead` 本身是一个 Team，但它可以作为一个成员放进 `top_team`——这就是 Agent 树的本质，无限嵌套。

---

## 3. 多重身份（动态角色切换）

**场景**：同一个 Agent 在不同阶段扮演不同角色

```python
# 方式一：集中管理，按阶段换身份（推荐）

ROLES = {
    "分析": "你是需求分析师，分析用户意图，拆解为可执行任务。",
    "编码": "你是资深程序员，根据分析结果写代码。",
    "审查": "你是代码审查员，检查代码质量、安全性和性能。",
    "总结": "你是项目经理，汇总结果给用户。",
}

# 按阶段创建不同身份的 Agent
async def run_multi_identity(task: str):
    results = {}

    for role, system_msg in ROLES.items():
        agent = AssistantAgent(
            name=f"agent_{role}",
            model_client=llm,
            system_message=system_msg,
        )

        team = RoundRobinGroupChat(
            participants=[agent],
            termination_condition=MaxMessageTermination(max_messages=1),
        )

        context = f"任务：{task}\n"
        if results:
            context += f"前面的结果：{results}"

        result = await team.run(task=context)
        results[role] = result.messages[-1].content
        print(f"[{role}] 完成")

    return results
```

```python
# 方式二：同一个人格库，Agent 按需挑角色（适合对话场景）

personality_selector = AssistantAgent(
    name="router",
    model_client=llm,
    system_message="""你是路由 Agent。根据用户消息判断该用哪个身份回复：
    - 用户问技术问题 → 用 "专家" 身份
    - 用户问项目管理 → 用 "PM" 身份
    - 用户闲聊 → 用 "朋友" 身份
    只回复身份名称，不要多说。""",
)

expert = AssistantAgent(
    name="expert",
    model_client=llm,
    system_message="你是技术专家，回答要专业、精确。",
)

pm_agent = AssistantAgent(
    name="pm",
    model_client=llm,
    system_message="你是项目经理，关注进度、风险和资源。",
)

friend = AssistantAgent(
    name="friend",
    model_client=llm,
    system_message="你是友好的助手，回答轻松自然。",
)

async def chat_with_identity(user_msg: str):
    # 第一步：选择身份
    route_team = RoundRobinGroupChat(
        participants=[personality_selector],
        termination_condition=MaxMessageTermination(max_messages=1),
    )
    route_result = await route_team.run(task=user_msg)
    identity = route_result.messages[-1].content.strip()

    # 第二步：用对应身份回复
    agent_map = {"专家": expert, "PM": pm_agent, "朋友": friend}
    chosen = agent_map.get(identity, friend)

    reply_team = RoundRobinGroupChat(
        participants=[chosen],
        termination_condition=MaxMessageTermination(max_messages=1),
    )
    result = await reply_team.run(task=user_msg)
    return result.messages[-1].content
```

---

## 4. 内部通信模式

### 4a. 群聊（Group Chat）——所有 Agent 共享对话

```python
analyst = AssistantAgent(
    name="analyst",
    model_client=llm,
    system_message="你是分析师。分析问题并给出初步方案。完成后说 DONE。",
)

developer = AssistantAgent(
    name="developer",
    model_client=llm,
    system_message="你是开发者。根据分析师方案实现。有问题就在群聊里问。完成后说 DONE。",
)

qa = AssistantAgent(
    name="qa",
    model_client=llm,
    system_message="你是 QA。审查开发者的实现，发现问题直接指出。完成后说 DONE。",
)

# RoundRobinGroupChat：按顺序轮流发言
group_chat = RoundRobinGroupChat(
    participants=[analyst, developer, qa],
    termination_condition=done,
)

# SelectorGroupChat：由 LLM 动态决定该谁发言
smart_chat = SelectorGroupChat(
    participants=[analyst, developer, qa],
    model_client=llm,
    selector_prompt="""你是主持人。根据当前对话进度，选择最适合回应的成员。
    一般流程：先 analyst 分析 → developer 实现 → qa 审查。
    但如果 developer 有问题，可以先让 developer 追问。""",
    termination_condition=done,
)
```

### 4b. 点对点——两个 Agent 私下对话

```python
# 场景：reviewer 私下给 coder 提修改意见，用户看不到中间过程

async def private_review(code: str) -> str:
    pair_team = RoundRobinGroupChat(
        participants=[coder, tester],
        termination_condition=done,
        max_turns=6,  # 最多 6 轮，防止无限循环
    )
    result = await pair_team.run(
        task=f"审查这段代码并修复问题，直到 tester 确认通过：\n```python\n{code}\n```"
    )
    # 只返回最终结果，中间的争吵用户不用管
    return result.messages[-1].content
```

---

## 5. 完整示例：一键出项目的 Agent 树

把上面所有模式组合起来：

```python
async def build_project(requirement: str):
    """
    输入自然语言需求 → 自动出策划→开发→文档→审查的完整流水线
    """
    done = TextMentionTermination("ALL_DONE")

    # ===== 叶子 Agent =====
    planner = AssistantAgent(name="planner", model_client=llm,
        system_message="你是策划。把需求拆成具体任务清单，编号列出。完成后说 SUB_DONE。")
    coder = AssistantAgent(name="coder", model_client=llm,
        system_message="你是程序员。根据任务清单写代码。完成后说 SUB_DONE。")
    writer = AssistantAgent(name="writer", model_client=llm,
        system_message="你是文档写手。根据代码写 README 和 API 文档。完成后说 SUB_DONE。")
    reviewer = AssistantAgent(name="reviewer", model_client=llm,
        system_message="你是审查员。检查代码和文档质量，给出修改建议。通过后说 SUB_DONE。")

    # ===== 开发组（coder + reviewer 私下迭代） =====
    dev_team = SelectorGroupChat(
        participants=[coder, reviewer],
        model_client=llm,
        selector_prompt="先 coder 写代码，再由 reviewer 审查。反复修改直到 reviewer 满意。满意后说 SUB_DONE。",
        termination_condition=TextMentionTermination("SUB_DONE"),
        max_turns=10,
    )

    # ===== 顶层流水线 =====
    pipeline = SelectorGroupChat(
        participants=[planner, dev_team, writer],
        model_client=llm,
        selector_prompt="""按顺序调度：
        1. planner 做任务拆解 → SUB_DONE
        2. dev_team 写代码并审查 → SUB_DONE
        3. writer 写文档 → SUB_DONE
        全部完成后说 ALL_DONE。""",
        termination_condition=done,
    )

    result = await pipeline.run(task=requirement)
    return result.messages


# 使用
asyncio.run(build_project("做一个命令行番茄钟，支持 25+5 模式"))
```

---

## 速查表

| 你想要 | 用这个 |
|--------|--------|
| 一个 Agent 干到底 | `AssistantAgent` |
| 多个 Agent 轮流发言 | `RoundRobinGroupChat` |
| LLM 自动决定该谁说话 | `SelectorGroupChat` |
| Agent 套 Agent（子树） | 把 Team 放进另一个 Team 的 `participants` |
| 多重身份/角色切换 | 不同 `system_message` 建多个 Agent，路由选择 |
| 点对点私聊 | 单独开一个小 Team，只放两个 Agent |
| 限制轮数 | `max_turns=N` |
| 触发停止 | `TextMentionTermination("关键词")` |
