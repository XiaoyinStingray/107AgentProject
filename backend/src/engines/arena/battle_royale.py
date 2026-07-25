"""6–8 人自由竞争、逐阶段淘汰的大乱斗执行器。"""

import asyncio
import math

from loguru import logger

from config import settings
from engines.arena.prompts import (
    build_battle_system_prompt,
    build_battle_task,
)
from engines.arena.scoring import ArenaScorer
from models.arena import ArenaMode, ArenaResult, ArenaTranscriptEntry


class BattleRoyaleRunner:
    """运行每阶段全员发言并淘汰排名后一半的大乱斗。"""

    def __init__(self, scorer: ArenaScorer):
        """注入共享竞技裁判。"""
        self.scorer = scorer

    async def run(self, agents: list, topic: str) -> ArenaResult:
        """运行一场自由淘汰赛并返回所有阶段的完整记录。"""
        logger.info(f"BattleRoyaleRunner.run: topic={topic!r}, agents={len(agents)}")
        initial_agents = list(agents)
        survivors = list(agents)
        transcript: list[ArenaTranscriptEntry] = []
        scores: dict[str, float] = {}
        breakdowns: dict[str, dict[str, float]] = {}
        stage_reasons: list[str] = []
        stage = 0

        while len(survivors) > 1:
            stage += 1
            stage_entries = await self._run_stage(
                survivors,
                topic,
                stage,
                len(transcript),
            )
            transcript.extend(stage_entries)
            survivor_count = max(1, math.ceil(len(survivors) / 2))
            ranking = await self.scorer.rank_battle(
                topic,
                survivors,
                stage_entries,
                survivor_count,
            )
            scores.update(ranking.scores)
            breakdowns.update(ranking.score_breakdown)
            stage_reasons.append(f"第 {stage} 阶段：{ranking.reasoning}")
            survivor_ids = set(ranking.ranked_ids[:survivor_count])
            self._annotate_stage_entries(stage_entries, ranking, survivor_ids)
            survivors = [
                agent for agent in survivors if agent.id in survivor_ids
            ]
            survivors.sort(
                key=lambda agent: ranking.ranked_ids.index(agent.id)
            )

        return self._build_result(
            initial_agents,
            survivors[0],
            topic,
            stage,
            scores,
            breakdowns,
            transcript,
            stage_reasons,
        )

    @staticmethod
    def _annotate_stage_entries(
        entries: list[ArenaTranscriptEntry],
        ranking,
        survivor_ids: set[str],
    ) -> None:
        """把裁判给出的本轮名次、分数和晋级状态写回发言。"""
        positions = {
            agent_id: index + 1
            for index, agent_id in enumerate(ranking.ranked_ids)
        }
        for entry in entries:
            entry.stage_score = ranking.scores.get(entry.speaker_id)
            entry.stage_rank = positions.get(entry.speaker_id)
            entry.advanced = entry.speaker_id in survivor_ids

    @staticmethod
    def _build_result(
        initial_agents: list,
        winner,
        topic: str,
        stage: int,
        scores: dict[str, float],
        breakdowns: dict[str, dict[str, float]],
        transcript: list[ArenaTranscriptEntry],
        stage_reasons: list[str],
    ) -> ArenaResult:
        """组装包含所有参赛者快照与阶段记录的大乱斗结果。"""
        return ArenaResult(
            winner_id=winner.id,
            scores=scores,
            score_breakdown=breakdowns,
            judge_reasoning="\n".join(stage_reasons),
            transcript=transcript,
            mode=ArenaMode.BATTLE_ROYALE,
            topic=topic,
            rounds=stage,
            participant_ids=[agent.id for agent in initial_agents],
            participant_names={
                agent.id: agent.persona.name for agent in initial_agents
            },
        )

    async def _run_stage(
        self,
        agents: list,
        topic: str,
        stage: int,
        turn_offset: int,
    ) -> list[ArenaTranscriptEntry]:
        """运行当前存活者各一次发言，并保留完整身份映射。"""
        from autogen_agentchat.teams import RoundRobinGroupChat
        from autogen_core import CancellationToken

        names = [agent.persona.name for agent in agents]
        for agent in agents:
            agent.inject_context(
                build_battle_system_prompt(topic, agent.persona.name, names),
                [],
            )
        team = RoundRobinGroupChat(
            participants=[agent.autogen_agent for agent in agents],
            max_turns=len(agents),
        )
        result = await asyncio.wait_for(
            team.run(
                task=build_battle_task(topic, stage, names),
                cancellation_token=CancellationToken(),
            ),
            timeout=settings.agent_timeout_seconds * 2,
        )
        return self._collect_stage_entries(
            agents,
            result.messages,
            stage,
            turn_offset,
        )

    @staticmethod
    def _collect_stage_entries(
        agents: list,
        messages: list,
        stage: int,
        turn_offset: int,
    ) -> list[ArenaTranscriptEntry]:
        """把 AutoGen 消息转换为包含 Agent ID 的阶段记录。"""
        source_map = {
            agent.autogen_agent.name: (agent.id, agent.persona.name)
            for agent in agents
        }
        entries: list[ArenaTranscriptEntry] = []
        for message in messages:
            source = getattr(message, "source", "")
            content = getattr(message, "content", "")
            identity = source_map.get(source)
            if not identity or not content:
                continue
            entries.append(ArenaTranscriptEntry(
                turn=turn_offset + len(entries),
                round=stage,
                speaker_id=identity[0],
                speaker=identity[1],
                content=str(content),
            ))
        return entries
