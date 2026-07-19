"""
ArenaEngine — 竞技引擎：两个 Agent 在竞技场景中对决，LLM 裁判评分。

核心接口:
    engine = ArenaEngine(model_client)
    result = await engine.run_debate(agent_a, agent_b, topic="AI会取代人类吗", rounds=3)
    # → ArenaResult(winner_id=..., scores={...}, judge_reasoning=..., transcript=[...])

依赖:
    - engines.agent_factory.factory: LifeAgent
    - autogen_agentchat: AssistantAgent, RoundRobinGroupChat
"""

import json
import re
from datetime import datetime, timezone
from enum import Enum

from loguru import logger
from pydantic import BaseModel, Field


# =============================================================================
# 类型定义
# =============================================================================


class ArenaMode(str, Enum):
    """竞技模式枚举"""

    DEBATE = "debate"        # 辩论赛：就一个话题正反方辩论
    INTERVIEW = "interview"  # 面试竞争：同一岗位竞争（P2）
    PITCH = "pitch"          # 路演：各自陈述，裁判评分（P2）


class ArenaResult(BaseModel):
    """竞技结果"""

    winner_id: str = Field(description="获胜方 Agent ID")
    scores: dict[str, float] = Field(description="{agent_id: score}")
    judge_reasoning: str = Field(default="", description="裁判的评分理由")
    transcript: list[dict] = Field(default_factory=list, description="完整对话记录")
    mode: ArenaMode = Field(default=ArenaMode.DEBATE)
    topic: str = Field(default="")
    rounds: int = Field(default=3)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# =============================================================================
# 裁判 System Prompt
# =============================================================================

_JUDGE_SYSTEM_PROMPT = """你是比赛裁判。辩论主题：{topic}

评分标准（每项 1-10 分）：
- 论点质量：论据是否充分、逻辑是否严密
- 表达能力：是否清晰、有说服力
- 应变能力：是否回应了对方观点
- 角色一致性：辩论风格是否符合其人格设定

辩论结束后，请根据完整对话记录给出评分。
输出 JSON 格式（不要 markdown 包装）：
{{"agent_a_score": 4-40, "agent_b_score": 4-40, "winner": "A或B", "reasoning": "详细理由"}}"""


# =============================================================================
# ArenaEngine
# =============================================================================


class ArenaEngine:
    """竞技引擎：管理两个 Agent 的对决 + 裁判评分。"""

    def __init__(self, model_client):
        """注入 LLM 客户端。

        Args:
            model_client: AutoGen ChatCompletionClient
        """
        self.model_client = model_client
        logger.info("ArenaEngine created")

    async def run_debate(
        self,
        agent_a,  # LifeAgent
        agent_b,  # LifeAgent
        topic: str,
        rounds: int = 3,
    ) -> ArenaResult:
        """辩论赛模式——两个 Agent 就话题正反方辩论，裁判评分。

        Args:
            agent_a: 正方 Agent（LifeAgent 实例）
            agent_b: 反方 Agent（LifeAgent 实例）
            topic: 辩论主题
            rounds: 辩论轮数（每轮双方各发言一次）

        Returns:
            ArenaResult: 包含 winner、scores、transcript
        """
        logger.info(f"ArenaEngine.run_debate: topic={topic!r}, rounds={rounds}")

        # 1. 构建仅包含辩手的 GroupChat；裁判在辩论结束后单独评分。
        from autogen_agentchat.teams import RoundRobinGroupChat

        team = RoundRobinGroupChat(
            participants=[agent_a.autogen_agent, agent_b.autogen_agent],
            max_turns=rounds * 2,
        )

        # 2. 运行辩论
        task = f"辩论主题: {topic}\n\n{agent_a.persona.name}为正方，{agent_b.persona.name}为反方。请开始辩论。"
        transcript: list[dict] = []

        try:
            from autogen_core import CancellationToken

            result = await team.run(task=task, cancellation_token=CancellationToken())

            # 3. 收集 transcript
            for i, msg in enumerate(result.messages):
                content = getattr(msg, "content", "")
                source = getattr(msg, "source", "")
                if content and source not in ("user", "judge"):
                    transcript.append({
                        "turn": i,
                        "speaker": source,
                        "content": str(content)[:500],
                    })
        except Exception as e:
            logger.error(f"ArenaEngine.run_debate error: {e}")
            return ArenaResult(
                winner_id="",
                scores={agent_a.id: 0, agent_b.id: 0},
                judge_reasoning=f"辩论过程出错: {str(e)[:200]}",
                transcript=transcript,
                mode=ArenaMode.DEBATE,
                topic=topic,
                rounds=rounds,
            )

        # 4. 裁判评分
        scoring = await self._judge_score(agent_a, agent_b, transcript)

        return ArenaResult(
            winner_id=scoring["winner_id"],
            scores=scoring["scores"],
            judge_reasoning=scoring["reasoning"],
            transcript=transcript,
            mode=ArenaMode.DEBATE,
            topic=topic,
            rounds=rounds,
        )

    def _create_judge(self, topic: str):
        """创建裁判 Agent。

        Args:
            topic: 辩论主题

        Returns:
            AssistantAgent: 裁判实例
        """
        from autogen_agentchat.agents import AssistantAgent

        judge = AssistantAgent(
            name="judge",
            model_client=self.model_client,
            system_message=_JUDGE_SYSTEM_PROMPT.format(topic=topic),
        )
        return judge

    async def _judge_score(
        self,
        agent_a,  # LifeAgent
        agent_b,  # LifeAgent
        transcript: list[dict],
    ) -> dict:
        """让裁判根据 transcript 评分。

        Args:
            agent_a: 正方 Agent
            agent_b: 反方 Agent
            transcript: 对话记录

        Returns:
            {"winner_id": str, "scores": {id: float}, "reasoning": str}
        """
        # 构建对话摘要给裁判
        transcript_text = "\n".join(
            f"[{t['speaker']}]: {t['content'][:200]}" for t in transcript
        )

        prompt = (
            f"辩论已结束。正方: {agent_a.persona.name}，反方: {agent_b.persona.name}。\n\n"
            f"完整对话记录：\n{transcript_text}\n\n"
            f"请评分。"
        )

        try:
            from autogen_agentchat.messages import TextMessage
            from autogen_core import CancellationToken

            # 直接用 model_client 生成评分（不走 Agent 交互）
            from autogen_core.models import UserMessage

            result = await self.model_client.create(
                messages=[UserMessage(content=prompt, source="arena")],
                cancellation_token=CancellationToken(),
            )
            raw = getattr(result, "content", "")
            return self._parse_judge_result(raw, agent_a.id, agent_b.id)
        except Exception as e:
            logger.error(f"ArenaEngine._judge_score error: {e}")
            # 评分失败时返回默认结果
            return {
                "winner_id": agent_a.id,
                "scores": {agent_a.id: 20.0, agent_b.id: 20.0},
                "reasoning": f"评分失败，默认平局: {str(e)[:100]}",
            }

    def _parse_judge_result(self, raw: str, agent_a_id: str, agent_b_id: str) -> dict:
        """解析裁判返回的 JSON 评分。

        Args:
            raw: 裁判原始返回文本
            agent_a_id: 正方 ID
            agent_b_id: 反方 ID

        Returns:
            解析后的评分字典
        """
        # 尝试提取 JSON
        try:
            # 先尝试直接解析
            data = json.loads(raw)
        except json.JSONDecodeError:
            # 尝试从 markdown 代码块中提取
            match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group(1))
                except json.JSONDecodeError:
                    data = None
            else:
                # 尝试找到第一个 { } 块
                match = re.search(r"\{[^{}]*\}", raw, re.DOTALL)
                if match:
                    try:
                        data = json.loads(match.group(0))
                    except json.JSONDecodeError:
                        data = None
                else:
                    data = None

        if data is None:
            logger.warning(f"ArenaEngine: failed to parse judge result: {raw[:200]}")
            return {
                "winner_id": agent_a_id,
                "scores": {agent_a_id: 20.0, agent_b_id: 20.0},
                "reasoning": f"评分解析失败，原始返回: {raw[:200]}",
            }

        score_a = float(data.get("agent_a_score", 20))
        score_b = float(data.get("agent_b_score", 20))
        winner = data.get("winner", "A")
        reasoning = data.get("reasoning", "")

        winner_id = agent_a_id if winner.upper().startswith("A") else agent_b_id

        return {
            "winner_id": winner_id,
            "scores": {agent_a_id: score_a, agent_b_id: score_b},
            "reasoning": reasoning,
        }
