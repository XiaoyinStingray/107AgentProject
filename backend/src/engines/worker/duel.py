"""
DuelEngine — Step 100b: 双 Worker 并行 + 实时评分 + SSE 合并流。

两个 Agent 面对同一个任务，左右分屏同时执行。
每完成一步就更新比分。

评分维度（实时）:
  - 搜索质量: +5 每次成功搜索, +10 被后续引用, -5 无效重复
  - 步骤效率: 初始50, +3 实质产出, -2 连续空想
  - 自检质量: +10 发现并修正错误 / 反思不满意, +5 标注局限 / 调整计划 / 反思含自检关键词
"""

import asyncio
import json
import time
from collections.abc import AsyncGenerator

from loguru import logger

from engines.worker.engine import AgentWorker
from engines.worker.workspace import LocalWorkspace


# =============================================================================
# 评分器
# =============================================================================

class DuelScorer:
    """实时评分——每完成一个步骤就更新。"""

    def __init__(self, side: str):
        self.side = side
        self.search_quality = 50
        self.step_efficiency = 50
        self.self_check = 50
        self.total_steps = 0
        self.search_terms: list[str] = []
        self.consecutive_think = 0  # 连续只思考不行动

    def on_step(self, event: dict) -> dict:
        """处理一个 worker SSE 事件，更新分数。返回当前分数。"""
        etype = event.get("type", "")
        data = event.get("data", {})

        if etype == "worker.tool_start":
            self.total_steps += 1
            tool = data.get("tool_name", "")
            if tool == "web_search":
                self.search_quality += 5
                self.consecutive_think = 0
            elif tool in ("write_file", "run_python", "install_package"):
                self.step_efficiency += 3
                self.consecutive_think = 0

        elif etype == "worker.tool_result":
            result = data.get("result_summary", "")
            if "✅" in result or "已写入" in result or "已安装" in result:
                self.step_efficiency += 2
            if data.get("success") is False:
                self.step_efficiency -= 5

        elif etype == "worker.step_decision":
            reason = data.get("reason", "")
            if any(kw in reason for kw in ["修正", "改正", "错误", "不对", "数据矛盾", "修正数据"]):
                self.self_check += 10
                self.consecutive_think = 0
            elif any(kw in reason for kw in ["局限", "不足", "待完善", "进一步"]):
                self.self_check += 5
                self.consecutive_think = 0

        elif etype == "worker.reflection":
            # 反思事件是自检的核心信号源
            satisfied = data.get("satisfied", True)
            plan_changed = data.get("plan_changed", False)
            thought = data.get("thought", "")

            if satisfied is False:
                # Agent 对上一步结果不满意——发现问题的核心信号
                self.self_check += 10
                self.consecutive_think = 0
            elif plan_changed is True:
                # Agent 主动调整后续计划——适应性自检
                self.self_check += 5
                self.consecutive_think = 0
            elif any(kw in thought for kw in [
                "修正", "改正", "错误", "不对", "矛盾", "不足",
                "局限", "待完善", "进一步", "调整", "重新", "改进",
                "问题", "缺陷", "遗漏", "补充",
            ]):
                # 反思内容包含自检关键词
                self.self_check += 5
                self.consecutive_think = 0

        elif etype == "worker.thought":
            thought = data.get("thought", "")
            if "[决策]" not in thought and "[计划]" not in thought and "[反思]" not in thought:
                self.consecutive_think += 1
                if self.consecutive_think >= 3:
                    self.step_efficiency -= 2

        # clamp
        self.search_quality = max(0, min(100, self.search_quality))
        self.step_efficiency = max(0, min(100, self.step_efficiency))
        self.self_check = max(0, min(100, self.self_check))

        return {
            f"{self.side}_search": self.search_quality,
            f"{self.side}_efficiency": self.step_efficiency,
            f"{self.side}_selfcheck": self.self_check,
            f"{self.side}_steps": self.total_steps,
        }


# =============================================================================
# DuelEngine
# =============================================================================

async def run_duel(
    agent_a,
    agent_b,
    task: str,
    max_steps: int = 20,
) -> AsyncGenerator[str, None]:
    """并行运行两个 Worker，合并 SSE 流。

    SSE 事件格式:
      { type: "duel.event", side: "a"|"b", worker_event: {...} }
      { type: "duel.score", scores: { a_search, a_efficiency, ..., b_search, ... } }
      { type: "duel.done", winner: "a"|"b"|"draw", final_scores: {...}, summary: "..." }
    """
    import uuid
    from pathlib import Path

    run_id = f"duel-{uuid.uuid4().hex[:8]}"
    base = str(Path.home() / "workspaces")

    # 创建两个独立工作区
    ws_a = LocalWorkspace(base, f"{run_id}-a")
    ws_b = LocalWorkspace(base, f"{run_id}-b")

    worker_a = AgentWorker(agent=agent_a, workspace=ws_a)
    worker_b = AgentWorker(agent=agent_b, workspace=ws_b)

    name_a = agent_a.persona.name if hasattr(agent_a, 'persona') else "Agent A"
    name_b = agent_b.persona.name if hasattr(agent_b, 'persona') else "Agent B"

    scorer_a = DuelScorer("a")
    scorer_b = DuelScorer("b")

    logger.info(f"Duel started: {name_a} vs {name_b}, task='{task[:60]}'")

    # 初始事件
    yield _sse({
        "type": "duel.started",
        "run_id": run_id,
        "agent_a": name_a,
        "agent_b": name_b,
        "task": task,
    })

    # 收集事件 + 评分队列
    queue_a: asyncio.Queue = asyncio.Queue()
    queue_b: asyncio.Queue = asyncio.Queue()
    done_a = False
    done_b = False
    score = {}

    async def runner(worker: AgentWorker, queue: asyncio.Queue):
        try:
            async for event in worker.execute(task):
                await queue.put(event)
        except Exception as e:
            logger.error(f"Duel runner error: {e}")
        await queue.put(None)  # 结束信号

    # 并行启动两个 Worker
    task_a = asyncio.create_task(runner(worker_a, queue_a))
    task_b = asyncio.create_task(runner(worker_b, queue_b))

    # 合并事件循环
    pending_a: list[str] = []
    pending_b: list[str] = []
    _last_score: dict = {}

    while not (done_a and done_b):
        # 从两边各取一条事件
        try:
            ev_a = await asyncio.wait_for(queue_a.get(), timeout=0.1)
            if ev_a is not None:
                parsed = _parse_sse(ev_a)
                if parsed:
                    score.update(scorer_a.on_step(parsed))
                    yield _sse({"type": "duel.event", "side": "a", "worker_event": parsed})
                pending_a.append(ev_a)
            else:
                done_a = True
        except asyncio.TimeoutError:
            pass

        try:
            ev_b = await asyncio.wait_for(queue_b.get(), timeout=0.1)
            if ev_b is not None:
                parsed = _parse_sse(ev_b)
                if parsed:
                    score.update(scorer_b.on_step(parsed))
                    yield _sse({"type": "duel.event", "side": "b", "worker_event": parsed})
                pending_b.append(ev_b)
            else:
                done_b = True
        except asyncio.TimeoutError:
            pass

        # 只在分数变化时推送比分（防 SSE 刷屏）
        if score and score != _last_score:
            yield _sse({"type": "duel.score", "scores": dict(score)})
            _last_score = dict(score)

        # 如果一个完成、另一个还在跑，最多再等 30s
        if done_a and not done_b:
            try:
                ev_b = await asyncio.wait_for(queue_b.get(), timeout=30)
                if ev_b is not None:
                    parsed = _parse_sse(ev_b)
                    if parsed:
                        score.update(scorer_b.on_step(parsed))
                        yield _sse({"type": "duel.event", "side": "b", "worker_event": parsed})
                else:
                    done_b = True
            except asyncio.TimeoutError:
                done_b = True
        elif done_b and not done_a:
            try:
                ev_a = await asyncio.wait_for(queue_a.get(), timeout=30)
                if ev_a is not None:
                    parsed = _parse_sse(ev_a)
                    if parsed:
                        score.update(scorer_a.on_step(parsed))
                        yield _sse({"type": "duel.event", "side": "a", "worker_event": parsed})
                else:
                    done_a = True
            except asyncio.TimeoutError:
                done_a = True

    # 等待两个 task 完成
    await asyncio.gather(task_a, task_b, return_exceptions=True)

    # 最终判定
    a_total = scorer_a.search_quality + scorer_a.step_efficiency + scorer_a.self_check
    b_total = scorer_b.search_quality + scorer_b.step_efficiency + scorer_b.self_check

    if a_total > b_total:
        winner = "a"
    elif b_total > a_total:
        winner = "b"
    else:
        winner = "draw"

    final_scores = {
        "a": {
            "name": name_a,
            "search_quality": scorer_a.search_quality,
            "step_efficiency": scorer_a.step_efficiency,
            "self_check": scorer_a.self_check,
            "total_steps": scorer_a.total_steps,
            "total": a_total,
        },
        "b": {
            "name": name_b,
            "search_quality": scorer_b.search_quality,
            "step_efficiency": scorer_b.step_efficiency,
            "self_check": scorer_b.self_check,
            "total_steps": scorer_b.total_steps,
            "total": b_total,
        },
    }

    # LLM 简短评语
    summary = (
        f"{name_a} 搜索{scorer_a.search_quality}分 效率{scorer_a.step_efficiency}分 自检{scorer_a.self_check}分 | "
        f"{name_b} 搜索{scorer_b.search_quality}分 效率{scorer_b.step_efficiency}分 自检{scorer_b.self_check}分 | "
        f"胜者: {name_a if winner == 'a' else name_b if winner == 'b' else '平局'}"
    )

    yield _sse({
        "type": "duel.done",
        "winner": winner,
        "final_scores": final_scores,
        "summary": summary,
    })

    logger.info(f"Duel done: winner={winner}, scores a={a_total} b={b_total}")


def _sse(data: dict) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _parse_sse(sse_str: str) -> dict | None:
    """解析 SSE 字符串为 dict。"""
    if sse_str.startswith("data: "):
        try:
            return json.loads(sse_str[6:])
        except json.JSONDecodeError:
            pass
    return None
