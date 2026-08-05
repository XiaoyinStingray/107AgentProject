"""
Web 搜索 — DeepSeek Responses API 为主，Bing/DDG 为 fallback。

2026-08: DeepSeek 支持 Responses API 内置联网搜索（web_search tool）。
  优先使用 DeepSeek Responses API（当 LLM 配置为 DeepSeek 时），
  自动获得带引用的搜索摘要。
  Fallback: Bing API → DuckDuckGo Instant Answer API
  结果缓存: 5 分钟 TTL
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

    # 1. 优先: DeepSeek Responses API（内置联网搜索，2026-08 新功能）
    results = await _deepseek_search(query, max_results)

    # 2. Fallback: Bing
    if not results and _BING_API_KEY:
        results = await _bing_search(query, max_results)

    # 3. Fallback: DuckDuckGo
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


async def _deepseek_search(query: str, max_results: int) -> list[dict]:
    """DeepSeek Responses API — 内置联网搜索 (2026-08 新功能)。

    当 LLM 配置为 DeepSeek 时优先使用此方法，AI 自动提取和总结搜索结果。
    Docs: https://api-docs.deepseek.com/zh-cn/guides/responses_api/
    """
    import ssl
    from config import settings
    try:
        api_key = settings.llm_api_key
        model = settings.llm_model

        # 仅当使用 DeepSeek API 时启用
        if "deepseek" not in settings.llm_base_url.lower():
            return []

        # Responses API 端点（不带 /v1）
        url = "https://api.deepseek.com/responses"
        body = _json.dumps({
            "model": model,
            "input": query,
            "tools": [{"type": "web_search"}],
            "stream": False,
        }).encode("utf-8")

        def _fetch():
            req = Request(url, data=body, headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "User-Agent": "LifeLab/1.0",
            })
            ctx = ssl.create_default_context()
            with urlopen(req, timeout=15, context=ctx) as resp:
                return _json.loads(resp.read().decode("utf-8"))

        loop = asyncio.get_running_loop()
        data = await loop.run_in_executor(None, _fetch)

        results = []
        # 提取 output 中的文本
        for item in data.get("output", []):
            if item.get("type") == "message":
                for content in item.get("content", []):
                    if content.get("type") == "output_text":
                        text = content.get("text", "")
                        title = text[:80].split("\n")[0].strip("#* -")
                        results.append({
                            "title": title or query,
                            "snippet": text[:500],
                            "url": "",
                        })

        # 提取 annotations（引用链接）
        annotations = []
        for item in data.get("output", []):
            if item.get("type") == "message":
                for ann in item.get("annotations", []):
                    if ann.get("type") == "url_citation":
                        annotations.append({
                            "title": ann.get("title", "")[:120],
                            "url": ann.get("url", ""),
                            "index": ann.get("index", len(annotations) + 1),
                        })

        # 合并：如果 DeepSeek 返回了文本结果，优先使用
        if results:
            # 将 annotations 的 URL 附加到最后一个 result
            if annotations:
                urls = "\n".join(f"[{a['index']}] {a['url']}" for a in annotations)
                results[-1]["snippet"] += f"\n\n🔗 引用来源:\n{urls}"
            logger.info(f"[deepseek_search] {query[:50]} -> {len(results)} results + {len(annotations)} citations")
            return results[:max_results]

        # 如果只有 annotations 没有文本
        if annotations:
            for a in annotations[:max_results]:
                results.append({
                    "title": a["title"],
                    "snippet": "",
                    "url": a["url"],
                })
            return results

        return []
    except Exception as e:
        logger.warning(f"[deepseek_search] {e}")
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
