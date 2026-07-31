"""
Web 搜索 Provider — Step 83: 让 Agent 能搜索真实世界信息。

P0: DuckDuckGo Instant Answer API（无需 API key）
P1: SerpAPI / Bing 等付费 API
"""

import asyncio
import time
from urllib.parse import quote

from loguru import logger

# 简单内存缓存: {query: (timestamp, results)}
_cache: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL = 300  # 5 分钟


async def web_search(query: str, max_results: int = 3) -> list[dict]:
    """搜索互联网并返回结果。

    Args:
        query: 搜索关键词
        max_results: 最多返回条数

    Returns:
        [{title, snippet, url}, ...]
    """
    # 缓存检查
    now = time.time()
    cached = _cache.get(query)
    if cached and (now - cached[0]) < _CACHE_TTL:
        logger.debug(f"[web_search] cache hit: {query[:50]}")
        return cached[1][:max_results]

    try:
        # DuckDuckGo Instant Answer API
        import urllib.request
        import json as _json

        url = f"https://api.duckduckgo.com/?q={quote(query)}&format=json&no_html=1"
        req = urllib.request.Request(url, headers={"User-Agent": "LifeLab/1.0"})

        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(
            None, lambda: urllib.request.urlopen(req, timeout=5)
        )
        data = _json.loads(response.read().decode("utf-8"))

        results = []
        # AbstractText
        abstract = data.get("AbstractText", "")
        if abstract:
            results.append({
                "title": data.get("Heading", query),
                "snippet": abstract[:300],
                "url": data.get("AbstractURL", ""),
            })

        # RelatedTopics
        for topic in data.get("RelatedTopics", [])[:max_results - len(results)]:
            if isinstance(topic, dict):
                results.append({
                    "title": topic.get("Text", "")[:80] or query,
                    "snippet": topic.get("Text", "")[:200],
                    "url": topic.get("FirstURL", ""),
                })

        if not results:
            results = [{"title": query, "snippet": "未找到相关结果。", "url": ""}]

        _cache[query] = (now, results)
        logger.info(f"[web_search] {query[:50]} → {len(results)} results")
        return results[:max_results]

    except Exception as e:
        logger.warning(f"[web_search] failed: {e}")
        return [{"title": query, "snippet": f"搜索失败: {e}", "url": ""}]


def format_search_results(results: list[dict]) -> str:
    """格式化搜索结果为工具返回值字符串。"""
    if not results:
        return "⚠️ 搜索服务暂不可用。"
    lines = [f"🔍 搜索结果（{len(results)} 条）："]
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r['title']}")
        lines.append(f"   {r['snippet'][:150]}")
    return "\n".join(lines)
