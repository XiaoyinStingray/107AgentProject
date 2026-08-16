"""
LLM 客户端工厂 — 从 settings 创建 AutoGen OpenAIChatCompletionClient。

用法:
    from llm.client import create_model_client
    client = create_model_client()
    result = await client.create(messages=[...])
"""

from typing import Literal

from config import settings


LLMProfile = Literal["think", "act"]


def _uses_official_deepseek_v4() -> bool:
    """Return whether the configured endpoint is the official DeepSeek V4 API."""
    return (
        "api.deepseek.com" in settings.llm_base_url.lower()
        and settings.llm_model.lower().startswith("deepseek-v4-")
    )


def create_model_client(profile: LLMProfile = "think"):
    """按用途从全局 settings 创建 OpenAI 兼容的 LLM 客户端。

    支持 DeepSeek、GLM、OpenAI 等所有 OpenAI 兼容 API。
    AutoGen 的 import 延迟到函数调用时——避免模块加载阶段拖慢启动。
    """
    from autogen_ext.models.openai import OpenAIChatCompletionClient

    if profile not in ("think", "act"):
        raise ValueError(f"Unsupported LLM profile: {profile}")

    # 非 OpenAI 官方模型（如 DeepSeek）需要显式提供 model_info
    # 这是一个 TypedDict，所有 Required 字段必须存在
    model_info = {
        "vision": False,
        "function_calling": True,
        "json_output": True,
        "family": "unknown",
        "structured_output": False,
        # multiple_system_messages 是 Optional，DeepSeek 支持多条 system message
    }

    # Step 103: 优先使用用户可调参数，兜底用 .env 常量
    try:
        from config import get_settings as _get_user_settings
        _us = _get_user_settings()
        _user_temp = _us.temperature_think if profile == "think" else _us.temperature_act
    except Exception:
        _user_temp = None

    if _user_temp is not None:
        temperature = _user_temp
    elif profile == "think":
        temperature = settings.llm_temperature_think
    else:
        temperature = settings.llm_temperature_act
    create_options: dict[str, object] = {"temperature": temperature}
    if _uses_official_deepseek_v4():
        create_options["extra_body"] = {
            "thinking": {
                "type": "enabled" if settings.llm_thinking_enabled else "disabled"
            }
        }
        if settings.llm_thinking_enabled:
            create_options.pop("temperature")

    return OpenAIChatCompletionClient(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        # AutoGen/OpenAI 客户端有自己的请求超时；如果不显式传入，
        # settings.agent_timeout_seconds 不会对 Worker 的模型请求生效。
        timeout=float(settings.agent_timeout_seconds),
        max_tokens=settings.llm_max_tokens,
        model_info=model_info,  # type: ignore[arg-type]
        **create_options,
    )
