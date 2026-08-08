"""
RoleEvolution — 角色动态演化引擎（Step 67）。

每完成一个 PlanStep，LLM 评估各成员贡献质量 → 调整角色权重。
例如：INTJ 做技术方案很强但沟通差 → 角色从「开发」转为「技术顾问」。
"""

from loguru import logger


ROLE_TEMPLATES = [
    {"id": "pm",        "label": "产品经理", "traits": "统筹、规划、沟通"},
    {"id": "dev",       "label": "开发",      "traits": "技术实现、编码"},
    {"id": "design",    "label": "设计师",    "traits": "视觉、体验、创意"},
    {"id": "analyst",   "label": "分析师",    "traits": "数据、研究、逻辑"},
    {"id": "advisor",   "label": "技术顾问",  "traits": "专业建议、评审"},
    {"id": "writer",    "label": "文档撰写",  "traits": "文字表达、整理"},
    {"id": "critic",    "label": "质量把关",  "traits": "挑刺、优化、风险控制"},
    {"id": "member",    "label": "成员",      "traits": "通用协作"},
]


async def evaluate_and_evolve(
    agents: list[dict],
    completed_step: dict,
    recent_messages: list[str],
    model_client,
) -> dict:
    """评估 Agent 在已完成步骤中的表现，返回角色调整建议。

    返回: {
        "evolutions": [{agent_id, name, old_role, new_role, reason, ...}],
        "step_title": str,
    }
    """
    if not model_client or len(agents) < 2:
        return {"evolutions": [], "step_title": completed_step.get("title", "")}

    # 构建评估 prompt
    agent_list = "\n".join(
        f"- {a['name']} (当前角色: {a.get('role','成员')}, MBTI: {a.get('mbti','')})"
        for a in agents
    )
    messages_sample = "\n".join(recent_messages[-8:]) if recent_messages else "（无对话记录）"

    prompt = f"""你是团队观察者。以下团队刚完成了子任务「{completed_step.get("title", "")}」。
请根据成员在讨论中的表现，判断是否需要调整角色分配。

## 团队成员
{agent_list}

## 最近讨论摘要
{messages_sample}

## 可选角色
{_format_role_list()}

## 评估要求
对每个有显著表现偏离的成员提出调整建议（可能不需要调整所有人）：
1. 是否展现了超出当前角色的能力？
2. 是否在当前角色上表现不佳？
3. 建议的新角色是什么？为什么？

返回 JSON 数组（只包含需要调整的成员），格式：
[{{"agent_id":"xxx","name":"xxx","old_role":"xxx","new_role":"xxx","reason":"xxx"}}]

如果不需要调整任何人，返回空数组 []。只返回 JSON，不要任何其他文字。"""

    try:
        import asyncio
        from autogen_core.models import UserMessage
        from autogen_core import CancellationToken

        response = await asyncio.wait_for(
            model_client.create(
                messages=[UserMessage(content=prompt, source="role_evolution")],
                cancellation_token=CancellationToken(),
            ),
            timeout=12.0,
        )
        text = response.content if isinstance(response.content, str) else str(response.content)
        text = text.strip()

        # 解析 JSON
        import json as _json
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        evolutions = _json.loads(text)
        if not isinstance(evolutions, list):
            evolutions = []

        # 校验 + 补充字段
        for ev in evolutions:
            ev["step_title"] = completed_step.get("title", "")
            logger.info(
                f"[role_evo] {ev.get('name','?')}: {ev.get('old_role','?')} → {ev.get('new_role','?')} "
                f"({ev.get('reason','')[:40]})"
            )

        return {"evolutions": evolutions, "step_title": completed_step.get("title", "")}

    except Exception as e:
        logger.warning(f"[role_evo] LLM evaluation failed: {e}")
        return {"evolutions": [], "step_title": completed_step.get("title", "")}


def apply_evolution(agents: list[dict], evolutions: list[dict]) -> list[dict]:
    """将演化结果应用到 Agent 角色上。返回变更列表。"""
    changes = []
    evo_map = {e["agent_id"]: e for e in evolutions}
    for agent in agents:
        ev = evo_map.get(agent["id"])
        if ev:
            old = agent.get("role", "成员")
            new = ev.get("new_role", old)
            agent["role"] = new
            changes.append({
                "agent_id": agent["id"],
                "name": agent.get("name", ""),
                "old_role": old,
                "new_role": new,
                "reason": ev.get("reason", ""),
            })
    return changes


def _format_role_list() -> str:
    return "\n".join(
        f"  {r['id']}: {r['label']}（{r['traits']}）"
        for r in ROLE_TEMPLATES
    )
