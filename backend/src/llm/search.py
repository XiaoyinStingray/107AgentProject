"""
Web 搜索 Provider — 让 Agent 能搜索真实世界信息。

策略: DDG Instant Answer API (主) → Bing fallback → 本地缓存
"""

import asyncio
import json as _json
import re
import time
from urllib.parse import quote
from urllib.request import Request, urlopen

from loguru import logger

_cache: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL = 300


async def web_search(query: str, max_results: int = 5) -> list[dict]:
    """搜索互联网。DDG API 为主，Bing 为备用。"""
    now = time.time()
    cached = _cache.get(query)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1][:max_results]

    results = await _ddg_api(query, max_results)
    if not results or len(results) <= 1:
        bing = await _bing_fallback(query, max_results)
        if bing:
            results = results + bing

    if not results:
        results = [{"title": query, "snippet": "未找到结果，请尝试更换关键词。", "url": ""}]

    _cache[query] = (now, results)
    logger.info(f"[web_search] {query[:50]} → {len(results)} results")
    return results[:max_results]


async def _ddg_api(query: str, max_results: int) -> list[dict]:
    """DuckDuckGo Instant Answer API。"""
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
                    "title": _clean(t["Text"])[:80],
                    "snippet": t["Text"][:200],
                    "url": t.get("FirstURL", ""),
                })
                if len(results) >= max_results:
                    break
        return results
    except Exception as e:
        logger.warning(f"[web_search] DDG API: {e}")
        return []


async def _bing_fallback(query: str, max_results: int) -> list[dict]:
    """Bing 搜索 fallback——抓取搜索结果页。"""
    try:
        import httpx
        url = f"https://www.bing.com/search?q={quote(query)}&setlang=zh-cn"
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as c:
            resp = await c.get(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
                "Accept-Language": "zh-CN,zh;q=0.9",
            })
            html = resp.text

        results = []
        for m in re.finditer(r'<li class="b_algo"[^>]*>.*?<h2[^>]*>.*?<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?<p[^>]*>(.*?)</p>', html, re.DOTALL):
            url_found = m.group(1)
            title = _clean(m.group(2))
            snippet = _clean(m.group(3))
            if title and len(title) > 3:
                results.append({"title": title[:120], "snippet": snippet[:300], "url": url_found})
            if len(results) >= max_results:
                break
        if results:
            logger.info(f"[web_search] Bing: {len(results)} results")
        return results
    except Exception as e:
        logger.warning(f"[web_search] Bing: {e}")
        return []


def _clean(text: str) -> str:
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&quot;', '"').replace('&#x27;', "'").replace('&nbsp;', ' ')
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def format_search_results(results: list[dict]) -> str:
    if not results:
        return "⚠️ 搜索服务暂不可用，请稍后重试。"
    lines = [f"🔍 搜索结果（{len(results)} 条）："]
    for i, r in enumerate(results, 1):
        lines.append(f"{i}. {r['title']}")
        if r.get("snippet"):
            lines.append(f"   {r['snippet'][:200]}")
        if r.get("url") and r["url"].startswith("http"):
            lines.append(f"   🔗 {r['url'][:120]}")
    return "\n".join(lines)
