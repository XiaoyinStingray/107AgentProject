"""
LLM 客户端工厂 — 从 settings 创建 AutoGen OpenAIChatCompletionClient。

用法:
    from llm.client import create_model_client
    client = create_model_client()
    result = await client.create(messages=[...])
"""

from autogen_ext.models.openai import OpenAIChatCompletionClient

from config import settings


def create_model_client() -> OpenAIChatCompletionClient:
    """从全局 settings 创建与 OpenAI 兼容的 LLM 客户端。

    支持 DeepSeek、GLM、OpenAI 等所有 OpenAI 兼容 API。
    """
    return OpenAIChatCompletionClient(
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        temperature=settings.llm_temperature_think,
        max_tokens=settings.llm_max_tokens,
    )
