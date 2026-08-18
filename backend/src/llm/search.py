"""  
Web 搜索 — DeepSeek Responses API 为主，Sogou/Bing/Baidu 为 fallback。

2026-08: DeepSeek 支持 Responses API 内置联网搜索（web_search tool）。
  优先使用 DeepSeek Responses API（当 LLM 配置为 DeepSeek 时），
  自动获得带引用的搜索摘要。
  Fallback: Sogou → Bing HTML → Baidu → DuckDuckGo（短超时）
  结果缓存: 5 分钟 TTL（含失败查询）
  国内优化: Sogou 为主要 fallback（国内稳定、无需 API key）
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
_failed_cache: dict[str, float] = {}  # 失败查询缓存，避免重复超时
_FAILED_CACHE_TTL = 600  # 失败缓存 10 分钟

# ── 全局断路器：连续 N 次搜索全部引擎失败 → 直接拒绝后续搜索 ──
_circuit: dict = {
    "fail_streak": 0,       # 连续失败次数
    "block_until": 0.0,     # 断路截止时间戳
}
_GLOBAL_FAIL_LIMIT: int = 3         # 连续失败 3 次后触发断路
_GLOBAL_BLOCK_DURATION: float = 300 # 断路 5 分钟

# Bing API 配置（从环境变量读取，未配置时自动 fallback 到 DDG）
_BING_API_KEY = os.environ.get("BING_API_KEY", "")
_BING_ENDPOINT = "https://api.bing.microsoft.com/v7.0/search"


async def web_search(query: str, max_results: int = 5) -> list[dict]:
    """搜索互联网。DeepSeek → Bing → Baidu → DDG fallback。

    Args:
        query: 搜索关键词
        max_results: 最大返回结果数（默认 5）

    Returns:
        搜索结果列表 [{title, snippet, url}, ...]
    """
    now = time.time()

    # ── 全局断路器检查：连续失败后直接拒绝，避免反复超时 ──
    block_until = _circuit["block_until"]
    if now < block_until:
        remaining = int(block_until - now)
        logger.info(f"[web_search] circuit-breaker active, {remaining}s remaining. query={query[:40]}")
        return [{
            "title": query,
            "snippet": (f"⚠️ 搜索功能暂时不可用（所有引擎连续失败，已断路 {remaining} 秒）。"
                        "请直接基于已有知识完成任务，不要再调用 web_search。"),
            "url": "",
        }]

    cached = _cache.get(query)
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1][:max_results]

    # 检查失败缓存——避免相同/相似查询重复超时
    if query in _failed_cache and (now - _failed_cache[query]) < _FAILED_CACHE_TTL:
        logger.info(f"[web_search] skip cached-fail query: {query[:40]}")
        return [{
            "title": query,
            "snippet": "此查询此前搜索失败，短期内不再重试。请直接基于已有知识完成任务。",
            "url": "",
        }]

    source = "none"
    t0 = time.time()

    # 1. 优先: DeepSeek Responses API（内置联网搜索，2026-08 新功能）
    results = await _deepseek_search(query, max_results)
    if results:
        source = "deepseek"

    # 2. Fallback: 搜狗 / Bing HTML / 百度 并行发起（谁先返回用谁）
    #    跳过 Bing API（无 key 时不试）、DDG（国内基本不通）
    if not results:
        tasks = [
            _sogou_search(query, max_results),
            _bing_html_search(query, max_results),
            _baidu_search(query, max_results),
        ]
        if _BING_API_KEY:
            tasks.append(_bing_search(query, max_results))

        done_results = await _race_fallbacks(tasks)
        if done_results:
            results = done_results
            # 判断来源（取第一个成功的）
            source = "parallel_fallback"

    # 兜底提示
    if not results:
        _failed_cache[query] = now
        _circuit["fail_streak"] += 1
        streak = _circuit["fail_streak"]
        elapsed = time.time() - t0
        logger.warning(f"[web_search] all engines failed for '{query[:40]}' "
                       f"(streak={streak}/{_GLOBAL_FAIL_LIMIT}, {elapsed:.1f}s)")
        if streak >= _GLOBAL_FAIL_LIMIT:
            _circuit["block_until"] = time.time() + _GLOBAL_BLOCK_DURATION
            logger.warning(f"[web_search] circuit-breaker OPEN for {_GLOBAL_BLOCK_DURATION}s")
        results = [{
            "title": query,
            "snippet": ("⚠️ 所有搜索引擎均无结果。请停止搜索，直接基于已有知识完成任务。"
                        "换关键词重试不会有效果。"),
            "url": "",
        }]
        source = "fallback"
    else:
        # 成功 → 重置连续失败计数
        _circuit["fail_streak"] = 0

    _cache[query] = (now, results)
    logger.info(f"[web_search] {query[:50]} -> {len(results)} results (source: {source})")
    return results[:max_results]


async def _race_fallbacks(tasks: list) -> list[dict]:
    """并行执行多个搜索引擎，返回第一个成功的结果。"""
    if not tasks:
        return []
    task_objs = [asyncio.create_task(t) for t in tasks]
    remaining = set(task_objs)
    while remaining:
        done, remaining = await asyncio.wait(remaining, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            try:
                result = t.result()
                if result:
                    # 成功 → 取消其余任务
                    for r in remaining:
                        r.cancel()
                    return result
            except Exception:
                pass
    return []


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
            with urlopen(req, timeout=5, context=ctx) as resp:
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


async def _baidu_search(query: str, max_results: int) -> list[dict]:
    """百度搜索 HTML 抓取（国内可访问，无需 API key）。

    解析百度搜索结果页面，提取标题、摘要和链接。
    自动检测 CAPTCHA 并快速返回空。
    """
    import ssl
    import re as _re
    try:
        url = f"https://www.baidu.com/s?wd={quote(query)}&rn={max_results}"
        loop = asyncio.get_running_loop()

        def _fetch():
            req = Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9",
            })
            ctx = ssl.create_default_context()
            with urlopen(req, timeout=3, context=ctx) as resp:
                return resp.read().decode("utf-8", errors="replace")

        html = await loop.run_in_executor(None, _fetch)

        # CAPTCHA 检测：百度安全验证页面
        if "百度安全验证" in html or "wappass" in html or len(html) < 5000:
            logger.warning("[baidu_search] CAPTCHA detected, skipping")
            return []
        results = []

        # 百度搜索结果在 <div class="result"> 或 <div class="c-container"> 中
        # 标题: <h3 class="t"> 或 <h3> 内的 <a> 标签
        # 摘要: <span class="content-right_8Zs40"> 或 <div class="c-abstract">  
        # 链接: <a> 的 href 属性（百度会重定向，需要提取真实 URL）

        # 方法：用正则提取所有搜索结果块
        # 每个结果大致结构: <div class="result" ...><h3><a href="...">title</a></h3>...<span class="...">snippet</span>...
        result_blocks = _re.findall(
            r'<div\s+class="[^"]*result[^"]*"[^>]*>(.*?)</div>\s*(?=<div\s+class="[^"]*result[^"]*"|<div\s+class="[^"]*c-container[^"]*"|$)',
            html, _re.DOTALL
        )

        if not result_blocks:
            # 备用：按 c-container 分割
            result_blocks = _re.findall(
                r'<div\s+class="[^"]*c-container[^"]*"[^>]*>(.*?)</div>\s*(?=<div\s+class="[^"]*c-container[^"]*"|$)',
                html, _re.DOTALL
            )

        for block in result_blocks:
            if len(results) >= max_results:
                break

            # 提取标题
            title_match = _re.search(r'<h3[^>]*>.*?<a[^>]*>(.*?)</a>', block, _re.DOTALL)
            if not title_match:
                title_match = _re.search(r'<h3[^>]*>(.*?)</h3>', block, _re.DOTALL)
            if not title_match:
                continue
            title = _strip_html(title_match.group(1)).strip()
            if not title or len(title) < 2:
                continue

            # 提取链接
            link_match = _re.search(r'<h3[^>]*>.*?<a[^>]+href="([^"]+)"', block, _re.DOTALL)
            real_url = ""
            if link_match:
                href = link_match.group(1)
                # 百度链接是重定向 URL: https://www.baidu.com/link?url=xxx
                if "baidu.com/link" in href:
                    # 尝试提取真实 URL（百度有时会在页面中嵌入真实 URL）
                    real_url = href
                else:
                    real_url = href

            # 提取摘要
            snippet = ""
            snippet_match = _re.search(
                r'<span\s+class="[^"]*content[^"]*"[^>]*>(.*?)</span>',
                block, _re.DOTALL
            )
            if not snippet_match:
                snippet_match = _re.search(
                    r'<div\s+class="[^"]*c-abstract[^"]*"[^>]*>(.*?)</div>',
                    block, _re.DOTALL
                )
            if not snippet_match:
                # 最后尝试：提取所有文本内容作为摘要
                snippet_match = _re.search(
                    r'<span[^>]*class="[^"]*"[^>]*>(.{20,300}?)</span>',
                    block, _re.DOTALL
                )
            if snippet_match:
                snippet = _strip_html(snippet_match.group(1)).strip()[:300]

            results.append({
                "title": title[:120],
                "snippet": snippet,
                "url": real_url,
            })

        return results
    except Exception as e:
        logger.warning(f"[baidu_search] {e}")
        return []


async def _sogou_search(query: str, max_results: int) -> list[dict]:
    """搜狗搜索 HTML 抓取（国内稳定可访问，无需 API key）。

    解析搜狗搜索结果页面，提取标题、摘要和链接。
    """
    import ssl
    import re as _re
    try:
        url = f"https://www.sogou.com/web?query={quote(query)}"
        loop = asyncio.get_running_loop()

        def _fetch():
            req = Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "zh-CN,zh;q=0.9",
            })
            ctx = ssl.create_default_context()
            with urlopen(req, timeout=5, context=ctx) as resp:
                return resp.read().decode("utf-8", errors="replace")

        html = await loop.run_in_executor(None, _fetch)
        results = []

        # 搜狗搜索结果在 <h3> 内的 <a> 标签中
        h3_matches = _re.findall(
            r'<h3[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
            html, _re.DOTALL
        )

        # 提取摘要：搜狗的摘要通常在 class 含 "str_info" 或 "star-wiki" 的 div 中
        snippet_blocks = _re.findall(
            r'<div[^>]*class="[^"]*(?:str_info|star-wiki|rb)[^"]*"[^>]*>(.*?)</div>',
            html, _re.DOTALL
        )

        for i, (href, title_html) in enumerate(h3_matches):
            if len(results) >= max_results:
                break
            clean_title = _strip_html(title_html).strip()
            if not clean_title or len(clean_title) < 2:
                continue

            # 搜狗链接可能是重定向，保留原始 URL
            real_url = href
            if href.startswith("/link?"):
                real_url = f"https://www.sogou.com{href}"

            # 尝试获取对应摘要
            snippet = ""
            if i < len(snippet_blocks):
                snippet = _strip_html(snippet_blocks[i]).strip()[:300]

            results.append({
                "title": clean_title[:120],
                "snippet": snippet,
                "url": real_url,
            })

        if results:
            logger.info(f"[sogou_search] {query[:40]} -> {len(results)} results")
        return results
    except Exception as e:
        logger.warning(f"[sogou_search] {e}")
        return []


async def _bing_html_search(query: str, max_results: int) -> list[dict]:
    """Bing HTML 搜索抓取（无需 API key）。

    解析 Bing 搜索结果页面，提取标题、摘要和链接。
    """
    import ssl
    import re as _re
    try:
        url = f"https://www.bing.com/search?q={quote(query)}&count={max_results}&setlang=zh-cn"
        loop = asyncio.get_running_loop()

        def _fetch():
            req = Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            })
            ctx = ssl.create_default_context()
            with urlopen(req, timeout=5, context=ctx) as resp:
                return resp.read().decode("utf-8", errors="replace")

        html = await loop.run_in_executor(None, _fetch)
        results = []

        # Bing 搜索结果在 <li class="b_algo"> 中
        # 标题: <h2><a href="...">title</a></h2>
        # 摘要: <div class="b_caption"><p>snippet</p></div>
        algo_blocks = _re.findall(
            r'<li\s+class="b_algo"[^>]*>(.*?)</li>',
            html, _re.DOTALL
        )

        for block in algo_blocks:
            if len(results) >= max_results:
                break

            # 提取标题和链接
            title_match = _re.search(
                r'<h2[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
                block, _re.DOTALL
            )
            if not title_match:
                continue
            url_val = title_match.group(1)
            title = _strip_html(title_match.group(2)).strip()
            if not title:
                continue

            # 提取摘要
            snippet = ""
            caption_match = _re.search(
                r'<div[^>]*class="b_caption"[^>]*>.*?<p[^>]*>(.*?)</p>',
                block, _re.DOTALL
            )
            if caption_match:
                snippet = _strip_html(caption_match.group(1)).strip()[:300]

            results.append({
                "title": title[:120],
                "snippet": snippet,
                "url": url_val,
            })

        if results:
            logger.info(f"[bing_html_search] {query[:40]} -> {len(results)} results")
        return results
    except Exception as e:
        logger.warning(f"[bing_html_search] {e}")
        return []


async def _ddg_search(query: str, max_results: int) -> list[dict]:
    """DuckDuckGo Instant Answer API（fallback）。"""
    try:
        url = f"https://api.duckduckgo.com/?q={quote(query)}&format=json&no_html=1&skip_disambig=1"
        loop = asyncio.get_running_loop()

        def _fetch():
            req = Request(url, headers={"User-Agent": "LifeLab/1.0"})
            with urlopen(req, timeout=3) as resp:
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


async def _ddg_html_search(query: str, max_results: int) -> list[dict]:
    """DuckDuckGo HTML 搜索页面抓取（最终 fallback，无需 API key）。

    解析 DDG 的 lite 版本 HTML 页面，提取真实搜索结果。
    比 Instant Answer API 覆盖范围更广。
    """
    import ssl
    import re as _re
    try:
        url = f"https://lite.duckduckgo.com/lite/?q={quote(query)}"
        loop = asyncio.get_running_loop()

        def _fetch():
            req = Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            })
            ctx = ssl.create_default_context()
            with urlopen(req, timeout=3, context=ctx) as resp:
                return resp.read().decode("utf-8", errors="replace")

        html = await loop.run_in_executor(None, _fetch)
        results = []

        # 解析 DDG lite 结果：每个结果在 <tr class="result-link"> 或包含 <a rel="nofollow"> 的 <tr> 中
        # 提取所有带 href 的链接和对应的摘要
        link_pattern = _re.compile(
            r'<a\s+rel="nofollow"\s+class="result-link"\s+href="([^"]+)"[^>]*>(.*?)</a>',
            _re.DOTALL | _re.IGNORECASE,
        )
        snippet_pattern = _re.compile(
            r'<td\s+class="result-snippet"[^>]*>(.*?)</td>',
            _re.DOTALL | _re.IGNORECASE,
        )

        links = link_pattern.findall(html)
        snippets = snippet_pattern.findall(html)

        for i, (href, title_html) in enumerate(links):
            if len(results) >= max_results:
                break
            clean_title = _strip_html(title_html).strip()
            if not clean_title:
                continue
            # DDG lite 返回的是重定向链接，提取真实 URL
            real_url = href
            if "uddg=" in href:
                from urllib.parse import parse_qs, urlparse
                parsed = urlparse(href)
                params = parse_qs(parsed.query)
                if "uddg" in params:
                    real_url = params["uddg"][0]
            snippet = _strip_html(snippets[i]) if i < len(snippets) else ""
            results.append({
                "title": clean_title[:120],
                "snippet": snippet[:300],
                "url": real_url,
            })

        return results
    except Exception as e:
        logger.warning(f"[ddg_html_search] {e}")
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
        return "⚠️ 搜索无结果。请停止搜索，直接基于已有知识完成任务。"
    real = [r for r in results if "建议" not in r.get("snippet", "") and "停止" not in r.get("snippet", "")]
    if not real:
        return "⚠️ 搜索无结果。请停止搜索，直接基于已有知识完成任务。"
    lines = [f"搜索结果（{len(real)} 条）："]
    for i, r in enumerate(real, 1):
        lines.append(f"{i}. {r['title']}")
        if r.get("snippet"):
            lines.append(f"   {r['snippet'][:200]}")
        if r.get("url"):
            lines.append(f"   🔗 {r['url']}")
    return "\n".join(lines)
