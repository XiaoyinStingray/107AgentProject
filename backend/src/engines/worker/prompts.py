"""
Agent 决策 Prompt 模板 — Worker 引擎的核心协议。

设计约束:
  - Agent 输出必须是严格 JSON，不包含额外文字。
    这是从 Team 模式学到的关键教训——GroupChat 中 Agent 的自由文本
    发言模式导致解析不可控。Worker 模式强制结构化输出。
  - JSON 字段名在 Phase 22 冻结，后续实现不得修改。
  - 工具列表从 ToolSpec 注册表动态生成，不在 prompt 中硬编码。

Phase 22: 定义 prompt 模板和决策 JSON schema。
Phase 23: 实现 build_decision_prompt() 等构建函数。
"""

from engines.worker.tools import build_tool_list_text, ToolSpec


# =============================================================================
# 系统 Prompt
# =============================================================================

WORKER_SYSTEM_PROMPT = """你是一个自主工作 Agent。你的职责是：接收用户任务，制定计划，逐步执行，产出可交付的文件。

## 工作方式
1. 理解任务 → 制定步骤计划
2. 逐步执行 → 每步使用工具（搜索、编码、读写文件）
3. 反思结果 → 不满意则调整计划或重试
4. 产出文件 → 所有结果保存到工作区文件中

## 关键规则
- **产出文件是核心目标。** 你不是在聊天——你是在工作。每次任务结束前必须把成果写入文件。
- **最多 20 步。** 请合理分配，不要在前 3 步用完所有配额。
- **诚实。** 如果搜索无结果或代码运行失败，如实报告并尝试替代方案。
- **简洁决策。** 每步只做一个操作。不要一次尝试做太多事情。
- **JSON 格式输出。** 你的回复必须是纯 JSON——不要输出任何其他内容。"""


# =============================================================================
# 决策 Prompt 模板
# =============================================================================

DECISION_PROMPT_TEMPLATE = """你正在完成一项任务。当前是第 {step_index} 步。

## 任务
{task}

## 你的计划
{plan_summary}

## 已完成步骤
{completed_steps}

## 工作区文件
{file_list}

## 上一步操作
操作: {last_action}
结果: {last_result}

{tool_list}

现在请决定下一步。你必须用以下 JSON 格式回复（**不要输出其他内容**，只输出 JSON）:

{{
  "decision": "tool_call" | "deliverable" | "done",
  "tool_name": "web_search" | "run_python" | "write_file" | "read_file" | "list_files" | null,
  "tool_args": {{...}} | null,
  "deliverable_summary": "..." | null,
  "reason": "为什么做这个决定（一句话）"
}}

规则:
- 如果是第 1 步，必须先制定计划（在 reason 中简述你的执行计划，然后选择 tool_call 开始第一步）
- 如果上一步结果不符合预期，考虑调整后续步骤（在 reason 中说明调整方案）
- 如果所有子任务完成且产出物已保存到文件中，选择 done
- 选择 deliverable 表示当前阶段有阶段性产出物需要保存
- 最多 20 步，请合理分配"""


# =============================================================================
# 计划提示（第 1 步专用）
# =============================================================================

PLANNING_HINT = """这是第 1 步。请先在 reason 中列出一个简洁的执行计划（如："计划：1.搜索资料 2.分析数据 3.撰写报告"），
然后选择 tool_call 开始执行第一步。"""


# =============================================================================
# JSON 解析容错提示（解析失败重试时追加）
# =============================================================================

RETRY_HINT = """
⚠️ 你的上一条回复不是合法的 JSON。请确保：
1. 只输出 JSON 对象，不要有任何其他文字（包括解释、问候语、Markdown 标记）
2. 所有字符串用双引号 ""
3. 不要尾随逗号
4. 确保花括号配对"""


# =============================================================================
# 反思 Prompt 模板
# =============================================================================

REFLECTION_PROMPT_TEMPLATE = """你上一步执行了工具 **{tool_name}**，结果如下：

{result_summary}

请评估：
1. 上一步结果是否满足预期？
2. 后续计划是否需要调整？
3. 下一步应该做什么？

用以下 JSON 格式回复（**只输出 JSON**）:

{{
  "satisfied": true | false,
  "plan_changed": true | false,
  "thought": "你的反思（一句话）",
  "next_action": "continue" | "revise" | "done"
}}"""


# =============================================================================
# 构建函数
# =============================================================================

def build_decision_prompt(
    step_index: int,
    task: str,
    plan_summary: str,
    completed_steps: str,
    file_list: str,
    last_action: str,
    last_result: str,
    tools: list[ToolSpec] | None = None,
) -> str:
    """构建 Agent 决策 prompt。"""
    from engines.worker.tools import WORKER_TOOLS as DEFAULT_TOOLS

    tool_list = build_tool_list_text(tools or DEFAULT_TOOLS)

    prompt = DECISION_PROMPT_TEMPLATE.format(
        step_index=step_index,
        task=task,
        plan_summary=plan_summary,
        completed_steps=completed_steps,
        file_list=file_list or "（空）",
        last_action=last_action or "（无——这是第一步）",
        last_result=last_result or "（无）",
        tool_list=tool_list,
    )

    if step_index == 1:
        prompt += f"\n\n{PLANNING_HINT}"

    return prompt


def build_reflection_prompt(tool_name: str, result_summary: str) -> str:
    """构建 Agent 反思 prompt。"""
    return REFLECTION_PROMPT_TEMPLATE.format(
        tool_name=tool_name,
        result_summary=result_summary[:1000],
    )
