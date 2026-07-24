"""
LLM 客户端工厂 — 从 settings 创建 AutoGen OpenAIChatCompletionClient。

用法:
    from llm.client import create_model_client
    client = create_model_client()
    result = await client.create(messages=[...])
"""

from config import settings


def create_model_client():
    """从全局 settings 创建与 OpenAI 兼容的 LLM 客户端。

    支持 DeepSeek、GLM、OpenAI 等所有 OpenAI 兼容 API。
    AutoGen 的 import 延迟到函数调用时——避免模块加载阶段拖慢启动。
    """
    from autogen_ext.models.openai import OpenAIChatCompletionClient

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

    return OpenAIChatCompletionClient(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=settings.llm_temperature_think,
        max_tokens=settings.llm_max_tokens,
        model_info=model_info,  # type: ignore[arg-type]
    )
