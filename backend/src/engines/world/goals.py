"""Goal progress evaluation mixed into WorldEngine."""

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from loguru import logger

from models.event import SimEvent


class WorldGoalMixin:
    """Evaluate Agent goal progress and emit goal-update events."""

    world: Any
    agents: dict[str, Any]
    current_tick: int
    _act_model_client: Any

    async def _update_goal_progress(
        self,
        tick_events: list[SimEvent],
    ) -> list[SimEvent]:
        """Use one batched LLM check per active Agent every two ticks."""
        if self.current_tick % 2 != 0:
            return []
        goal_events: list[SimEvent] = []
        for agent in self.agents.values():
            active_goals = [
                goal
                for goal in getattr(agent, "goals", [])
                if goal.status in ("active", "in_progress")
            ]
            text = self._agent_tick_text(agent.id, tick_events)
            if not active_goals or not text:
                continue
            scores = await self._llm_check_goals(
                agent.persona.name or agent.id,
                active_goals,
                text,
            )
            goal_events.extend(
                self._apply_goal_scores(agent, active_goals, scores)
            )
        return goal_events

    @staticmethod
    def _agent_tick_text(agent_id: str, events: list[SimEvent]) -> str:
        """Return a bounded text sample produced by one Agent this tick."""
        texts = [
            str(event.data.get("content", event.description))
            for event in events
            if event.source_agent_id == agent_id
            and event.type in ("thought_stream", "agent_message")
        ]
        return " ".join(texts)[:800]

    def _apply_goal_scores(
        self,
        agent: Any,
        goals: list[Any],
        scores: dict[str, float],
    ) -> list[SimEvent]:
        """Apply accepted scores and return user-visible progress events."""
        events: list[SimEvent] = []
        for goal in goals:
            score = scores.get(goal.description, 0.0)
            if score <= 0.5:
                continue
            old_progress = goal.progress
            goal.progress = min(1.0, goal.progress + score)
            goal.status = "achieved" if goal.progress >= 1.0 else "in_progress"
            if goal.status != "in_progress" or old_progress == 0:
                self._log_goal_progress(agent, goal, score)
                events.append(self._make_goal_event(agent, goal))
        return events

    @staticmethod
    def _log_goal_progress(agent: Any, goal: Any, score: float) -> None:
        """Log a goal's first visible advancement or completion."""
        logger.info(
            f"Goal progress: agent={agent.id} goal='{goal.description}' "
            f"status={goal.status} progress={goal.progress:.2f} score={score:.2f}"
        )

    def _make_goal_event(self, agent: Any, goal: Any) -> SimEvent:
        """Build one goal_update event from the updated Goal object."""
        display_name = agent.persona.name or agent.id
        description = (
            f"🎉 {display_name} 达成目标「{goal.description}」！"
            if goal.status == "achieved"
            else f"🎯 {display_name} 推进目标「{goal.description}」"
            f"({goal.progress:.0%})"
        )
        return SimEvent(
            id=str(uuid.uuid4()),
            world_id=self.world.id,
            tick=self.current_tick,
            type="goal_update",
            source_agent_id=agent.id,
            target_agent_ids=[],
            description=description,
            data={
                "goal_id": goal.id,
                "description": goal.description,
                "status": goal.status,
                "progress": goal.progress,
            },
            created_at=datetime.now(timezone.utc).isoformat(),
        )

    async def _llm_check_goals(
        self,
        name: str,
        goals: list[Any],
        text: str,
    ) -> dict[str, float]:
        """Ask the act-profile model to score progress for several goals."""
        if not goals or not text:
            return {}
        try:
            client = self._act_model_client or self._create_act_model_client()
            result = await self._request_goal_scores(
                client,
                self._build_goal_prompt(name, goals, text),
            )
            return self._parse_goal_scores(str(result.content), goals)
        except Exception as error:
            logger.warning(f"_llm_check_goals failed for agent={name}: {error}")
            return {}

    @staticmethod
    def _create_act_model_client():
        """Create an act-profile client when none was injected."""
        from llm.client import create_model_client

        return create_model_client("act")

    @staticmethod
    async def _request_goal_scores(client: Any, prompt: str):
        """Send one structured goal-scoring request."""
        from autogen_core.models import UserMessage

        return await client.create(
            messages=[UserMessage(content=prompt, source="goal_checker")],
            json_output=True,
        )

    @staticmethod
    def _build_goal_prompt(name: str, goals: list[Any], text: str) -> str:
        """Build the conservative batch goal-scoring instruction."""
        goal_list = "\n".join(
            f"{index + 1}. {goal.description}"
            for index, goal in enumerate(goals)
        )
        return (
            f"Agent「{name}」有以下目标：\n{goal_list}\n\n"
            f"Agent 最近的发言/思考：\n{text}\n\n"
            "对每个目标，判断 Agent 是否在推进它。返回 JSON 数组：\n"
            '[{"index":1,"score":0.0}, ...]\n'
            "score: 0=完全无关, 0.3=间接提及, 0.5=明确在推进, "
            "0.8=接近完成, 1.0=已经达成。\n"
            "严格保守打分——Agent 必须正在采取实际行动推进目标才能≥0.5，"
            "仅口头提及不算。\n"
            "只返回 JSON 数组，不要其他文字。"
        )

    @staticmethod
    def _parse_goal_scores(raw: str, goals: list[Any]) -> dict[str, float]:
        """Parse a goal-scoring JSON response into description-score pairs."""
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
        items = json.loads(cleaned)
        if not isinstance(items, list):
            logger.warning(
                "_parse_goal_scores expected list, "
                f"got {type(items).__name__}: {cleaned[:120]}"
            )
            return {}
        scores: dict[str, float] = {}
        for item in items:
            if not isinstance(item, dict) or "index" not in item:
                continue
            index = int(item["index"]) - 1
            if 0 <= index < len(goals):
                scores[goals[index].description] = float(item.get("score", 0.0))
        return scores
