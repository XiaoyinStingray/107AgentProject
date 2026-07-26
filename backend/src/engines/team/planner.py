"""
PlanManager — LLM 协调器驱动的阶段门控。
Step 53: 收集对话 → 每 3 tick LLM 判定 → 推进阶段。
"""

import json as _json
import asyncio
from typing import Callable

from loguru import logger

COORDINATOR_PROMPT = """你是项目协调器。根据以下团队成员的最新对话，判断当前任务阶段是否已完成。

当前阶段：{current_step}
负责人：{assignee}

最近对话：
{conversation}

标准：如果该阶段目标已被充分讨论、形成明确结论或产出，回复 YES。如果仍在讨论中，回复 NO。
只回复 YES 或 NO。"""


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
                # Agent 主动结束——标记所有步骤完成
                for s in self.steps:
                    if s.get("status") != "done":
                        s["status"] = "done"
                        s["progress"] = 1.0
                changed.append({"all_forced_done": True})
                self._ticks_on_step = 0

        # LLM 协调器（每 3 tick）
        self._ticks_on_step += 1
        step = self.current_step()
        if step and self._ticks_on_step >= 3 and self._model_client:
            ok = await self._llm_check(step)
            if ok:
                self._complete(step.get("title", ""), "（协调器判定：阶段完成）")
                changed.append(step)

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

    async def _llm_check(self, step: dict) -> bool:
        conv = "\n".join(self._recent_msgs[-8:])
        if len(conv) < 30: return False
        prompt = COORDINATOR_PROMPT.format(
            current_step=step.get("title", ""),
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
            return text.startswith("YES")
        except Exception as e:
            logger.debug(f"Coordinator: {e}")
            return False
