"""
Web 搜索 — DuckDuckGo Instant Answer API。
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
    """搜索互联网。"""
    now = time.time()
    cached = _cache.get(query)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1][:max_results]

    results = await _ddg_api(query, max_results)

    if not results:
        results = [{"title": query, "snippet": "无搜索结果。建议换关键词或直接基于已有知识完成任务，不要反复搜索。", "url": ""}]

    _cache[query] = (now, results)
    logger.info(f"[web_search] {query[:50]} -> {len(results)} results")
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
                    "title": _strip(t["Text"])[:80],
                    "snippet": t["Text"][:200],
                    "url": t.get("FirstURL", ""),
                })
                if len(results) >= max_results:
                    break
        return results
    except Exception as e:
        logger.warning(f"[web_search] {e}")
        return []


def _strip(text: str) -> str:
    text = re.sub(r'<[^>]+>', '', text)
    for e in [('&amp;','&'),('&lt;','<'),('&gt;','>'),('&quot;','"'),('&nbsp;',' ')]:
        text = text.replace(e[0], e[1])
    return re.sub(r'\s+', ' ', text).strip()


def format_search_results(results: list[dict]) -> str:
    """格式化搜索结果。无结果时明确建议停止搜索。"""
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
    return "\n".join(lines)
