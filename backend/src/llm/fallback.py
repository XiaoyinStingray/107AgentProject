"""
LLM 调用兜底策略 — 超时 / API 错误时返回默认行为，防止 Agent 卡死。

对应 Blueprint §10.4。

用法:
    from llm.fallback import call_with_fallback

    result = await call_with_fallback(
        agent.autogen_agent.on_messages(messages, cancellation_token=token),
        timeout=30.0,
    )
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone

from loguru import logger

from config import settings


# =============================================================================
# 默认行为常量
# =============================================================================

DEFAULT_ACTION_TEXT = "（继续当前活动）"


@dataclass
class FallbackResult:
    """兜底结果——与 AutoGen Response 接口兼容的最小结构。"""

    content: str
    is_fallback: bool = True

    def __str__(self) -> str:
        return self.content


# =============================================================================
# 核心：带兜底的异步调用包装器
# =============================================================================


async def call_with_fallback(coro, *, timeout: float | None = None):
    """包装任意异步调用，提供超时 + 异常兜底。

    Args:
        coro: 要执行的 awaitable（如 agent.on_messages(...)）
        timeout: 超时秒数（默认取 settings.agent_timeout_seconds）

    Returns:
        正常结果，或 FallbackResult（is_fallback=True）

    兜底策略:
        1. asyncio.TimeoutError → 返回 DEFAULT_ACTION
        2. Exception（API 错误等）→ log + 返回 DEFAULT_ACTION
    """
    timeout = timeout or settings.agent_timeout_seconds
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning(f"LLM call timed out after {timeout}s, using default action")
        return FallbackResult(content=DEFAULT_ACTION_TEXT)
    except Exception as error:
        logger.error(f"LLM call failed: {type(error).__name__}: {error}")
        return FallbackResult(content=DEFAULT_ACTION_TEXT)
