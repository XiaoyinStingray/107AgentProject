"""
TaskDecomposer — LLM 分解团队任务为子任务，按角色分配。
Step 52: LLM 优先，不可用时用规则兜底。
"""

import json as _json
import re
import asyncio
import uuid

from loguru import logger


async def decompose_task(
    task: str,
    agents: list[dict],  # [{id, name, role, mbti}]
    model_client,
) -> list[dict]:
    """将自然语言任务分解为子任务列表。

    agents: 每个 Agent 含 id, name, role（Team 角色）, mbti
    model_client: AutoGen 模型客户端

    返回: [{title, assignee, description, depends_on}]
    """
    # 构建 Agent 角色摘要（包含 ID 供 LLM 精确引用）
    agent_lines = ""
    for a in agents:
        agent_lines += f"- ID={a['id']} | {a['name']}（{a['role']}，{a['mbti']}）\n"

    prompt = f"""你是一个项目经理。请将以下团队任务分解为 3-6 个可执行的子任务，并分配给合适的团队成员。

任务：{task}

团队成员：
{agent_lines}

请返回一个 JSON 数组，每个元素包含：
- title: 子任务名称（简洁，≤15字）
- assignee: 负责人的 ID（从上面列表的 ID=xxx 中选，如果是全员协作则填 null）
- description: 子任务详细描述（一句话）

格式：[{{"title": "...", "assignee": "...", "description": "..."}}]

只返回 JSON 数组，不要其他文字。"""

    llm_steps = None
    try:
        from autogen_core.models import UserMessage
        result = await asyncio.wait_for(
            model_client.create(
                messages=[UserMessage(content=prompt, source="user")],
            ),
            timeout=20.0,
        )
        response_text = result.content if hasattr(result, "content") else str(result)
        json_match = re.search(r"\[.*\]", response_text, re.DOTALL)
        if json_match:
            llm_steps = _json.loads(json_match.group())
        else:
            llm_steps = _json.loads(response_text)
    except Exception as e:
        logger.warning(f"LLM 任务分解不可用，使用规则兜底: {e}")

    # 规则兜底：简单地将任务按角色拆开
    if not llm_steps:
        llm_steps = []
        role_tasks = {
            "产品经理": "需求分析与用户故事编写",
            "项目经理": "项目计划与里程碑制定",
            "UI/UX 设计师": "界面原型与交互设计",
            "技术架构师": "技术选型与系统架构设计",
            "前端开发": "前端页面与交互实现",
            "后端开发": "后端 API 与数据层实现",
            "测试工程师": "测试用例编写与质量验证",
            "全栈开发": "端到端功能实现",
            "算法工程师": "核心算法与模型实现",
            "数据分析师": "数据分析与洞察报告",
            "市场研究员": "市场调研与竞品分析",
            "技术写作": "技术文档与用户手册",
            "DevOps 工程师": "部署流水线与监控",
        }
        for a in agents:
            role = a.get("role", "")
            desc = role_tasks.get(role, f"负责 {task} 中与 {role} 相关的部分")
            llm_steps.append({
                "title": desc[:15],
                "assignee": a["id"],
                "description": desc,
            })
        # 加一个全员协作的收尾步骤
        llm_steps.append({
            "title": "整合交付",
            "assignee": None,
            "description": "所有成员协作整合各自产出，完成最终交付",
        })

    # 验证并补全字段
    validated = []
    for s in llm_steps:
        if isinstance(s, dict) and "title" in s:
            validated.append({
                "id": str(uuid.uuid4())[:8],
                "title": s.get("title", "")[:30],
                "assignee": s.get("assignee") or None,
                "description": s.get("description", "")[:200],
                "status": "pending",
                "progress": 0.0,
                "depends_on": s.get("depends_on", []),
            })

    if not validated:
        validated.append({
            "id": str(uuid.uuid4())[:8],
            "title": task[:20],
            "assignee": None,
            "description": task,
            "status": "pending",
            "progress": 0.0,
            "depends_on": [],
        })

    logger.info(f"Task decomposed: {len(validated)} steps for task {task[:30]!r}")
    return validated


async def re_decompose(
    remaining_steps: list[dict],
    reason: str,
    task: str = "",
    model_client=None,
) -> list[dict]:
    """Step 80: 某步失败后 LLM 重新分解剩余工作。

    保留已完成步骤的上下文，仅对剩余步骤重新规划。

    Args:
        remaining_steps: 尚未完成的步骤列表
        reason: 重规划原因（如"原方案太耗时"）
        task: 原始任务描述
        model_client: LLM 客户端

    Returns:
        重新分解后的新步骤列表（不含已完成的步骤）
    """
    if not remaining_steps:
        return []

    if model_client is None:
        # 无 LLM → 保留原步骤但降低粒度（拆分为更小步骤）
        logger.info("re_decompose: no model_client, keeping original steps")
        simplified = []
        for s in remaining_steps:
            simplified.append({**s, "status": "pending", "progress": 0.0})
        return simplified

    # LLM 重新分解
    step_titles = [s.get("title", "") for s in remaining_steps]
    prompt = (
        f"原始任务：{task or '未指定'}\n"
        f"重规划原因：{reason}\n"
        f"剩余未完成的步骤：{', '.join(step_titles)}\n\n"
        "请将这些剩余工作重新分解为更可行的子步骤（JSON 数组格式）：\n"
        '[{"title": "步骤名", "description": "详细描述", "status": "pending", "progress": 0.0}]'
    )

    try:
        import asyncio
        import json as _json
        from autogen_core.models import UserMessage

        result = await asyncio.wait_for(
            model_client.create(
                messages=[UserMessage(content=prompt, source="re_decomposer")],
            ),
            timeout=15.0,
        )
        text = result.content if hasattr(result, "content") else str(result)
        new_steps = _json.loads(text) if isinstance(text, str) else text

        if isinstance(new_steps, list) and len(new_steps) > 0:
            validated = []
            for i, s in enumerate(new_steps):
                if isinstance(s, dict) and s.get("title"):
                    validated.append({
                        "title": s.get("title", f"步骤{i+1}"),
                        "description": s.get("description", ""),
                        "assignee": s.get("assignee"),
                        "status": "pending",
                        "progress": 0.0,
                        "depends_on": s.get("depends_on", []),
                    })
            if validated:
                logger.info(
                    f"re_decompose: {len(remaining_steps)}→{len(validated)} steps "
                    f"(reason: {reason[:60]})"
                )
                return validated
    except Exception as e:
        logger.warning(f"re_decompose LLM failed: {e}")

    # Fallback: 保留原步骤
    return [{**s, "status": "pending", "progress": 0.0} for s in remaining_steps]
