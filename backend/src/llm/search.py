"""
Web 搜索 Provider — Step 83 / State 5: 让 Agent 能搜索真实世界信息。

P0: DuckDuckGo Lite HTML 搜索（无需 API key，返回真实网页结果）
P1: DuckDuckGo Instant Answer API (备用)
"""

import asyncio
import re
import time
from urllib.parse import quote

import httpx
from loguru import logger

_cache: dict[str, tuple[float, list[dict]]] = {}
_CACHE_TTL = 300


async def web_search(query: str, max_results: int = 5) -> list[dict]:
    """搜索互联网。

    主方案: DuckDuckGo Lite HTML 解析
    """
    now = time.time()
    cached = _cache.get(query)
    if cached and (now - cached[0]) < _CACHE_TTL:
        logger.debug(f"[web_search] cache hit: {query[:50]}")
        return cached[1][:max_results]

    results = []
    try:
        results = await _ddg_lite_search(query, max_results)
    except Exception as e:
        logger.warning(f"[web_search] Lite failed: {e}")

    if not results:
        try:
            results = await _ddg_api_fallback(query, max_results)
        except Exception as e2:
            logger.warning(f"[web_search] API fallback also failed: {e2}")

    if not results:
        results = [{"title": query, "snippet": "未找到结果，请尝试更换关键词。", "url": ""}]

    _cache[query] = (now, results)
    logger.info(f"[web_search] {query[:50]} → {len(results)} results")
    return results[:max_results]


async def _ddg_lite_search(query: str, max_results: int) -> list[dict]:
    """DDG Lite HTML 搜索。"""
    url = "https://lite.duckduckgo.com/lite/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        resp = await client.post(url, data={"q": query}, headers=headers)
        resp.raise_for_status()
        html = resp.text

    results = []
    # DDG Lite 结果: 每个结果是一个 <a> 标题链接 + 紧跟的 snippet 文本
    # 匹配 <a rel="nofollow" class="result-link" href="URL">Title</a>
    result_pattern = re.compile(
        r'<a\s+[^>]*href="([^"]*)"[^>]*>\s*(.*?)\s*</a>'
        r'\s*<span\s+class="[^"]*link-snippet[^"]*"[^>]*>(.*?)</span>',
        re.DOTALL | re.IGNORECASE,
    )
    for m in result_pattern.finditer(html):
        href, title, snippet = m.group(1), m.group(2), m.group(3)
        title = _strip_html(title)
        snippet = _strip_html(snippet)
        if title and len(title) > 2:
            results.append({"title": title[:120], "snippet": snippet[:300], "url": href})

    if not results:
        generic_pattern = re.compile(
            r'<td[^>]*class="[^"]*result-snippet[^"]*"[^>]*>(.*?)</td>',
            re.DOTALL | re.IGNORECASE,
        )
        for m in generic_pattern.finditer(html):
            text = _strip_html(m.group(1))
            if text and len(text) > 10:
                results.append({"title": query, "snippet": text[:300], "url": ""})
                if len(results) >= max_results:
                    break

    return results[:max_results]


async def _ddg_api_fallback(query: str, max_results: int) -> list[dict]:
    """DDG Instant Answer API（备用）。"""
    url = f"https://api.duckduckgo.com/?q={quote(query)}&format=json&no_html=1"
    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.get(url, headers={"User-Agent": "LifeLab/1.0"})
        resp.raise_for_status()
        data = resp.json()
    results = []
    if data.get("AbstractText"):
        results.append({
            "title": data.get("Heading", query),
            "snippet": data["AbstractText"][:300],
            "url": data.get("AbstractURL", ""),
        })
    for t in data.get("RelatedTopics", [])[:max_results - len(results)]:
        if isinstance(t, dict) and t.get("Text"):
            results.append({"title": t["Text"][:80], "snippet": t["Text"][:200], "url": t.get("FirstURL", "")})
    return results


def _strip_html(text: str) -> str:
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    text = text.replace('&quot;', '"').replace('&#x27;', "'")
    return re.sub(r'\s+', ' ', text).strip()


def format_search_results(results: list[dict]) -> str:
    if not results:
        return "⚠️ 搜索服务暂不可用。"
    valid = [r for r in results if r.get("snippet") and "未找到" not in r["snippet"]]
    if not valid:
        valid = results
    lines = [f"🔍 搜索结果（{len(valid)} 条）："]
    for i, r in enumerate(valid, 1):
        lines.append(f"{i}. {r['title']}")
        if r.get("snippet"):
            lines.append(f"   {r['snippet'][:200]}")
        if r.get("url") and r["url"].startswith("http"):
            lines.append(f"   🔗 {r['url'][:100]}")
    return "\n".join(lines)
