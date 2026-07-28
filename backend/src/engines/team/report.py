"""
TeamReportGenerator — 团队复盘报告生成。
Step 55: LLM 分析事件 → 结构化报告（Markdown）。Mock LLM 不可用时用规则兜底。
"""

import asyncio
import json as _json
import re

from loguru import logger


async def generate_report(
    task: str,
    steps: list[dict],
    events: list[dict],
    model_client=None,
) -> dict:
    """生成团队复盘报告。

    task: 原始任务描述
    steps: Plan 步骤列表（含 status, title, assignee）
    events: World 运行期间的事件列表
    model_client: AutoGen 模型客户端（可选，None 则走规则兜底）

    返回: {title, content, key_decisions, strategy_summary, collaboration_analysis}
    """
    # 提取关键事件
    key_events = _extract_key_events(events)

    # 构建报告数据
    steps_done = [s for s in steps if s.get("status") == "done"]
    steps_total = len(steps)
    steps_done_count = len(steps_done)

    # LLM 生成报告
    llm_report = None
    if model_client:
        llm_report = await _llm_generate(task, steps, key_events, model_client)

    if llm_report:
        return llm_report

    # 规则兜底
    return _rule_based_report(task, steps, key_events, steps_done_count, steps_total)


def _extract_key_events(events: list[dict]) -> list[dict]:
    """从事件流中提取关键决策事件。"""
    key_types = {"agent_action", "agent_message", "plan_updated", "tool_call"}
    return [
        e for e in events
        if e.get("type") in key_types and (e.get("content") or e.get("description"))
    ][:30]  # 最多取 30 条


async def _llm_generate(
    task: str,
    steps: list[dict],
    key_events: list[dict],
    model_client,
) -> dict | None:
    """调 LLM 生成结构化报告。"""
    steps_text = "\n".join(
        f"- [{s.get('status', '?')}] {s.get('title', '')} → {s.get('assignee') or '全员'}"
        for s in steps
    )
    events_text = "\n".join(
        f"[{e.get('tick', '?')}] {e.get('type', '')}: {(e.get('content') or e.get('description', ''))[:120]}"
        for e in key_events
    )[:2000]

    prompt = f"""你是一个团队协作分析师。请根据以下团队任务执行记录，生成一份复盘报告。

任务：{task}

步骤执行情况：
{steps_text}

关键事件（最近 {len(key_events)} 条）：
{events_text}

请返回 JSON 格式：
{{
  "title": "报告标题",
  "content": "Markdown 格式完整报告（含任务摘要、关键决策点、策略总结、协作分析）",
  "key_decisions": ["决策1", "决策2", "决策3"],
  "strategy_summary": "策略总结（一段话）",
  "collaboration_analysis": "协作分析（一段话）"
}}

只返回 JSON，不要其他文字。"""

    try:
        from autogen_core.models import UserMessage
        result = await asyncio.wait_for(
            model_client.create(
                messages=[UserMessage(content=prompt, source="reporter")],
            ),
            timeout=25.0,
        )
        text = result.content if hasattr(result, "content") else str(result)
        json_match = re.search(r"\{.*\}", text, re.DOTALL)
        if json_match:
            report = _json.loads(json_match.group())
            if isinstance(report, dict) and "content" in report:
                # 确保所有字段存在
                report.setdefault("title", "团队复盘报告")
                report.setdefault("key_decisions", [])
                report.setdefault("strategy_summary", "")
                report.setdefault("collaboration_analysis", "")
                return report
    except Exception as e:
        logger.warning(f"LLM 报告生成不可用，使用规则兜底: {e}")

    return None


def _rule_based_report(
    task: str,
    steps: list[dict],
    key_events: list[dict],
    steps_done: int,
    steps_total: int,
) -> dict:
    """规则兜底——基于数据生成简单报告。"""
    pct = round(steps_done / steps_total * 100) if steps_total else 0

    # 提取关键决策（取前 5 个 agent_action 事件）
    decisions = []
    for e in key_events:
        if e.get("type") == "agent_action":
            desc = (e.get("content") or e.get("description", ""))[:80]
            if desc:
                decisions.append(desc)
        if len(decisions) >= 5:
            break

    steps_md = "\n".join(
        f"- {'✅' if s.get('status') == 'done' else '⏳'} {s.get('title', '')}"
        for s in steps
    )

    content = f"""# 团队复盘报告

## 任务摘要
- **任务**: {task}
- **完成度**: {steps_done}/{steps_total} ({pct}%)

## 步骤执行
{steps_md}

## 关键决策点
{chr(10).join(f"- {d}" for d in decisions) if decisions else '- （无关键事件记录）'}

## 策略总结
任务完成度 {pct}%。共记录 {len(key_events)} 条关键事件。

## 协作分析
因 LLM 不可用，协作分析基于规则生成。建议重新执行以获取 LLM 深度分析。
"""

    return {
        "title": "团队复盘报告",
        "content": content,
        "key_decisions": decisions,
        "strategy_summary": f"任务完成度 {pct}%，共 {len(key_events)} 条关键事件。",
        "collaboration_analysis": "LLM 不可用，协作分析暂缺。",
    }
