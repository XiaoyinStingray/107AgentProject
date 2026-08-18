"""  
LLM 调用兜底策略 — 超时 / API 错误时返回默认行为，防止 Agent 卡死。

对应 Blueprint §10.4。

用法:
    from llm.fallback import call_with_fallback

    result = await call_with_fallback(
        agent.autogen_agent.on_messages(messages, cancellation_token=token),
        timeout=30.0,
    )

    # 带重试和上下文兜底:
    result = await call_with_fallback(
        client.create(messages=msgs),
        timeout=15.0,
        retries=2,
        fallback_value="（LLM 暂不可用）",
        operation_name="场景对话",
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

# 可重试的异常类型（瞬时错误）
_RETRYABLE_EXCEPTIONS = (
    asyncio.TimeoutError,
    TimeoutError,
    ConnectionError,
    OSError,
)


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


async def call_with_fallback(
    coro,
    *,
    timeout: float | None = None,
    retries: int = 0,
    fallback_value: str | None = None,
    fallback_factory=None,
    operation_name: str = "LLM call",
):
    """包装任意异步调用，提供超时 + 重试 + 异常兜底。

    Args:
        coro: 要执行的 awaitable（如 agent.on_messages(...)）
        timeout: 超时秒数（默认取 settings.agent_timeout_seconds）
        retries: 最大重试次数（0=不重试，仅兜底）
        fallback_value: 兜底返回的文本（默认 DEFAULT_ACTION_TEXT）
        fallback_factory: 无参数 callable，返回自定义兜底对象
                           （兼容 FallbackResult 或任意对象）
        operation_name: 操作名称，用于日志

    Returns:
        正常结果，或兜底对象（is_fallback=True 的 FallbackResult / fallback_factory 产出）

    兜底策略:
        1. asyncio.TimeoutError → 重试（若 retries>0）→ 返回兜底值
        2. 可重试异常（Connection 等）→ 重试 → 返回兜底值
        3. 其他异常（API 错误等）→ log + 返回兜底值（不重试）
    """
    timeout = timeout or settings.agent_timeout_seconds
    fallback_text = fallback_value or DEFAULT_ACTION_TEXT
    last_error = None

    max_attempts = 1 + max(0, retries)
    for attempt in range(max_attempts):
        try:
            return await asyncio.wait_for(coro, timeout=timeout)
        except _RETRYABLE_EXCEPTIONS as error:
            last_error = error
            if attempt < max_attempts - 1:
                backoff = 2 * (attempt + 1)
                logger.warning(
                    f"[{operation_name}] attempt {attempt + 1}/{max_attempts} "
                    f"failed ({type(error).__name__}), retrying in {backoff}s"
                )
                await asyncio.sleep(backoff)
                continue
            # 最后一次也失败了
            logger.warning(
                f"[{operation_name}] timed out after {timeout}s "
                f"({max_attempts} attempts), using fallback"
            )
            break
        except Exception as error:
            # 不可重试的异常（如 Auth、RateLimit）直接兜底
            logger.error(
                f"[{operation_name}] failed: {type(error).__name__}: {error}"
            )
            last_error = error
            break

    # 返回兜底值
    if fallback_factory is not None:
        try:
            return fallback_factory()
        except Exception as factory_error:
            logger.error(
                f"[{operation_name}] fallback_factory also failed: {factory_error}"
            )
    return FallbackResult(content=fallback_text)
