"""LLM client construction regression tests."""


def test_create_model_client_applies_configured_request_timeout(monkeypatch):
    import autogen_ext.models.openai as autogen_openai
    from config import settings
    from llm.client import create_model_client

    captured: dict = {}

    class FakeClient:
        def __init__(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(autogen_openai, "OpenAIChatCompletionClient", FakeClient)
    monkeypatch.setattr(settings, "agent_timeout_seconds", 37)

    client = create_model_client("act")

    assert isinstance(client, FakeClient)
    assert captured["timeout"] == 37.0
