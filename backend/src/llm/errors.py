"""Translate upstream LLM failures into stable, user-facing API errors."""

from dataclasses import dataclass
from typing import Iterator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from loguru import logger
from openai import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    RateLimitError,
)


@dataclass(frozen=True)
class LLMErrorInfo:
    """Safe API representation of a known upstream LLM failure."""

    status_code: int
    code: str
    message: str


def _exception_chain(error: BaseException) -> Iterator[BaseException]:
    """Yield an exception and its nested causes without looping."""
    pending = [error]
    seen: set[int] = set()
    while pending:
        current = pending.pop()
        if id(current) in seen:
            continue
        seen.add(id(current))
        yield current

        if isinstance(current, BaseExceptionGroup):
            pending.extend(current.exceptions)
        if current.__cause__ is not None:
            pending.append(current.__cause__)
        if current.__context__ is not None:
            pending.append(current.__context__)


def classify_llm_error(error: BaseException) -> LLMErrorInfo | None:
    """Classify known OpenAI-compatible client errors.

    DeepSeek uses an OpenAI-compatible API, so its authentication, rate-limit,
    timeout, and connection failures surface through these exception classes.
    Unrelated exceptions return ``None`` and remain handled by FastAPI.
    """
    for current in _exception_chain(error):
        if isinstance(current, AuthenticationError):
            return LLMErrorInfo(
                status_code=401,
                code="invalid_api_key",
                message="LLM API Key 无效，请检查 .env 配置并重启后端",
            )
        if isinstance(current, RateLimitError):
            return LLMErrorInfo(
                status_code=429,
                code="llm_rate_limited",
                message="LLM 请求过于频繁或账户余额不足，请稍后重试",
            )
        if isinstance(current, APITimeoutError):
            return LLMErrorInfo(
                status_code=504,
                code="llm_timeout",
                message="LLM 服务响应超时，请稍后重试",
            )
        if isinstance(current, APIConnectionError):
            return LLMErrorInfo(
                status_code=502,
                code="llm_unavailable",
                message="无法连接 LLM 服务，请检查网络和 API 地址",
            )
    return None


def register_llm_error_middleware(app: FastAPI) -> None:
    """Register a narrow middleware that translates only known LLM failures."""

    @app.middleware("http")
    async def llm_error_middleware(request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as error:
            info = classify_llm_error(error)
            if info is None:
                raise
            logger.warning(
                "LLM request failed: code={}, path={}",
                info.code,
                request.url.path,
            )
            return JSONResponse(
                status_code=info.status_code,
                content={"error": info.code, "message": info.message},
            )
