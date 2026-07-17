"""
PersonaBuilder 单元测试 — 用 Mock LLM，不需要真实 API key。
"""

import json

import pytest

# conftest.py 已设 anyio_backend = "asyncio"，所以 async 测试直接用。


# =============================================================================
# Mock LLM 客户端
# =============================================================================


from typing import Any


class _FakeCreateResult:
    """模拟 AutoGen CreateResult。"""

    def __init__(self, content: str):
        self.content = content


class MockLLMClient:
    """模拟 LLM 客户端——按预设内容返回。"""

    def __init__(self, fixed_response: str | None = None):
        self._fixed = fixed_response
        self.call_count = 0
        self.last_messages: list[Any] | None = None

    async def create(self, messages: list[Any]) -> _FakeCreateResult:
        self.call_count += 1
        self.last_messages = messages
        if self._fixed is not None:
            return _FakeCreateResult(self._fixed)
        # 默认返回 Mock Persona JSON
        from engines.persona.builder import MOCK_PERSONA_JSON

        return _FakeCreateResult(
            json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False)
        )


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def mock_client():
    """默认 Mock 客户端——返回合法 JSON。"""
    return MockLLMClient()


@pytest.fixture
def builder(mock_client):
    """注入 Mock 客户端的 PersonaBuilder。"""
    from engines.persona.builder import PersonaBuilder

    return PersonaBuilder(mock_client)


# =============================================================================
# Happy path
# =============================================================================


@pytest.mark.asyncio
async def test_build_returns_valid_result(builder):
    """正常输入 → 返回完整的 PersonaBuildResult。"""
    result = await builder.build("小镇做题家，社交恐惧，想进大厂")

    assert result.name == "小明"
    assert result.persona.mbti == "INTJ-T"
    assert result.persona.big_five.openness == 0.7
    assert len(result.persona.values) == 3
    assert result.persona.decision_style.info_processing == "analytical"
    assert len(result.persona.narrative) > 10
    assert result.background.hometown == "安徽某县城"
    assert len(result.background.key_events) == 2
    assert len(result.goals) == 1
    assert result.goals[0].id == "g1"
    assert result.goals[0].status == "active"
    assert len(result.raw_response) > 0


@pytest.mark.asyncio
async def test_build_strips_description_whitespace(builder, mock_client):
    """description 的前后空白被 trim。"""
    from engines.persona.builder import MOCK_PERSONA_JSON

    mock_client._fixed = json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False)
    result = await builder.build("  内向的程序员  ")
    assert result.name == "小明"


# =============================================================================
# 错误处理
# =============================================================================


@pytest.mark.asyncio
async def test_empty_description_raises(builder):
    """空描述 → ValueError。"""
    with pytest.raises(ValueError, match="不能为空"):
        await builder.build("")
    with pytest.raises(ValueError, match="不能为空"):
        await builder.build("   ")


@pytest.mark.asyncio
async def test_retry_on_bad_json_then_succeed(builder, mock_client):
    """第一次返回坏 JSON → 重试一次 → 第二次成功。"""
    from engines.persona.builder import MOCK_PERSONA_JSON

    # 第一次失败（不是 JSON），第二次成功
    mock_client._fixed = None  # 清除固定响应，改用 call_count 分叉

    call_results = [
        "这不是 JSON，LLM 抽风了...",
        json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False),
    ]

    async def create_variable(messages):
        mock_client.call_count += 1
        mock_client.last_messages = messages
        idx = min(mock_client.call_count, len(call_results)) - 1
        return _FakeCreateResult(call_results[idx])

    mock_client.create = create_variable  # type: ignore[method-assign]

    result = await builder.build("测试重试")
    assert mock_client.call_count == 2
    assert result.name == "小明"


@pytest.mark.asyncio
async def test_retry_exhausted_raises(builder, mock_client):
    """两次都失败 → ValueError。"""
    mock_client._fixed = "每次都是坏的返回 { broken json"
    with pytest.raises(ValueError, match="两次尝试"):
        await builder.build("测试失败")


# =============================================================================
# JSON 解析健壮性
# =============================================================================


@pytest.mark.asyncio
async def test_extract_json_from_markdown_fence(builder, mock_client):
    """LLM 返回 ```json ... ``` 包装时也能解析。"""
    from engines.persona.builder import MOCK_PERSONA_JSON

    json_str = json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False)
    mock_client._fixed = f"好的，这是生成的角色设定：\n```json\n{json_str}\n```"
    result = await builder.build("测试 markdown fence")
    assert result.name == "小明"


@pytest.mark.asyncio
async def test_extract_json_no_language_tag(builder, mock_client):
    """LLM 返回 ``` ... ```（无语言标记）也能解析。"""
    from engines.persona.builder import MOCK_PERSONA_JSON

    json_str = json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False)
    mock_client._fixed = f"```\n{json_str}\n```"
    result = await builder.build("测试无语言标记 fence")
    assert result.name == "小明"


# =============================================================================
# 边界情况
# =============================================================================


@pytest.mark.asyncio
async def test_build_with_minimal_json(builder, mock_client):
    """LLM 返回最小合法 JSON（仅必填字段）——不崩溃。"""
    minimal = {
        "name": "小美",
        "mbti": "ENFP-A",
        "big_five": {},
        "values": [],
        "decision_style": {},
        "narrative": "",
        "background": {},
        "goals": [],
    }
    mock_client._fixed = json.dumps(minimal, ensure_ascii=False)
    result = await builder.build("极简角色")
    assert result.name == "小美"
    assert result.persona.mbti == "ENFP-A"
    assert result.persona.big_five.openness == 0.5  # 默认值
    assert result.goals == []


@pytest.mark.asyncio
async def test_build_preserves_raw_response(builder, mock_client):
    """raw_response 字段保留 LLM 原始返回。"""
    raw = '{"name":"测试","mbti":"INTJ","big_five":{},"values":[],"decision_style":{},"narrative":"","background":{},"goals":[]}'
    mock_client._fixed = raw
    result = await builder.build("测试 raw")
    assert result.raw_response == raw


# =============================================================================
# _extract_json 单元测试
# =============================================================================


def test_extract_json_pure_json():
    from engines.persona.builder import _extract_json

    assert _extract_json('{"a":1}') == '{"a":1}'


def test_extract_json_with_markdown():
    from engines.persona.builder import _extract_json

    text = '```json\n{"a":1}\n```'
    assert _extract_json(text) == '{"a":1}'


def test_extract_json_text_with_json_inside():
    from engines.persona.builder import _extract_json

    text = '这是前言\n{"name":"测试"}\n这是后记'
    result = _extract_json(text)
    assert result == '{"name":"测试"}'


def test_extract_json_no_json():
    from engines.persona.builder import _extract_json

    assert _extract_json("纯文本，没有 JSON") is None
    assert _extract_json("") is None
