"""竞技裁判调用与评分结果解析。"""

import asyncio
import json
import re
from dataclasses import dataclass
from typing import Any

from loguru import logger

from config import settings
from engines.arena.prompts import (
    build_battle_judge_prompt,
    build_judge_system_prompt,
    build_judge_task,
)
from models.arena import ArenaMode, ArenaTranscriptEntry


SCORE_KEYS = ("argument_quality", "expression", "adaptability", "character_consistency")

@dataclass
class BattleRanking:
    """一个大乱斗阶段的完整裁判排名。"""

    ranked_ids: list[str]
    scores: dict[str, float]
    score_breakdown: dict[str, dict[str, float]]
    reasoning: str


class ArenaScorer:
    """封装模式化裁判调用及可回退的结果解析。"""

    def __init__(self, model_client):
        """保存 AutoGen 模型客户端。"""
        self.model_client = model_client

    async def score_duel(
        self,
        mode: ArenaMode,
        topic: str,
        agent_a,
        agent_b,
        transcript: list[ArenaTranscriptEntry],
    ) -> dict:
        """对一场 1v1 竞技评分，裁判失败时返回明确的平局降级。"""
        transcript_text = "\n".join(
            f"[R{entry.round} {entry.speaker}]: {entry.content}"
            for entry in transcript
        )
        prompt = (
            f"{build_judge_system_prompt(mode, topic)}\n\n"
            f"{build_judge_task(agent_a.persona.name, agent_b.persona.name, transcript_text)}"
        )
        try:
            raw = await self._call_model(prompt, source="arena_judge")
            return self.parse_duel_result(raw, agent_a.id, agent_b.id)
        except asyncio.TimeoutError:
            raise
        except Exception as error:
            logger.error(
                f"ArenaScorer.score_duel failed: {type(error).__name__}: {error}"
            )
            return self._duel_fallback(agent_a.id, agent_b.id, error)

    async def score_blind_duel(
        self,
        topic: str,
        agent_a,
        agent_b,
        transcript: list[ArenaTranscriptEntry],
    ) -> dict:
        """盲测评分：裁判看不到发言者身份，仅根据内容质量评判。"""
        anonymized = "\n".join(
            f"[R{entry.round} 选手{'A' if entry.speaker_id == agent_a.id else 'B'}]: {entry.content}"
            for entry in transcript
        )
        prompt = (
            f"你是一位公正的竞技裁判。两位匿名选手（选手A 和 选手B）就以下主题进行了辩论。\n"
            f"你无法知道他们的真实身份，请仅根据发言内容的质量进行评分。\n\n"
            f"主题：{topic}\n\n"
            f"请从四个维度（论证质量、表达力、应变力、角色一致性）为每位选手打分（1-10分），\n"
            f"并给出获胜者和理由。以 JSON 格式返回：\n"
            f'{{"scores": {{"A": {{"argument_quality": N, "expression": N, "adaptability": N, "character_consistency": N}}, "B": {{...}}}}, '
            f'"winner": "A" 或 "B", "reasoning": "..."}}\n\n'
            f"辩论记录：\n{anonymized}"
        )
        try:
            raw = await self._call_model(prompt, source="arena_blind_judge")
            return self.parse_duel_result(raw, agent_a.id, agent_b.id)
        except asyncio.TimeoutError:
            raise
        except Exception as error:
            logger.error(
                f"ArenaScorer.score_blind_duel failed: {type(error).__name__}: {error}"
            )
            return self._duel_fallback(agent_a.id, agent_b.id, error)

    async def rank_battle(
        self,
        topic: str,
        agents: list,
        transcript: list[ArenaTranscriptEntry],
        survivor_count: int,
    ) -> BattleRanking:
        """对大乱斗单个阶段排名，异常时保持稳定的原顺序淘汰。"""
        aliases = {
            f"P{index + 1}": agent.persona.name
            for index, agent in enumerate(agents)
        }
        alias_to_id = {
            f"P{index + 1}": agent.id
            for index, agent in enumerate(agents)
        }
        transcript_text = "\n".join(
            f"[{entry.speaker}]: {entry.content}" for entry in transcript
        )
        prompt = build_battle_judge_prompt(
            topic,
            aliases,
            transcript_text,
            survivor_count,
        )
        try:
            raw = await self._call_model(prompt, source="arena_battle_judge")
            return self.parse_battle_result(raw, alias_to_id)
        except asyncio.TimeoutError:
            raise
        except Exception as error:
            logger.error(
                f"ArenaScorer.rank_battle failed: {type(error).__name__}: {error}"
            )
            return self._battle_fallback(agents, error)

    async def _call_model(self, prompt: str, source: str) -> str:
        """调用模型并对每次裁判请求实施统一超时。"""
        from autogen_core import CancellationToken
        from autogen_core.models import UserMessage

        result = await asyncio.wait_for(
            self.model_client.create(
                messages=[UserMessage(content=prompt, source=source)],
                cancellation_token=CancellationToken(),
                json_output=True,
            ),
            timeout=settings.agent_timeout_seconds,
        )
        return str(getattr(result, "content", ""))

    def parse_duel_result(
        self,
        raw: str,
        agent_a_id: str,
        agent_b_id: str,
    ) -> dict:
        """解析新旧两种裁判 JSON，并在文本响应时提取总分。"""
        data = self.try_parse_json(raw)
        if data is None:
            scores = self.extract_scores_from_text(raw, agent_a_id, agent_b_id)
            return {
                "winner_id": (
                    agent_a_id
                    if scores[agent_a_id] >= scores[agent_b_id]
                    else agent_b_id
                ),
                "scores": scores,
                "score_breakdown": {
                    agent_a_id: self.default_breakdown(scores[agent_a_id]),
                    agent_b_id: self.default_breakdown(scores[agent_b_id]),
                },
                "reasoning": raw,
            }

        raw_scores = data.get("scores", {})
        score_a = self._total_score(
            raw_scores.get("A", data.get("agent_a_score", 20))
        )
        score_b = self._total_score(
            raw_scores.get("B", data.get("agent_b_score", 20))
        )
        raw_breakdown = data.get("score_breakdown", {})
        breakdown_a = self.normalize_breakdown(raw_breakdown.get("A"), score_a)
        breakdown_b = self.normalize_breakdown(raw_breakdown.get("B"), score_b)
        score_a = sum(breakdown_a.values()) if raw_breakdown.get("A") else score_a
        score_b = sum(breakdown_b.values()) if raw_breakdown.get("B") else score_b
        winner = str(data.get("winner", "")).upper()
        winner_id = (
            agent_a_id if winner.startswith("A") or (not winner and score_a >= score_b)
            else agent_b_id
        )
        return {
            "winner_id": winner_id,
            "scores": {agent_a_id: score_a, agent_b_id: score_b},
            "score_breakdown": {
                agent_a_id: breakdown_a,
                agent_b_id: breakdown_b,
            },
            "reasoning": str(data.get("reasoning", raw)),
        }

    def parse_battle_result(
        self,
        raw: str,
        alias_to_id: dict[str, str],
    ) -> BattleRanking:
        """解析多人排名，并补齐裁判遗漏的参赛者。"""
        data = self.try_parse_json(raw)
        if data is None:
            raise ValueError("大乱斗裁判未返回有效 JSON")

        judge_ranking = [
            alias_to_id[alias] for alias in data.get("ranking", [])
            if alias in alias_to_id
        ]
        judge_ranking.extend(
            agent_id for agent_id in alias_to_id.values()
            if agent_id not in judge_ranking
        )
        raw_scores = data.get("scores", {})
        raw_breakdown = data.get("score_breakdown", {})
        scores: dict[str, float] = {}
        breakdowns: dict[str, dict[str, float]] = {}
        for alias, agent_id in alias_to_id.items():
            total = self._total_score(raw_scores.get(alias, 20))
            breakdown = self.normalize_breakdown(raw_breakdown.get(alias), total)
            scores[agent_id] = (
                sum(breakdown.values()) if raw_breakdown.get(alias) else total
            )
            breakdowns[agent_id] = breakdown
        positions = {agent_id: index for index, agent_id in enumerate(judge_ranking)}
        ranking = sorted(alias_to_id.values(), key=lambda item: (-scores[item], positions[item]))
        return BattleRanking(
            ranked_ids=ranking,
            scores=scores,
            score_breakdown=breakdowns,
            reasoning=str(data.get("reasoning", "")),
        )

    @staticmethod
    def try_parse_json(raw: str) -> dict | None:
        """从纯 JSON、Markdown 代码块或混合文本中提取对象。"""
        candidates = [raw]
        code_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
        if code_match:
            candidates.append(code_match.group(1))
        object_match = re.search(r"\{.*\}", raw, re.DOTALL)
        if object_match:
            candidates.append(object_match.group(0))
        for candidate in candidates:
            try:
                data = json.loads(candidate)
                if isinstance(data, dict):
                    return data
            except json.JSONDecodeError:
                continue
        return None

    @staticmethod
    def extract_scores_from_text(
        raw: str,
        agent_a_id: str,
        agent_b_id: str,
    ) -> dict[str, float]:
        """从正方/反方中文评分文本提取分数。"""
        sections = re.split(r"###\s*反方", raw, maxsplit=1)
        texts = [sections[0], sections[1] if len(sections) > 1 else ""]

        def sum_scores(text: str) -> float:
            values = re.findall(r"(\d+)\s*/\s*10", text)
            if not values:
                values = re.findall(r"(\d+)\s*分", text)
            return float(sum(int(value) for value in values)) if values else 20.0

        return {
            agent_a_id: min(40.0, max(4.0, sum_scores(texts[0]))),
            agent_b_id: min(40.0, max(4.0, sum_scores(texts[1]))),
        }

    @staticmethod
    def normalize_breakdown(
        value: object,
        total: float,
    ) -> dict[str, float]:
        """把任意分项输入规范为四个 1–10 分字段。"""
        if not isinstance(value, dict):
            return ArenaScorer.default_breakdown(total)
        return {
            key: min(10.0, max(1.0, float(value.get(key, total / 4))))
            for key in SCORE_KEYS
        }

    @staticmethod
    def default_breakdown(total: float) -> dict[str, float]:
        """将总分均匀映射为四个兼容展示的分项。"""
        quarter = min(10.0, max(1.0, total / 4))
        return {key: quarter for key in SCORE_KEYS}

    @staticmethod
    def _total_score(value: Any) -> float:
        """把裁判总分限制在 4–40。"""
        try:
            return min(40.0, max(4.0, float(value)))
        except (TypeError, ValueError):
            return 20.0

    def _duel_fallback(self, agent_a_id: str, agent_b_id: str, error: Exception) -> dict:
        """生成保留 transcript 所需的裁判失败降级分数。"""
        return {
            "winner_id": agent_a_id,
            "scores": {agent_a_id: 20.0, agent_b_id: 20.0},
            "score_breakdown": {
                agent_a_id: self.default_breakdown(20.0),
                agent_b_id: self.default_breakdown(20.0),
            },
            "reasoning": f"评分失败，默认平局: {str(error)[:200]}",
        }

    def _battle_fallback(self, agents: list, error: Exception) -> BattleRanking:
        """在排名失败时按当前顺序安全降级。"""
        scores = {
            agent.id: float(max(4, 20 - index))
            for index, agent in enumerate(agents)
        }
        return BattleRanking(
            ranked_ids=[agent.id for agent in agents],
            scores=scores,
            score_breakdown={
                agent_id: self.default_breakdown(score)
                for agent_id, score in scores.items()
            },
            reasoning=f"阶段评分失败，沿用当前顺序: {str(error)[:200]}",
        )
