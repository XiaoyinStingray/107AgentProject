"""
PlanManager — 跟踪计划进度，处理 Agent 的 update_plan tool。
Step 52: 在 TeamEngine 的每个 tick 中检查进度，发射 plan_updated 事件。
"""

import json as _json
from typing import Callable

from loguru import logger


class PlanManager:
    """管理一个 Team 的任务计划，跟踪每个步骤的状态和进度。

    不直接操作 DB——由 TeamEngine 在 tick 结束时同步到 PlanRow。
    """

    def __init__(self, steps: list[dict], on_event: Callable | None = None):
        """
        steps: [{id, title, assignee, description, status, progress, depends_on}, ...]
        on_event: 回调——发射 SSE plan_updated 事件
        """
        self.steps: list[dict] = steps
        self._on_event = on_event
        self._current_step_idx = 0

    # ── 状态查询 ──────────────────────────────────────────────────

    @property
    def all_done(self) -> bool:
        return all(s.get("status") == "done" for s in self.steps)

    @property
    def progress_pct(self) -> float:
        if not self.steps:
            return 1.0
        done = sum(1 for s in self.steps if s.get("status") == "done")
        return round(done / len(self.steps), 2)

    def current_step(self) -> dict | None:
        """返回第一个未完成的步骤。"""
        for s in self.steps:
            if s.get("status") != "done":
                return s
        return None

    def to_dict(self) -> dict:
        return {
            "steps": self.steps,
            "progress_pct": self.progress_pct,
            "all_done": self.all_done,
        }

    # ── 进度更新 ──────────────────────────────────────────────────

    def check_progress(self, tick: int, agent_messages: list[str]) -> list[dict]:
        """每个 tick 结束时调用——分析 Agent 对话，更新步骤进度。

        agent_messages: 本 tick 中所有 Agent 的发言文本

        返回: 本 tick 发生变化的步骤列表（供 SSE 事件使用）
        """
        changed = []

        # 激活第一个 pending 步骤
        for s in self.steps:
            if s.get("status") == "pending":
                # 检查依赖：所有前置步骤必须 done
                deps = s.get("depends_on", [])
                deps_met = all(
                    any(d == s2["id"] and s2.get("status") == "done"
                        for s2 in self.steps)
                    for d in deps
                )
                if deps_met:
                    s["status"] = "active"
                    s["progress"] = 0.1
                    changed.append(s)
                    logger.debug(f"Plan: step {s['title']!r} activated at tick {tick}")
                break  # 一次只激活一个

        # 推进 active 步骤的进度
        joined = " ".join(agent_messages).lower()
        for s in self.steps:
            if s.get("status") != "active":
                continue
            title_keywords = s.get("title", "").lower()
            # 简单启发式：Agent 消息中提及步骤关键词 → 推进进度
            if any(kw in joined for kw in title_keywords.split() if len(kw) >= 2):
                old = s.get("progress", 0)
                s["progress"] = min(1.0, old + 0.25)
                if s["progress"] >= 1.0:
                    s["status"] = "done"
                changed.append(s)

        if changed and self._on_event:
            self._on_event("plan_updated", self.to_dict())

        return changed

    # ── Agent tool: update_plan ──────────────────────────────────

    def handle_update_plan(self, args: dict) -> str:
        """Agent 调用 update_plan tool 时触发。

        args: {action: "add"|"complete"|"reorder", step_title?: str, ...}

        返回: 给 Agent 的响应文本
        """
        action = args.get("action", "")
        step_title = args.get("step_title", "")

        if action == "complete":
            for s in self.steps:
                if s.get("title") == step_title:
                    s["status"] = "done"
                    s["progress"] = 1.0
                    if self._on_event:
                        self._on_event("plan_updated", self.to_dict())
                    return f"步骤 {step_title!r} 已标记为完成"

        if action == "add":
            new_step = {
                "id": args.get("id", "step-new"),
                "title": args.get("title", ""),
                "assignee": args.get("assignee"),
                "description": args.get("description", ""),
                "status": "pending",
                "progress": 0.0,
                "depends_on": args.get("depends_on", []),
            }
            self.steps.append(new_step)
            if self._on_event:
                self._on_event("plan_updated", self.to_dict())
            return f"新增步骤: {new_step['title']}"

        return f"未知的 plan 操作: {action}"
