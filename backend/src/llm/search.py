"""
Web 搜索 — Bing Web Search API 为主，DuckDuckGo 为 fallback。

Step 100: 替换纯 DuckDuckGo 方案。
  - 主搜索: Bing Web Search API (国内可用，免费层 1000次/月)
  - Fallback: DuckDuckGo Instant Answer API
  - 结果缓存: 5 分钟 TTL
"""

import asyncio
import json as _json
import os
import re
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

from loguru import logger

_cache: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL = 300

# Bing API 配置（从环境变量读取，未配置时自动 fallback 到 DDG）
_BING_API_KEY = os.environ.get("BING_API_KEY", "")
_BING_ENDPOINT = "https://api.bing.microsoft.com/v7.0/search"


async def web_search(query: str, max_results: int = 5) -> list[dict]:
    """搜索互联网。Bing 优先 → DuckDuckGo fallback。

    Args:
        query: 搜索关键词
        max_results: 最大返回结果数（默认 5）

    Returns:
        搜索结果列表 [{title, snippet, url}, ...]
    """
    now = time.time()
    cached = _cache.get(query)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1][:max_results]

    # 尝试 Bing
    results = []
    if _BING_API_KEY:
        results = await _bing_search(query, max_results)

    # Fallback: DuckDuckGo
    if not results:
        results = await _ddg_search(query, max_results)

    # 兜底提示
    if not results:
        results = [{
            "title": query,
            "snippet": "无搜索结果。建议换关键词或直接基于已有知识完成任务，不要反复搜索。",
            "url": "",
        }]

    _cache[query] = (now, results)
    logger.info(f"[web_search] {query[:50]} -> {len(results)} results (source: {'bing' if _BING_API_KEY and results else 'ddg'})")
    return results[:max_results]


async def _bing_search(query: str, max_results: int) -> list[dict]:
    """Bing Web Search API v7。"""
    import ssl
    try:
        url = f"{_BING_ENDPOINT}?q={quote(query)}&count={max_results}&mkt=zh-CN"
        loop = asyncio.get_running_loop()

        def _fetch():
            req = Request(url, headers={
                "Ocp-Apim-Subscription-Key": _BING_API_KEY,
                "User-Agent": "LifeLab/1.0",
            })
            ctx = ssl.create_default_context()
            with urlopen(req, timeout=8, context=ctx) as resp:
                return _json.loads(resp.read().decode("utf-8"))

        data = await loop.run_in_executor(None, _fetch)
        results = []
        for item in data.get("webPages", {}).get("value", []):
            results.append({
                "title": item.get("name", "")[:120],
                "snippet": item.get("snippet", "")[:300],
                "url": item.get("url", ""),
            })
            if len(results) >= max_results:
                break
        return results
    except Exception as e:
        logger.warning(f"[bing_search] {e}")
        return []


async def _ddg_search(query: str, max_results: int) -> list[dict]:
    """DuckDuckGo Instant Answer API（fallback）。"""
    try:
        url = f"https://api.duckduckgo.com/?q={quote(query)}&format=json&no_html=1&skip_disambig=1"
        loop = asyncio.get_running_loop()

        def _fetch():
            req = Request(url, headers={"User-Agent": "LifeLab/1.0"})
            with urlopen(req, timeout=5) as resp:
                return _json.loads(resp.read().decode("utf-8"))

        data = await loop.run_in_executor(None, _fetch)
        results = []
        if data.get("AbstractText"):
            results.append({
                "title": data.get("Heading", query)[:120],
                "snippet": data["AbstractText"][:300],
                "url": data.get("AbstractURL", ""),
            })
        for t in data.get("RelatedTopics", []):
            if isinstance(t, dict) and t.get("Text"):
                results.append({
                    "title": _strip_html(t["Text"])[:80],
                    "snippet": t["Text"][:200],
                    "url": t.get("FirstURL", ""),
                })
                if len(results) >= max_results:
                    break
        return results
    except Exception as e:
        logger.warning(f"[ddg_search] {e}")
        return []


def _strip_html(text: str) -> str:
    text = re.sub(r'<[^>]+>', '', text)
    for e in [('&amp;', '&'), ('&lt;', '<'), ('&gt;', '>'), ('&quot;', '"'), ('&nbsp;', ' ')]:
        text = text.replace(e[0], e[1])
    return re.sub(r'\s+', ' ', text).strip()


def format_search_results(results: list[dict]) -> str:
    """格式化搜索结果。"""
    if not results:
        return "搜索无结果。建议：停止搜索，直接基于已有知识完成任务。"
    real = [r for r in results if "建议" not in r.get("snippet", "")]
    if not real:
        return "搜索无结果。建议：停止搜索，直接基于已有知识完成任务。"
    lines = [f"搜索结果（{len(real)} 条）："]
    for i, r in enumerate(real, 1):
        lines.append(f"{i}. {r['title']}")
        if r.get("snippet"):
            lines.append(f"   {r['snippet'][:200]}")
        if r.get("url"):
            lines.append(f"   🔗 {r['url']}")
    return "\n".join(lines)
