"""PersonaRemixer 单元测试——Mock LLM，不访问网络。"""

import json

import pytest

from engines.persona.remixer import (
    PersonaRemixer,
    RemixGenerationError,
    RemixNoChangesError,
)
from models.agent import Background, BigFive, DecisionStyle, Goal, Persona
from models.remix import BigFivePatch, RemixDraft, RemixSpec


class _Result:
    def __init__(self, content: str):
        self.content = content


class MockClient:
    def __init__(self, responses: list[str]):
        self.responses = responses
        self.calls = 0

    async def create(self, messages):
        response = self.responses[min(self.calls, len(self.responses) - 1)]
        self.calls += 1
        return _Result(response)


def make_source() -> RemixDraft:
    return RemixDraft(
        persona=Persona(
            name="陈默",
            mbti="INTJ-T",
            big_five=BigFive(
                openness=0.6,
                conscientiousness=0.8,
                extraversion=0.2,
                agreeableness=0.5,
                neuroticism=0.6,
            ),
            values=["成长", "独立"],
            decision_style=DecisionStyle(
                info_processing="analytical",
                risk_preference="averse",
                social_tendency="independent",
                stress_response="adaptive",
            ),
            narrative="陈默安静、自律，习惯独自解决问题。",
        ),
        background=Background(
            hometown="合肥",
            family="普通家庭",
            education="大学本科",
            key_events=["第一次竞赛失利"],
        ),
        goals=[Goal(id="g1", description="完成学业", priority=1)],
    )


def remix_json() -> str:
    payload = make_source().model_dump(mode="json")
    payload["persona"]["name"] = "擅自改名"
    payload["persona"]["big_five"]["extraversion"] = 0.7
    payload["persona"]["decision_style"]["risk_preference"] = "seeking"
    payload["persona"]["narrative"] = "陈默变得更愿意主动交流，也更敢尝试可控风险。"
    payload["background"]["hometown"] = "被 LLM 擅自修改"
    payload["goals"][0]["description"] = "被 LLM 擅自修改"
    payload["summary"] = "提高外向性和风险接受度。"
    return json.dumps(payload, ensure_ascii=False)


@pytest.mark.asyncio
async def test_preview_enforces_preserved_fields_and_trait_target():
    source = make_source()
    remixer = PersonaRemixer(MockClient([remix_json()]))
    spec = RemixSpec(
        instruction="更外向、更敢冒险",
        trait_targets=BigFivePatch(extraversion=0.8),
    )

    draft, changes, summary = await remixer.preview(source, spec)

    assert draft.persona.name == source.persona.name
    assert draft.background == source.background
    assert draft.goals == source.goals
    assert draft.persona.big_five.extraversion == 0.8
    assert draft.persona.decision_style.risk_preference == "seeking"
    assert any(change.field == "persona.big_five.extraversion" for change in changes)
    assert summary == "提高外向性和风险接受度。"


@pytest.mark.asyncio
async def test_preview_retries_invalid_json():
    client = MockClient(["not-json", remix_json()])
    remixer = PersonaRemixer(client)

    draft, _, _ = await remixer.preview(
        make_source(),
        RemixSpec(instruction="更外向"),
    )

    assert client.calls == 2
    assert draft.persona.name == "陈默"


@pytest.mark.asyncio
async def test_preview_raises_after_two_invalid_responses():
    remixer = PersonaRemixer(MockClient(["bad", "still bad"]))

    with pytest.raises(RemixGenerationError, match="两次尝试"):
        await remixer.preview(make_source(), RemixSpec(instruction="更外向"))


def test_finalize_rejects_unchanged_draft():
    source = make_source()
    remixer = PersonaRemixer(MockClient([remix_json()]))

    with pytest.raises(RemixNoChangesError, match="没有产生实际变化"):
        remixer.finalize(source, source.model_copy(deep=True), RemixSpec(instruction="保持不变"))


def test_spec_rejects_big_five_preserve_and_targets():
    with pytest.raises(ValueError, match="保护 big_five"):
        RemixSpec(
            instruction="更外向",
            trait_targets=BigFivePatch(extraversion=0.8),
            preserve_fields=["big_five"],
        )


def test_spec_rejects_empty_instruction_and_targets():
    """instruction 和 trait_targets 都为空时应被拒绝。"""
    with pytest.raises(ValueError, match="至少提供一项"):
        RemixSpec(
            instruction="",
            trait_targets=BigFivePatch(),
        )


def test_remix_request_validates_action_payload():
    """RemixRequest 验证 action 和 draft 的匹配关系。"""
    from models.remix import RemixRequest, RemixSpec, RemixDraft
    from models.agent import Persona, Background

    spec = RemixSpec(instruction="测试")

    # preview 请求不能携带 draft
    draft = RemixDraft(persona=Persona(), background=Background())
    with pytest.raises(ValueError, match="preview 请求不能携带 draft"):
        RemixRequest(action="preview", spec=spec, draft=draft)

    # create 请求必须携带 draft
    with pytest.raises(ValueError, match="create 请求必须携带"):
        RemixRequest(action="create", spec=spec, draft=None)
