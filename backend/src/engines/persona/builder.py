"""
Persona Builder — 自然语言描述 → 完整人格 JSON。

核心接口:
    builder = PersonaBuilder(model_client)
    result = await builder.build("来自小镇的计算机系新生，内向但野心大")
    # → PersonaBuildResult(persona=..., background=..., goals=..., ...)

依赖:
    - models.agent: Persona, Background, Goal, BigFive, DecisionStyle
    - model_client:  AutoGen ChatCompletionClient (or any compatible mock)

测试: 用 Mock LLM 返回固定 JSON，不需要真实 API key。
"""

import json
import re
from typing import Any

from loguru import logger

from models.agent import Background, BigFive, DecisionStyle, Goal, Persona


# =============================================================================
# 输出类型
# =============================================================================

class PersonaBuildResult:
    """Persona Builder 的产出——比 plan 中的 dict 更结构化。"""

    def __init__(
        self,
        name: str,
        persona: Persona,
        background: Background,
        goals: list[Goal],
        raw_response: str = "",
    ):
        self.name = name
        self.persona = persona
        self.background = background
        self.goals = goals
        self.raw_response = raw_response

    def __repr__(self) -> str:
        return f"<PersonaBuildResult name={self.name!r} mbti={self.persona.mbti}>"


# =============================================================================
# Prompt 模板（内置——从 development-plan.md §1.1 来）
# =============================================================================

_BUILD_SYSTEM_PROMPT = """\
你是一个角色设计师。根据以下描述，生成一个完整的人物设定。

请返回 JSON 格式（不要 markdown 包装）：
{
  "name": "角色名（2-3字中文名）",
  "mbti": "MBTI类型",
  "big_five": {"openness": 0.0-1.0, "conscientiousness": 0.0-1.0, "extraversion": 0.0-1.0, "agreeableness": 0.0-1.0, "neuroticism": 0.0-1.0},
  "values": ["价值观1", "价值观2", "价值观3"],
  "decision_style": {
    "info_processing": "intuitive|analytical|balanced",
    "risk_preference": "averse|moderate|seeking",
    "social_tendency": "competitive|cooperative|independent",
    "stress_response": "avoidant|reactive|adaptive|resilient"
  },
  "narrative": "200-400字的第一人称人格画像，描述TA的内心世界、行为模式、核心矛盾",
  "background": {
    "hometown": "家乡",
    "family": "家庭背景一句话",
    "education": "教育背景",
    "key_events": ["人生关键事件1", "关键事件2"]
  },
  "goals": [
    {"id": "g1", "description": "目标描述", "priority": 1, "deadline": null, "status": "active"}
  ]
}"""

_RETRY_SUFFIX = "\n\n⚠️ 上次返回的 JSON 格式不正确。请只返回纯 JSON，不要用 ``` 包装。"


# =============================================================================
# Mock 数据（测试用，不调 LLM）
# =============================================================================

MOCK_PERSONA_JSON: dict[str, Any] = {
    "name": "小明",
    "mbti": "INTJ-T",
    "big_five": {
        "openness": 0.7,
        "conscientiousness": 0.85,
        "extraversion": 0.25,
        "agreeableness": 0.5,
        "neuroticism": 0.6,
    },
    "values": ["成就", "独立", "效率"],
    "decision_style": {
        "info_processing": "analytical",
        "risk_preference": "moderate",
        "social_tendency": "independent",
        "stress_response": "adaptive",
    },
    "narrative": "小明是一个来自小镇的年轻人，高考全县第一的成绩让他进入了顶尖大学。"
    "他习惯独来独往，不太擅长社交，但内心对成功有着强烈的渴望。"
    "他相信努力可以改变命运，也因此对自己要求极其严格。"
    "夜深人静时，他会焦虑自己是否做得还不够好，但天亮后又会恢复冷静和理性。"
    "他喜欢用计划和目标来驱散不安——每一步都要在自己的掌控之中。",
    "background": {
        "hometown": "安徽某县城",
        "family": "父母务农，独生子",
        "education": "中科大计算机系大二",
        "key_events": ["高考全县第一", "大一编程比赛失利"],
    },
    "goals": [
        {
            "id": "g1",
            "description": "保研清华",
            "priority": 1,
            "deadline": None,
            "status": "active",
        }
    ],
}


# =============================================================================
# 核心类
# =============================================================================

class PersonaBuilder:
    """Persona Builder——自然语言 → 结构化人格。

    用法:
        builder = PersonaBuilder(model_client)
        result = await builder.build("内向的程序员")
        print(result.persona.mbti)  # "INTJ-T"
    """

    def __init__(self, model_client: Any):
        """注入 LLM 客户端。

        Args:
            model_client: 兼容 AutoGen ChatCompletionClient 接口的对象。
                          测试时传入 Mock 客户端。
        """
        self._client = model_client

    # -------------------------------------------------------------------------
    # 公开接口
    # -------------------------------------------------------------------------

    async def build(self, description: str) -> PersonaBuildResult:
        """根据自然语言描述生成完整人格。

        Args:
            description: 自然语言描述，如 "来自小镇的计算机系新生，内向但野心大"

        Returns:
            PersonaBuildResult: 包含 persona, background, goals, name, raw_response

        Raises:
            ValueError: 两次尝试后仍无法解析 LLM 返回
        """
        if not description or not description.strip():
            raise ValueError("description 不能为空或仅含空白字符")

        description = description.strip()
        logger.info(f"PersonaBuilder.build: description={description[:50]}...")

        # 第一次尝试
        raw = await self._call_llm(description, retry=False)
        result = self._parse_response(raw)

        if result is not None:
            logger.info(f"PersonaBuilder.build OK: name={result.name}, mbti={result.persona.mbti}")
            return result

        # 重试 1 次（JSON 解析失败 / Pydantic 校验失败）
        logger.warning("PersonaBuilder: first parse failed, retrying...")
        raw = await self._call_llm(description, retry=True)
        result = self._parse_response(raw)

        if result is not None:
            logger.info(f"PersonaBuilder.build OK (retry): name={result.name}")
            return result

        raise ValueError(
            f"PersonaBuilder: 两次尝试后仍无法解析 LLM 返回。"
            f"最后一次原始返回: {raw[:200]}..."
        )

    # -------------------------------------------------------------------------
    # 内部方法
    # -------------------------------------------------------------------------

    async def _call_llm(self, description: str, retry: bool = False) -> str:
        """调用 LLM，返回原始文本。

        Args:
            description: 角色描述
            retry: 是否是重试（重试时追加 stricter prompt）

        Returns:
            LLM 返回的原始字符串
        """
        user_content = f"描述：{description}"
        if retry:
            user_content += _RETRY_SUFFIX

        messages = [
            {"role": "system", "content": _BUILD_SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

        logger.debug(f"PersonaBuilder._call_llm: retry={retry}")
        response = await self._client.create(messages=messages)
        # AutoGen CreateResult: .content 是文本内容
        return response.content

    @staticmethod
    def _parse_response(raw: str) -> PersonaBuildResult | None:
        """解析 LLM 返回的 JSON → PersonaBuildResult。

        容忍 markdown code fences 和尾部逗号。
        返回 None 表示解析失败（调用方负责重试）。

        Args:
            raw: LLM 返回的原始文本

        Returns:
            PersonaBuildResult 或 None
        """
        # 1. 提取 JSON 文本
        json_text = _extract_json(raw)
        if not json_text:
            logger.warning("PersonaBuilder._parse_response: no JSON found in response")
            return None

        # 2. 解析 JSON
        try:
            data = json.loads(json_text)
        except json.JSONDecodeError as e:
            logger.warning(f"PersonaBuilder._parse_response: JSON decode error: {e}")
            return None

        # 3. 构建 Pydantic 对象（每个字段独立 try，精确定位问题）
        try:
            name: str = data["name"]

            big_five = BigFive(**data.get("big_five", {}))
            decision_style = DecisionStyle(**data.get("decision_style", {}))
            persona = Persona(
                mbti=data.get("mbti", "INTJ-T"),
                big_five=big_five,
                values=data.get("values", []),
                decision_style=decision_style,
                narrative=data.get("narrative", ""),
            )

            bg_data = data.get("background", {})
            background = Background(
                hometown=bg_data.get("hometown", ""),
                family=bg_data.get("family", ""),
                education=bg_data.get("education", ""),
                key_events=bg_data.get("key_events", []),
            )

            goals = [
                Goal(
                    id=g.get("id", f"g{i + 1}"),
                    description=g.get("description", ""),
                    priority=g.get("priority", 1),
                    deadline=g.get("deadline"),
                    status=g.get("status", "active"),
                )
                for i, g in enumerate(data.get("goals", []))
            ]

        except (KeyError, TypeError, ValueError) as e:
            logger.warning(f"PersonaBuilder._parse_response: field error: {e}")
            return None

        return PersonaBuildResult(
            name=name,
            persona=persona,
            background=background,
            goals=goals,
            raw_response=raw,
        )


# =============================================================================
# 辅助函数
# =============================================================================

def _extract_json(text: str) -> str | None:
    """从 LLM 返回中提取 JSON 字符串。

    处理常见情况：
    - 纯 JSON 文本 → 直接返回
    - ```json ... ``` 包装 → 去掉 fences
    - ``` ... ``` 包装（无语言标记） → 去掉 fences

    Args:
        text: LLM 返回的原始文本

    Returns:
        提取出的 JSON 字符串，或 None
    """
    text = text.strip()

    # 去掉 markdown code fences
    fence_pattern = r"^```(?:json)?\s*\n(.*?)\n```\s*$"
    m = re.match(fence_pattern, text, re.DOTALL)
    if m:
        return m.group(1).strip()

    # 如果找不到 fences 但以 { 开头，直接返回
    if text.startswith("{"):
        return text

    # 尝试在文本中寻找 JSON 块
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        return m.group(0)

    return None
