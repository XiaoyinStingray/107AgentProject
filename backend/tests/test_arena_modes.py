"""Step 46 三种 1v1 模式的专用提示、身份映射与硬超时测试。"""

import asyncio
import json

import pytest

from models.arena import ArenaMode
from tests.test_arena_engine import MockModelClient, make_agent


class FakeMessage:
    """最小 AutoGen 消息替身。"""

    def __init__(self, content: str, source: str):
        self.content = content
        self.source = source


class FakeRunResult:
    """最小 AutoGen 运行结果替身。"""

    def __init__(self, messages: list[FakeMessage]):
        self.messages = messages


def full_judge_response() -> str:
    """返回带四项分数的稳定裁判 JSON。"""
    return json.dumps({
        "scores": {"A": 35, "B": 30},
        "score_breakdown": {
            "A": {
                "argument_quality": 9,
                "expression": 9,
                "adaptability": 8,
                "character_consistency": 9,
            },
            "B": {
                "argument_quality": 8,
                "expression": 8,
                "adaptability": 7,
                "character_consistency": 7,
            },
        },
        "winner": "A",
        "reasoning": "A 的内容更完整。",
    })


@pytest.mark.parametrize(
    ("mode", "keyword"),
    [
        (ArenaMode.DEBATE, "辩论"),
        (ArenaMode.INTERVIEW, "面试竞争"),
        (ArenaMode.PITCH, "创业路演"),
    ],
)
def test_each_duel_mode_has_identity_and_output_constraints(mode, keyword):
    """每种模式都明确真实姓名、对手与无内心独白约束。"""
    from engines.arena.prompts import build_duel_system_prompt, build_duel_task

    system_prompt = build_duel_system_prompt(
        mode, "测试主题", "陈默", "苏瑶", 0
    )
    task = build_duel_task(mode, "测试主题", "陈默", "苏瑶", 3)

    assert keyword in system_prompt
    assert "你的身份: 陈默" in system_prompt
    assert "对手: 苏瑶" in system_prompt
    assert "不输出内心推理" in system_prompt
    assert "A: 陈默" in task
    assert "B: 苏瑶" in task


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("method_name", "expected_mode", "keyword"),
    [
        ("run_interview", ArenaMode.INTERVIEW, "面试竞争"),
        ("run_pitch", ArenaMode.PITCH, "创业路演"),
    ],
)
async def test_new_duel_modes_preserve_speaker_identity(
    monkeypatch,
    method_name,
    expected_mode,
    keyword,
):
    """面试和路演走真实 GroupChat 流程并保存明确 speaker_id。"""
    from engines.arena.engine import ArenaEngine
    import autogen_agentchat.teams as teams_mod

    captured: dict = {}
    timeouts: list[float] = []

    class FakeGroupChat:
        def __init__(self, **kwargs):
            captured.update(kwargs)

        async def run(self, task=None, cancellation_token=None):
            captured["task"] = task
            agent_a, agent_b = captured["participants"]
            return FakeRunResult([
                FakeMessage("A 的回答", agent_a.name),
                FakeMessage("B 的回答", agent_b.name),
            ])

    async def capture_wait_for(awaitable, timeout):
        timeouts.append(timeout)
        return await awaitable

    monkeypatch.setattr(teams_mod, "RoundRobinGroupChat", FakeGroupChat)
    monkeypatch.setattr(asyncio, "wait_for", capture_wait_for)
    engine = ArenaEngine(MockModelClient(full_judge_response()))
    agent_a = make_agent("id-a", "陈默")
    agent_b = make_agent("id-b", "苏瑶")

    result = await getattr(engine, method_name)(
        agent_a, agent_b, topic="校园创新负责人"
    )

    assert result.mode is expected_mode
    assert keyword in captured["task"]
    assert [(entry.speaker_id, entry.speaker) for entry in result.transcript] == [
        ("id-a", "陈默"),
        ("id-b", "苏瑶"),
    ]
    assert timeouts == [120, 90, 30]


@pytest.mark.asyncio
async def test_whole_duel_has_a_hard_timeout(monkeypatch):
    """动态总预算到期后仍原样抛出 TimeoutError。"""
    from engines.arena.engine import ArenaEngine, settings

    engine = ArenaEngine(MockModelClient(full_judge_response()))
    agent_a = make_agent("id-a", "陈默")
    agent_b = make_agent("id-b", "苏瑶")

    async def slow_duel(*_args, **_kwargs):
        await asyncio.sleep(0.05)

    monkeypatch.setattr(engine, "_run_duel", slow_duel)
    monkeypatch.setattr(settings, "agent_timeout_seconds", 0.001)

    with pytest.raises(TimeoutError):
        await engine.run_pitch(agent_a, agent_b, topic="超时测试")


@pytest.mark.asyncio
async def test_judge_timeout_is_not_converted_to_a_saved_draw(monkeypatch):
    """裁判超时必须上抛，不能走普通解析失败的平局降级。"""
    from engines.arena.scoring import ArenaScorer, settings
    from models.arena import ArenaTranscriptEntry

    class SlowModelClient(MockModelClient):
        async def create(self, messages, **kwargs):
            await asyncio.sleep(0.05)

    scorer = ArenaScorer(SlowModelClient())
    agent_a = make_agent("id-a", "陈默")
    agent_b = make_agent("id-b", "苏瑶")
    transcript = [
        ArenaTranscriptEntry(
            turn=0,
            round=1,
            speaker_id="id-a",
            speaker="陈默",
            content="测试发言",
        )
    ]
    monkeypatch.setattr(settings, "agent_timeout_seconds", 0.001)

    with pytest.raises(TimeoutError):
        await scorer.score_duel(
            ArenaMode.DEBATE,
            "裁判超时测试",
            agent_a,
            agent_b,
            transcript,
        )
