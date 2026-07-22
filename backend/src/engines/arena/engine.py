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

评分标准（每项 1-10 分，总分 4-40）：
- 论点质量：论据是否充分、逻辑是否严密
- 表达能力：是否清晰、有说服力
- 应变能力：是否回应了对方观点

**严格输出规则：只输出一行纯 JSON，不加任何前缀、后缀、markdown 标记或解释文字。**
JSON 格式：{{"agent_a_score": 25, "agent_b_score": 22, "winner": "A", "reasoning": "正方论点更有说服力"}}"""


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

    @staticmethod
    def _reset_agent_contexts(agents: list) -> None:
        """Clear reused AutoGen message history between Arena runs."""
        for agent in agents:
            try:
                context = getattr(agent.autogen_agent, "_model_context", None)
                messages = getattr(context, "_messages", None)
                if messages is not None:
                    messages.clear()
            except Exception:
                pass

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

        # 1. 清理 Agent 上下文（隔离之前的模拟对话）
        self._reset_agent_contexts([agent_a, agent_b])

        # 2. 注入辩论专用上下文（覆盖 LifeAgent 的默认"内心独白"指令）
        debate_system = (
            f"【辩论模式】你现在是辩手，不是日常对话者。\n"
            f"辩题: {topic}\n"
            f"你的角色: {agent_a.persona.name}（正方，支持该观点）\n"
            f"对手: {agent_b.persona.name}（反方）\n\n"
            "辩论规则:\n"
            "1. 每轮只发一条消息，50-200 字，直接表达观点\n"
            "2. 必须回应对方上一轮的论点\n"
            "3. 用你的人格风格发言，但不要输出内心推理过程\n"
            "4. 不要使用 think_aloud、observe 等工具\n"
            '5. 不要写"作为XX人格，我认为"——直接说你的观点\n'
        )
        agent_a.inject_context(debate_system, [])
        agent_b.inject_context(
            debate_system.replace(
                f"{agent_a.persona.name}（正方，支持该观点）",
                f"{agent_b.persona.name}（反方，反对该观点）",
            ).replace(
                f"对手: {agent_b.persona.name}（反方）",
                f"对手: {agent_a.persona.name}（正方）",
            ),
            [],
        )

        # 3. 构建仅包含辩手的 GroupChat
        from autogen_agentchat.teams import RoundRobinGroupChat

        team = RoundRobinGroupChat(
            participants=[agent_a.autogen_agent, agent_b.autogen_agent],
            max_turns=rounds * 2,
        )

        # 4. 运行辩论
        task = (
            f"【辩论规则】\n"
            f"辩题: {topic}\n"
            f"正方({agent_a.persona.name}): 支持\n"
            f"反方({agent_b.persona.name}): 反对\n\n"
            f"规则:\n"
            f"1. 每人每轮只发一条消息，50-200 字\n"
            f"2. 必须回应对方上一轮的观点\n"
            f"3. 用角色口吻发言，不要输出内心推理过程\n"
            f"4. 不要写\"作为XX人格，我认为...\"——直接表达观点\n"
            f"现在开始第 1 轮，正方先发言。"
        )
        transcript: list[dict] = []

        try:
            from autogen_core import CancellationToken

            result = await team.run(task=task, cancellation_token=CancellationToken())

            # 5. 收集 transcript（用 Agent 真实姓名替代 AutoGen 内部标识）
            agent_name_map = {
                agent_a.autogen_agent.name: agent_a.persona.name,
                agent_b.autogen_agent.name: agent_b.persona.name,
            }
            for i, msg in enumerate(result.messages):
                content = getattr(msg, "content", "")
                source = getattr(msg, "source", "")
                if content and source not in ("user", "judge"):
                    transcript.append({
                        "turn": i,
                        "speaker": agent_name_map.get(source, source),
                        "content": str(content),
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

    async def run_interview(
        self,
        agent_a,  # LifeAgent
        agent_b,  # LifeAgent
        topic: str,
        rounds: int = 3,
    ) -> ArenaResult:
        """面试竞争模式——两 Agent 竞争同一岗位，裁判评估匹配度。"""
        logger.info(f"ArenaEngine.run_interview: topic={topic!r}, rounds={rounds}")

        self._reset_agent_contexts([agent_a, agent_b])

        interview_system = (
            f"【面试模式】你现在是求职者，不是日常对话者。\n"
            f"岗位: {topic}\n"
            f"你的角色: {agent_a.persona.name}\n"
            f"竞争对手: {agent_b.persona.name}\n\n"
            "规则:\n"
            "1. 陈述你的优势、经历和岗位匹配度\n"
            "2. 回应对方对你资质的质疑\n"
            "3. 50-200 字每轮，不要输出内心推理\n"
            "4. 不要使用 think_aloud、observe 等工具\n"
        )
        agent_a.inject_context(interview_system, [])
        agent_b.inject_context(
            interview_system.replace(
                f"你的角色: {agent_a.persona.name}",
                f"你的角色: {agent_b.persona.name}",
            ).replace(
                f"竞争对手: {agent_b.persona.name}",
                f"竞争对手: {agent_a.persona.name}",
            ),
            [],
        )

        from autogen_agentchat.teams import RoundRobinGroupChat
        from autogen_core import CancellationToken

        team = RoundRobinGroupChat(
            participants=[agent_a.autogen_agent, agent_b.autogen_agent],
            max_turns=rounds * 2,
        )

        task = (
            f"面试岗位: {topic}\n\n"
            f"{agent_a.persona.name}和{agent_b.persona.name}同时应聘此岗位。\n"
            "请各自陈述优势、经历和匹配度，并回应对方质疑。"
        )
        transcript: list[dict] = []

        try:
            result = await team.run(task=task, cancellation_token=CancellationToken())
            for i, msg in enumerate(result.messages):
                content = getattr(msg, "content", "")
                source = getattr(msg, "source", "")
                if content and source not in ("user", "judge"):
                    transcript.append({
                        "turn": i,
                        "speaker": source,
                        "content": str(content),
                    })
        except Exception as e:
            logger.error(f"ArenaEngine.run_interview error: {e}")
            return ArenaResult(
                winner_id="",
                scores={agent_a.id: 0, agent_b.id: 0},
                judge_reasoning=f"面试过程出错: {str(e)[:200]}",
                transcript=transcript,
                mode=ArenaMode.INTERVIEW,
                topic=topic,
                rounds=rounds,
            )

        scoring = await self._judge_score(agent_a, agent_b, transcript)
        return ArenaResult(
            winner_id=scoring["winner_id"],
            scores=scoring["scores"],
            judge_reasoning=scoring["reasoning"],
            transcript=transcript,
            mode=ArenaMode.INTERVIEW,
            topic=topic,
            rounds=rounds,
        )

    async def run_pitch(
        self,
        agent_a,  # LifeAgent
        agent_b,  # LifeAgent
        topic: str,
        rounds: int = 3,
    ) -> ArenaResult:
        """路演模式——两 Agent 各自陈述方案，裁判评估可行性。"""
        logger.info(f"ArenaEngine.run_pitch: topic={topic!r}, rounds={rounds}")

        self._reset_agent_contexts([agent_a, agent_b])

        pitch_system = (
            f"【路演模式】你现在是创业者，不是日常对话者。\n"
            f"创业方向: {topic}\n"
            f"你的角色: {agent_a.persona.name}\n"
            f"竞争对手: {agent_b.persona.name}\n\n"
            "规则:\n"
            "1. 陈述你的洞察、方案、落地路径和竞争优势\n"
            "2. 回应对方质疑\n"
            "3. 50-200 字每轮，不要输出内心推理\n"
            "4. 不要使用 think_aloud、observe 等工具\n"
        )
        agent_a.inject_context(pitch_system, [])
        agent_b.inject_context(
            pitch_system.replace(
                f"你的角色: {agent_a.persona.name}",
                f"你的角色: {agent_b.persona.name}",
            ).replace(
                f"竞争对手: {agent_b.persona.name}",
                f"竞争对手: {agent_a.persona.name}",
            ),
            [],
        )

        from autogen_agentchat.teams import RoundRobinGroupChat
        from autogen_core import CancellationToken

        team = RoundRobinGroupChat(
            participants=[agent_a.autogen_agent, agent_b.autogen_agent],
            max_turns=rounds * 2,
        )

        task = (
            f"创业方向: {topic}\n\n"
            f"{agent_a.persona.name}和{agent_b.persona.name}各自展示方案。\n"
            "请说明洞察、解决方案、落地路径和竞争优势，回应对方质疑。"
        )
        transcript: list[dict] = []

        try:
            result = await team.run(task=task, cancellation_token=CancellationToken())
            for i, msg in enumerate(result.messages):
                content = getattr(msg, "content", "")
                source = getattr(msg, "source", "")
                if content and source not in ("user", "judge"):
                    transcript.append({
                        "turn": i,
                        "speaker": source,
                        "content": str(content),
                    })
        except Exception as e:
            logger.error(f"ArenaEngine.run_pitch error: {e}")
            return ArenaResult(
                winner_id="",
                scores={agent_a.id: 0, agent_b.id: 0},
                judge_reasoning=f"路演过程出错: {str(e)[:200]}",
                transcript=transcript,
                mode=ArenaMode.PITCH,
                topic=topic,
                rounds=rounds,
            )

        scoring = await self._judge_score(agent_a, agent_b, transcript)
        return ArenaResult(
            winner_id=scoring["winner_id"],
            scores=scoring["scores"],
            judge_reasoning=scoring["reasoning"],
            transcript=transcript,
            mode=ArenaMode.PITCH,
            topic=topic,
            rounds=rounds,
        )

    def _parse_judge_result(self, raw: str, agent_a_id: str, agent_b_id: str) -> dict:
        """解析裁判返回的评分——先尝试 JSON，失败则从中文文本提取分数。

        Returns:
            {"winner_id": str, "scores": {id: float}, "reasoning": str}
        """
        data = self._try_parse_json(raw)
        if data is not None:
            score_a = float(data.get("agent_a_score", 20))
            score_b = float(data.get("agent_b_score", 20))
            winner = str(data.get("winner", "A")).upper()
            reasoning = str(data.get("reasoning", raw[:300]))
            winner_id = agent_a_id if winner.startswith("A") else agent_b_id
            return {
                "winner_id": winner_id,
                "scores": {agent_a_id: min(40, max(4, score_a)), agent_b_id: min(40, max(4, score_b))},
                "reasoning": reasoning[:800],
            }

        # JSON 解析失败 → 尝试从中文 Markdown 提取总分
        scores = self._extract_scores_from_text(raw, agent_a_id, agent_b_id)
        logger.info(
            f"ArenaEngine._parse_judge_result: "
            f"text extraction → A={scores[agent_a_id]}, B={scores[agent_b_id]}"
        )
        winner_id = (
            agent_a_id if scores[agent_a_id] >= scores[agent_b_id] else agent_b_id
        )
        return {
            "winner_id": winner_id,
            "scores": scores,
            "reasoning": raw[:800],
        }

    @staticmethod
    def _try_parse_json(raw: str) -> dict | None:
        """Attempt to extract valid JSON from judge output."""
        try:
            return json.loads(raw)  # type: ignore[no-any-return]
        except json.JSONDecodeError:
            pass
        # markdown code block
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))  # type: ignore[no-any-return]
            except json.JSONDecodeError:
                pass
        # bare JSON object with agent_a_score key
        match = re.search(r'\{[^{}]*"agent_a_score"[^{}]*\}', raw, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))  # type: ignore[no-any-return]
            except json.JSONDecodeError:
                pass
        return None

    @staticmethod
    def _extract_scores_from_text(
        raw: str, agent_a_id: str, agent_b_id: str
    ) -> dict[str, float]:
        """Extract per-category scores from Chinese judge text and sum them.

        Looks for patterns like "论点清晰度：9/10" or "逻辑性：8分".
        The text is divided into 正方 / 反方 sections.
        """
        # Split into 正方 and 反方 sections
        zheng_pattern = re.split(r"###\s*反方", raw, maxsplit=1)
        zheng_text = zheng_pattern[0]
        fan_text = zheng_pattern[1] if len(zheng_pattern) > 1 else ""

        # Remove the "### 正方" header from zheng_text
        zheng_text = re.sub(r"###\s*正方[^\n]*\n?", "", zheng_text)

        def sum_scores(text: str) -> float:
            # Match patterns like "9/10", "8分", "得分：7"
            numbers = re.findall(r"(\d+)\s*/\s*10", text)
            if numbers:
                return sum(int(n) for n in numbers)
            numbers = re.findall(r"(\d+)\s*分", text)
            if numbers:
                return sum(int(n) for n in numbers)
            return 0

        score_a = sum_scores(zheng_text)
        score_b = sum_scores(fan_text)

        # If extraction failed, default to reasonable scores
        if score_a == 0:
            score_a = 20
        if score_b == 0:
            score_b = 20

        # Clamp
        score_a = min(40, max(4, score_a))
        score_b = min(40, max(4, score_b))

        return {agent_a_id: float(score_a), agent_b_id: float(score_b)}
