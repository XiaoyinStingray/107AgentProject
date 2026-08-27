"""LLM error translation unit and middleware tests."""

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openai import AuthenticationError, RateLimitError

from llm.errors import classify_llm_error, register_llm_error_middleware


def _status_response(status_code: int) -> httpx.Response:
    request = httpx.Request("POST", "https://api.deepseek.com/chat/completions")
    return httpx.Response(status_code, request=request)


def test_classify_authentication_error():
    error = AuthenticationError(
        "Authentication Fails",
        response=_status_response(401),  # type: ignore[arg-type]
        body={"error": "invalid key"},
    )

    info = classify_llm_error(error)

    assert info is not None
    assert info.status_code == 401
    assert info.code == "invalid_api_key"
    assert "API Key 无效" in info.message


def test_classify_rate_limit_error():
    error = RateLimitError(
        "Rate limit reached",
        response=_status_response(429),  # type: ignore[arg-type]
        body={"error": "insufficient balance"},
    )

    info = classify_llm_error(error)

    assert info is not None
    assert info.status_code == 429
    assert info.code == "llm_rate_limited"


def test_unrelated_error_is_not_classified():
    assert classify_llm_error(ValueError("ordinary validation error")) is None


def test_middleware_returns_structured_authentication_error():
    app = FastAPI()
    register_llm_error_middleware(app)

    @app.get("/requires-llm")
    async def requires_llm():
        raise AuthenticationError(
            "Authentication Fails",
            response=_status_response(401),  # type: ignore[arg-type]
            body={"error": "invalid key"},
        )

    with TestClient(app) as client:
        response = client.get("/requires-llm")

    assert response.status_code == 401
    assert response.json() == {
        "error": "invalid_api_key",
        "message": "LLM API Key 无效，请检查 .env 配置并重启后端",
    }
