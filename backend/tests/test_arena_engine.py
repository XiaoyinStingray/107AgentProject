"""
ArenaEngine 单元测试 — Mock LLM + Mock AutoGen GroupChat。
"""

import json

import pytest

from models.agent import Background, BigFive, DecisionStyle, Goal, Persona


# =============================================================================
# Mock LLM 客户端
# =============================================================================


class MockModelClient:
    """模拟 LLM 客户端——返回 CreateResult 兼容 AutoGen 0.7。"""

    model_info = {"function_calling": True, "vision": False, "json_output": True}

    def __init__(self, fixed_response: str | None = None):
        self._fixed = fixed_response
        self.call_count = 0

    async def create(self, messages, **kwargs):
        from autogen_core.models import CreateResult, RequestUsage

        self.call_count += 1
        content = self._fixed or "模拟响应"
        return CreateResult(
            finish_reason="stop",
            content=content,
            usage=RequestUsage(prompt_tokens=10, completion_tokens=5),
            cached=False,
        )


# =============================================================================
# Fixtures
# =============================================================================


def make_agent(agent_id: str, name: str, mbti: str = "INTJ-T"):
    """创建一个 LifeAgent 用于测试。"""
    from engines.agent_factory.factory import LifeAgent

    persona = Persona(
        name=name,
        mbti=mbti,
        big_five=BigFive(),
        values=["成就", "独立"],
        decision_style=DecisionStyle(),
        narrative=f"{name}是一个虚构角色，用于测试。",
    )

    return LifeAgent(
        id=agent_id,
        persona=persona,
        background=Background(hometown="测试镇"),
        goals=[Goal(id="g1", description="测试目标", priority=1)],
        model_client=MockModelClient(),
    )


# =============================================================================
# ArenaMode & ArenaResult 类型
# =============================================================================


class TestArenaTypes:
    def test_arena_mode_values(self):
        from engines.arena.engine import ArenaMode

        assert ArenaMode.DEBATE == "debate"
        assert ArenaMode.INTERVIEW == "interview"
        assert ArenaMode.PITCH == "pitch"

    def test_arena_result_defaults(self):
        from engines.arena.engine import ArenaResult

        result = ArenaResult(
            winner_id="a1",
            scores={"a1": 30, "b1": 20},
        )
        assert result.winner_id == "a1"
        assert result.scores["a1"] == 30
        assert result.judge_reasoning == ""
        assert result.transcript == []
        assert result.rounds == 3

    def test_arena_result_full(self):
        from engines.arena.engine import ArenaMode, ArenaResult

        result = ArenaResult(
            winner_id="a1",
            scores={"a1": 35, "b1": 25},
            judge_reasoning="正方论点更充分",
            transcript=[{"turn": 0, "speaker": "A", "content": "我认为..."}],
            mode=ArenaMode.DEBATE,
            topic="AI 会取代人类吗",
            rounds=5,
        )
        assert result.mode == ArenaMode.DEBATE
        assert result.topic == "AI 会取代人类吗"
        assert len(result.transcript) == 1


# =============================================================================
# ArenaEngine 初始化
# =============================================================================


class TestArenaEngineInit:
    def test_init_stores_client(self):
        from engines.arena.engine import ArenaEngine

        client = MockModelClient()
        engine = ArenaEngine(client)
        assert engine.model_client is client


# =============================================================================
# _create_judge
# =============================================================================


class TestCreateJudge:
    def test_judge_is_assistant_agent(self):
        from engines.arena.engine import ArenaEngine

        client = MockModelClient()
        engine = ArenaEngine(client)
        judge = engine._create_judge("AI 会取代人类吗")

        assert judge.name == "judge"

    def test_judge_system_prompt_contains_topic(self):
        from engines.arena.engine import ArenaEngine

        client = MockModelClient()
        engine = ArenaEngine(client)
        judge = engine._create_judge("是否应该取消高考")

        # 检查 system message 包含主题
        sys_msgs = judge._system_messages
        assert len(sys_msgs) >= 1
        assert "是否应该取消高考" in sys_msgs[0].content


# =============================================================================
# _parse_judge_result
# =============================================================================


class TestParseJudgeResult:
    def test_parse_valid_json(self):
        from engines.arena.engine import ArenaEngine

        engine = ArenaEngine(MockModelClient())
        raw = json.dumps({
            "agent_a_score": 30,
            "agent_b_score": 20,
            "winner": "A",
            "reasoning": "正方论据充分",
        })

        result = engine._parse_judge_result(raw, "id-a", "id-b")
        assert result["winner_id"] == "id-a"
        assert result["scores"]["id-a"] == 30
        assert result["scores"]["id-b"] == 20
        assert "论据充分" in result["reasoning"]

    def test_parse_json_in_markdown_block(self):
        from engines.arena.engine import ArenaEngine

        engine = ArenaEngine(MockModelClient())
        raw = """这是评分结果：
```json
{"agent_a_score": 25, "agent_b_score": 35, "winner": "B", "reasoning": "反方更优"}
```"""

        result = engine._parse_judge_result(raw, "id-a", "id-b")
        assert result["winner_id"] == "id-b"
        assert result["scores"]["id-b"] == 35

    def test_parse_invalid_json_returns_raw_text(self):
        """When JSON parsing fails, raw text is used as reasoning with default scores."""
        from engines.arena.engine import ArenaEngine

        engine = ArenaEngine(MockModelClient())
        raw = "这不是 JSON 格式的内容"

        result = engine._parse_judge_result(raw, "id-a", "id-b")
        assert result["winner_id"] == "id-a"  # 默认 A（分数相同时 A 胜出）
        assert result["scores"]["id-a"] == 20.0
        assert result["scores"]["id-b"] == 20.0
        assert result["reasoning"] == raw  # raw text preserved as reasoning

    def test_parse_winner_b(self):
        from engines.arena.engine import ArenaEngine

        engine = ArenaEngine(MockModelClient())
        raw = json.dumps({
            "agent_a_score": 15,
            "agent_b_score": 38,
            "winner": "B",
            "reasoning": "反方表达更清晰",
        })

        result = engine._parse_judge_result(raw, "id-a", "id-b")
        assert result["winner_id"] == "id-b"


# =============================================================================
# _judge_score
# =============================================================================


class TestJudgeScore:
    @pytest.mark.asyncio
    async def test_judge_score_with_valid_response(self):
        from engines.arena.engine import ArenaEngine

        judge_response = json.dumps({
            "agent_a_score": 28,
            "agent_b_score": 22,
            "winner": "A",
            "reasoning": "正方论证有力",
        })
        client = MockModelClient(judge_response)
        engine = ArenaEngine(client)

        agent_a = make_agent("id-a", "小明")
        agent_b = make_agent("id-b", "小红")
        transcript = [
            {"turn": 0, "speaker": "小明", "content": "我认为AI不会取代人类"},
            {"turn": 1, "speaker": "小红", "content": "但我认为有可能"},
        ]

        result = await engine._judge_score(agent_a, agent_b, transcript)
        assert result["winner_id"] == "id-a"
        assert result["scores"]["id-a"] == 28
        assert result["scores"]["id-b"] == 22

    @pytest.mark.asyncio
    async def test_judge_score_error_returns_default(self):
        from engines.arena.engine import ArenaEngine

        class BrokenClient:
            model_info = {"function_calling": True, "vision": False, "json_output": True}

            async def create(self, messages, **kwargs):
                raise RuntimeError("网络超时")

        engine = ArenaEngine(BrokenClient())
        agent_a = make_agent("id-a", "小明")
        agent_b = make_agent("id-b", "小红")

        result = await engine._judge_score(agent_a, agent_b, [])
        assert result["winner_id"] == "id-a"
        assert result["scores"]["id-a"] == 20.0
        assert "评分失败" in result["reasoning"]

# run_debate 集成测试见 test_arena_run_debate.py。
