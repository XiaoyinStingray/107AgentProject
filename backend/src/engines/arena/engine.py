"""ArenaEngine — 统一运行 1v1 三模式与 6–8 人大乱斗。"""

import asyncio

from loguru import logger

from config import settings
from engines.arena.battle_royale import BattleRoyaleRunner
from engines.arena.prompts import (
    build_duel_system_prompt,
    build_duel_task,
    build_judge_system_prompt,
)
from engines.arena.scoring import ArenaScorer
from models.arena import (
    ArenaMode,
    ArenaResult,
    ArenaTranscriptEntry,
)


class ArenaEngine:
    """竞技引擎门面，保持 Step 26 的公开调用方式。"""

    def __init__(self, model_client):
        """注入共享 LLM 客户端并创建裁判和大乱斗执行器。"""
        self.model_client = model_client
        self.scorer = ArenaScorer(model_client)
        self.battle_runner = BattleRoyaleRunner(self.scorer)
        logger.info("ArenaEngine created")

    async def run_debate(
        self,
        agent_a,
        agent_b,
        topic: str,
        rounds: int = 3,
    ) -> ArenaResult:
        """运行按轮数分配超时预算的辩论赛。"""
        return await self._run_duel_with_timeout(
            ArenaMode.DEBATE,
            agent_a,
            agent_b,
            topic,
            rounds,
        )

    async def run_interview(
        self,
        agent_a,
        agent_b,
        topic: str,
        rounds: int = 3,
    ) -> ArenaResult:
        """运行按轮数分配超时预算的面试竞争。"""
        return await self._run_duel_with_timeout(
            ArenaMode.INTERVIEW,
            agent_a,
            agent_b,
            topic,
            rounds,
        )

    async def run_pitch(
        self,
        agent_a,
        agent_b,
        topic: str,
        rounds: int = 3,
    ) -> ArenaResult:
        """运行按轮数分配超时预算的创业路演。"""
        return await self._run_duel_with_timeout(
            ArenaMode.PITCH,
            agent_a,
            agent_b,
            topic,
            rounds,
        )

    async def run_battle_royale(
        self,
        agents: list,
        topic: str,
    ) -> ArenaResult:
        """运行 6–8 人自由竞争、逐阶段淘汰的大乱斗。"""
        if not 6 <= len(agents) <= 8:
            raise ValueError("大乱斗需要 6–8 个 Agent")
        if len({agent.id for agent in agents}) != len(agents):
            raise ValueError("大乱斗不能重复选择同一个 Agent")
        return await self.battle_runner.run(agents, topic)

    async def _run_duel_with_timeout(
        self,
        mode: ArenaMode,
        agent_a,
        agent_b,
        topic: str,
        rounds: int,
    ) -> ArenaResult:
        """限制完整 1v1，给每轮对话和裁判各一个基础预算。"""
        logger.info(
            f"ArenaEngine duel: mode={mode.value}, topic={topic!r}, rounds={rounds}"
        )
        return await asyncio.wait_for(
            self._run_duel(mode, agent_a, agent_b, topic, rounds),
            timeout=settings.agent_timeout_seconds * (rounds + 1),
        )

    async def _run_duel(
        self,
        mode: ArenaMode,
        agent_a,
        agent_b,
        topic: str,
        rounds: int,
    ) -> ArenaResult:
        """执行共用 GroupChat 流程并交给模式化裁判评分。"""
        from autogen_agentchat.teams import RoundRobinGroupChat
        from autogen_core import CancellationToken

        self._reset_agent_contexts([agent_a, agent_b])
        names = [agent_a.persona.name, agent_b.persona.name]
        agent_a.inject_context(
            build_duel_system_prompt(mode, topic, names[0], names[1], 0), []
        )
        agent_b.inject_context(
            build_duel_system_prompt(mode, topic, names[1], names[0], 1), []
        )
        team = RoundRobinGroupChat(
            participants=[agent_a.autogen_agent, agent_b.autogen_agent],
            max_turns=rounds * 2,
        )
        task = build_duel_task(mode, topic, names[0], names[1], rounds)
        result = await self._run_duel_chat(
            team, task, CancellationToken(), rounds
        )
        transcript = self._collect_transcript(
            [agent_a, agent_b],
            result.messages,
        )
        if not transcript:
            raise RuntimeError("竞技未生成任何有效发言")
        scoring = await self.scorer.score_duel(
            mode,
            topic,
            agent_a,
            agent_b,
            transcript,
        )
        return self._build_duel_result(
            mode,
            topic,
            rounds,
            agent_a,
            agent_b,
            transcript,
            scoring,
        )

    @staticmethod
    async def _run_duel_chat(team, task, token, rounds):
        """限制 GroupChat 阶段，默认三轮最多运行 90 秒。"""
        return await asyncio.wait_for(
            team.run(task=task, cancellation_token=token),
            timeout=settings.agent_timeout_seconds * rounds,
        )

    @staticmethod
    def _build_duel_result(
        mode: ArenaMode,
        topic: str,
        rounds: int,
        agent_a,
        agent_b,
        transcript: list[ArenaTranscriptEntry],
        scoring: dict,
    ) -> ArenaResult:
        """组装包含身份快照和真实分项的 1v1 结果。"""
        return ArenaResult(
            winner_id=scoring["winner_id"],
            scores=scoring["scores"],
            score_breakdown=scoring["score_breakdown"],
            judge_reasoning=scoring["reasoning"],
            transcript=transcript,
            mode=mode,
            topic=topic,
            rounds=rounds,
            participant_ids=[agent_a.id, agent_b.id],
            participant_names={
                agent_a.id: agent_a.persona.name,
                agent_b.id: agent_b.persona.name,
            },
        )

    @staticmethod
    def _collect_transcript(
        agents: list,
        messages: list,
    ) -> list[ArenaTranscriptEntry]:
        """把 AutoGen 内部名称稳定映射为 Agent ID 和显示姓名。"""
        source_map: dict[str, tuple[str, str]] = {}
        for agent in agents:
            identity = (agent.id, agent.persona.name)
            source_map[agent.autogen_agent.name] = identity
            source_map[agent.persona.name] = identity
        entries: list[ArenaTranscriptEntry] = []
        for message in messages:
            source = getattr(message, "source", "")
            content = getattr(message, "content", "")
            identity = source_map.get(source)
            if not identity or not content:
                continue
            entries.append(ArenaTranscriptEntry(
                turn=len(entries),
                round=len(entries) // 2 + 1,
                speaker_id=identity[0],
                speaker=identity[1],
                content=str(content),
            ))
        return entries

    @staticmethod
    def _reset_agent_contexts(agents: list) -> None:
        """清理复用 Agent 的 AutoGen 消息历史。"""
        for agent in agents:
            try:
                context = getattr(agent.autogen_agent, "_model_context", None)
                messages = getattr(context, "_messages", None)
                if messages is not None:
                    messages.clear()
            except Exception:
                logger.warning(f"Unable to reset Arena context: agent={agent.id}")

    def _create_judge(self, topic: str):
        """创建兼容 Step 26 测试和扩展调用的辩论裁判 Agent。"""
        from autogen_agentchat.agents import AssistantAgent

        return AssistantAgent(
            name="judge",
            model_client=self.model_client,
            system_message=build_judge_system_prompt(ArenaMode.DEBATE, topic),
        )

    async def _judge_score(
        self,
        agent_a,
        agent_b,
        transcript: list[dict] | list[ArenaTranscriptEntry],
    ) -> dict:
        """兼容旧内部接口并委托给统一裁判。"""
        entries = [
            entry if isinstance(entry, ArenaTranscriptEntry)
            else ArenaTranscriptEntry(
                turn=int(entry.get("turn", index)),
                round=int(entry.get("round", index // 2 + 1)),
                speaker_id=str(entry.get("speaker_id", "")),
                speaker=str(entry.get("speaker", "")),
                content=str(entry.get("content", "")),
            )
            for index, entry in enumerate(transcript)
        ]
        return await self.scorer.score_duel(
            ArenaMode.DEBATE,
            "竞技主题",
            agent_a,
            agent_b,
            entries,
        )

    def _parse_judge_result(
        self,
        raw: str,
        agent_a_id: str,
        agent_b_id: str,
    ) -> dict:
        """兼容旧解析入口并返回统一评分结构。"""
        return self.scorer.parse_duel_result(raw, agent_a_id, agent_b_id)

    @staticmethod
    def _try_parse_json(raw: str) -> dict | None:
        """兼容旧 JSON 解析入口。"""
        return ArenaScorer.try_parse_json(raw)

    @staticmethod
    def _extract_scores_from_text(
        raw: str,
        agent_a_id: str,
        agent_b_id: str,
    ) -> dict[str, float]:
        """兼容旧中文文本评分提取入口。"""
        return ArenaScorer.extract_scores_from_text(
            raw,
            agent_a_id,
            agent_b_id,
        )
