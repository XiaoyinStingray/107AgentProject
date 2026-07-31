"""
PlanManager — LLM 协调器驱动的阶段门控。
Step 53: 收集对话 → 每 3 tick LLM 判定 → 推进阶段。
"""

import json as _json
import asyncio
from typing import Callable

from loguru import logger

COORDINATOR_PROMPT = """你是项目协调器。根据以下团队成员的最新对话，判断当前任务阶段是否已实质性完成。

当前阶段：{current_step}
阶段描述：{step_desc}
负责人：{assignee}

最近对话：
{conversation}

判断标准：
- 对话是否聚焦于当前阶段的任务？
- 负责该阶段的成员是否已产出明确结果或交付物？
- 如果对话明显偏离了当前阶段主题（跑题），回复 DRIFT
- 如果阶段目标已达成，回复 YES
- 如果仍在进行中，回复 NO

只回复 YES、NO 或 DRIFT。"""


class PlanManager:
    def __init__(self, steps: list[dict], on_event: Callable | None = None,
                 model_client=None):
        self.steps: list[dict] = steps
        self._on_event = on_event
        self._results: dict[str, str] = {}
        self._model_client = model_client
        self._ticks_on_step = 0
        self._recent_msgs: list[str] = []

    @property
    def all_done(self):
        return all(s.get("status") == "done" for s in self.steps)

    @property
    def progress_pct(self):
        if not self.steps: return 1.0
        return round(sum(1 for s in self.steps if s.get("status") == "done") / len(self.steps), 2)

    def current_step(self):
        for s in self.steps:
            if s.get("status") != "done": return s
        return None

    def to_dict(self):
        return {"steps": self.steps, "progress_pct": self.progress_pct, "all_done": self.all_done}

    def build_report(self):
        secs = [f"## {s.get('title','')}\n\n{self._results.get(s.get('title',''), '（未提交产出）')}" for s in self.steps]
        return {"title": "团队任务完成报告", "content": "\n\n".join(secs),
                "steps_count": len(self.steps), "completed_count": sum(1 for s in self.steps if s.get("status") == "done")}

    # ── 进度更新 ──────────────────────────────────────

    async def check_progress(self, tick: int, events: list[dict]) -> list[dict]:
        changed = []

        # 收集本 tick 对话
        for e in events:
            msg = e.get("content", "") or e.get("message", "")
            if msg and len(msg) > 10:
                self._recent_msgs.append(msg)

        # 激活第一个 pending
        if not any(s.get("status") == "active" for s in self.steps):
            for s in self.steps:
                if s.get("status") == "pending":
                    s["status"] = "active"; s["progress"] = 0.1
                    self._ticks_on_step = 0; self._recent_msgs = []
                    changed.append(s)
                    logger.info(f"Plan: step {s['title']!r} activated")
                    break

        # Agent 提交交付物 or 结束任务
        for e in events:
            action = e.get("action", "")
            if action in ("complete_step", "submit_deliverable"):
                data = e.get("data", {}) if isinstance(e.get("data"), dict) else {}
                title = data.get("step_title", "")
                result = data.get("result") or data.get("deliverable", "")
                self._complete(title, result)
                changed.append(self.current_step() or {})
            if action == "finish_task":
                # 只标记当前 active 步骤完成，不跳过未开始步骤
                step = self.current_step()
                if step and step.get("status") == "active":
                    self._complete(step.get("title", ""), "（Agent 主动标记完成）")
                    changed.append(step)

        # LLM 协调器（每 3 tick）
        self._ticks_on_step += 1
        step = self.current_step()
        if step and self._ticks_on_step >= 3 and self._model_client:
            verdict = await self._llm_check(step)
            if verdict == "yes":
                self._complete(step.get("title", ""), "（协调器判定：阶段完成）")
                changed.append(step)
            elif verdict == "drift":
                self._drift_count = getattr(self, "_drift_count", 0) + 1
                logger.warning(f"Plan: step {step['title']!r} appears off-topic (drift {self._drift_count})")
                if self._drift_count >= 3:
                    # 连续跑偏，强制结束当前步骤并激活下一个
                    self._complete(step.get("title", ""), "（协调器强制推进：对话持续偏离主题）")
                    changed.append(step)
                    self._drift_count = 0

        if changed and self._on_event:
            self._on_event("plan_updated", self.to_dict())
        if self.all_done and changed and self._on_event:
            self._on_event("report_ready", self.build_report())
        return changed

    def _complete(self, title: str, result: str):
        for s in self.steps:
            if s.get("status") == "active" and (not title or s.get("title") == title):
                s["status"] = "done"; s["progress"] = 1.0
                if result: self._results[s.get("title", "")] = result
                logger.info(f"Plan: step {s['title']!r} completed")
                self._activate_next()
                break

    def _activate_next(self):
        self._ticks_on_step = 0; self._recent_msgs = []
        for s in self.steps:
            if s.get("status") == "pending":
                s["status"] = "active"; s["progress"] = 0.1
                break

    # ── Step 80: 动态重规划 ─────────────────────────────

    def revise_plan(self, step_title: str, new_title: str, reason: str) -> dict:
        """Agent 主动修订计划步骤——由 revise_plan tool 调用。

        Args:
            step_title: 当前步骤标题（用于定位）
            new_title: 新步骤标题
            reason: 修订原因

        Returns:
            修订后的步骤 dict，如果未找到返回 None
        """
        for i, step in enumerate(self.steps):
            if step.get("title") == step_title:
                old_title = step["title"]
                history = step.get("revision_history", [])
                history.append({
                    "tick": self._ticks_on_step,
                    "reason": reason,
                    "old_title": old_title,
                    "new_title": new_title,
                })
                step["title"] = new_title
                step["revision_history"] = history
                logger.info(
                    f"PlanManager.revise_plan: '{old_title}' → '{new_title}' "
                    f"(reason: {reason[:60]})"
                )
                if self._on_event:
                    self._on_event("plan_revised", {
                        "step_index": i,
                        "old_title": old_title,
                        "new_title": new_title,
                        "reason": reason,
                        "steps": self.steps,
                    })
                return step
        return None

    def insert_step(self, after_index: int, title: str, assignee: str = "",
                    description: str = "") -> dict:
        """在指定位置后插入新步骤。"""
        new_step = {
            "title": title,
            "description": description,
            "assignee": assignee,
            "status": "pending",
            "progress": 0.0,
        }
        self.steps.insert(after_index + 1, new_step)
        logger.info(f"PlanManager.insert_step: '{title}' after index {after_index}")
        if self._on_event:
            self._on_event("plan_updated", self.to_dict())
        return new_step

    def mark_blocked(self, step_title: str, reason: str) -> dict | None:
        """标记某步骤为阻塞状态。"""
        for step in self.steps:
            if step.get("title") == step_title:
                step["status"] = "blocked"
                step["blocked_reason"] = reason
                logger.info(f"PlanManager.mark_blocked: '{step_title}' — {reason[:60]}")
                if self._on_event:
                    self._on_event("plan_revised", {
                        "step_title": step_title,
                        "status": "blocked",
                        "reason": reason,
                        "steps": self.steps,
                    })
                return step
        return None

    async def _llm_check(self, step: dict) -> str:
        """返回 'yes'（完成）、'drift'（跑偏）、'no'（继续）。"""
        conv = "\n".join(self._recent_msgs[-8:])
        if len(conv) < 30: return "no"
        prompt = COORDINATOR_PROMPT.format(
            current_step=step.get("title", ""),
            step_desc=step.get("description", ""),
            assignee=step.get("assignee") or "全员",
            conversation=conv[:2000],
        )
        try:
            from autogen_core.models import UserMessage
            result = await asyncio.wait_for(
                self._model_client.create(messages=[UserMessage(content=prompt, source="coordinator")]),
                timeout=10.0,
            )
            text = (result.content if hasattr(result, "content") else str(result)).strip().upper()
            if text.startswith("DRIFT"): return "drift"
            if text.startswith("YES"): return "yes"
            return "no"
        except Exception as e:
            logger.debug(f"Coordinator: {e}")
            return "no"
