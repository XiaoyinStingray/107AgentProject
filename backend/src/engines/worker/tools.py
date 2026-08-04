"""
Tool 注册接口 — Worker 引擎的工具定义和注册方式。

设计约束:
  - 新增工具只需加一个 ToolSpec，不修改引擎代码。
  - 工具通过 WorkspaceProvider 操作文件——不直接 open() 或 subprocess.run()。
  - handler 签名: async def handler(workspace: WorkspaceProvider, **kwargs) -> str

Phase 22: 仅定义 ToolSpec 数据类和注册表结构，handler 为 None。
Phase 23: 实现 5 个 handler 函数并填入 WORKER_TOOLS。

新增工具步骤:
  1. 在此文件实现 async def xxx_handler(workspace, **kwargs) -> str
  2. 在 WORKER_TOOLS 列表中添加 ToolSpec(name=..., handler=xxx_handler, ...)
  3. 引擎自动发现并包含在 Agent 决策 prompt 中——无需修改引擎代码
"""

import asyncio
from dataclasses import dataclass
from typing import Callable, Any

from loguru import logger


# =============================================================================
# 数据类
# =============================================================================


@dataclass
class ToolSpec:
    """工具规格——描述一个 Agent 可调用的工具。

    name:        工具名，用于 Agent 决策 JSON 中的 tool_name 字段。
                  必须是 WORKER_TOOLS 中已注册的值。
    description: 一段话，出现在 Agent 决策 prompt 的工具列表中。
                  用自然语言描述工具功能和使用场景。
                  Agent 阅读此描述来判断调用哪个工具。
    parameters:  JSON Schema 格式的参数定义。
                  {param_name: {type: str, description: str}}
    handler:      异步处理函数。
                  签名: async def handler(workspace: WorkspaceProvider, **kwargs) -> str
                  Phase 22 为 None，Phase 23 实现后填入。
    """
    name: str
    description: str
    parameters: dict[str, dict]
    handler: Callable[..., Any] | None = None


# =============================================================================
# 工具描述生成（在 Agent 决策 prompt 中使用）
# =============================================================================


def build_tool_list_text(tools: list[ToolSpec]) -> str:
    """生成 Agent 决策 prompt 中的工具列表部分。

    Args:
        tools: ToolSpec 列表

    Returns:
        格式化的工具描述 Markdown 文本，直接嵌入决策 prompt
    """
    lines = ["## 可用工具\n"]
    for i, tool in enumerate(tools, 1):
        params_desc = ", ".join(
            f"{name} ({info.get('type', 'string')})"
            for name, info in tool.parameters.items()
        )
        lines.append(f"{i}. **{tool.name}** — {tool.description}")
        if params_desc:
            lines.append(f"   参数: {params_desc}")
    return "\n".join(lines)


# =============================================================================
# 工具注册表
# =============================================================================
#
# Phase 22 定义 5 个核心工具，Step 100 新增 install_package。
#
# 工具能力矩阵:
#   搜索世界  → web_search (Bing → DuckDuckGo fallback)
#   执行代码  → run_python  (subprocess 沙盒)
#   读写文件  → write_file / read_file (WorkspaceProvider + 快照)
#   浏览文件  → list_files  (WorkspaceProvider + .snapshots)
#   安装包    → install_package (pip install --target)

WORKER_TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="web_search",
        description=(
            "搜索互联网获取实时信息。适用于：查找最新资料、验证事实、"
            "获取外部知识。返回前 5 条结果的标题、摘要和 URL。"
        ),
        parameters={
            "query": {"type": "string", "description": "搜索关键词"},
        },
        handler=None,  # Phase 23: web_search_handler
    ),
    ToolSpec(
        name="run_python",
        description=(
            "在安全沙盒中执行 Python 代码。适用于：数据分析、计算、"
            "文件处理、图表生成。可以使用 numpy/pandas/matplotlib 等第三方库，"
            "但不能使用 os/subprocess/socket 等系统模块。代码在工作区根目录执行。"
        ),
        parameters={
            "code": {"type": "string", "description": "要执行的 Python 代码"},
        },
        handler=None,  # Phase 23: run_python_handler
    ),
    ToolSpec(
        name="write_file",
        description=(
            "创建或覆盖写入一个文件。路径相对于工作区根目录。"
            "支持 .md / .txt / .json / .csv / .html / .py 等文本格式。"
            "写入成功后会通知前端文件面板更新。"
        ),
        parameters={
            "path": {"type": "string", "description": "文件相对路径，如 'report.md' 或 'data/results.json'"},
            "content": {"type": "string", "description": "文件完整内容（UTF-8 编码）"},
        },
        handler=None,  # Phase 23: write_file_handler
    ),
    ToolSpec(
        name="read_file",
        description=(
            "读取工作区中某个文件的内容。用于查看之前写入的文件、"
            "检查产出物质量、获取上下文信息。"
        ),
        parameters={
            "path": {"type": "string", "description": "要读取的文件相对路径，如 'report.md'"},
        },
        handler=None,  # Phase 23: read_file_handler
    ),
    ToolSpec(
        name="list_files",
        description=(
            "列出工作区目录中的所有文件。用于了解当前有哪些产出物、"
            "确认文件写入成功、浏览项目结构。"
        ),
        parameters={
            "directory": {"type": "string", "description": "目录路径，空字符串 '' 表示根目录"},
        },
        handler=None,  # Phase 23: list_files_handler
    ),
    ToolSpec(
        name="install_package",
        description=(
            "安装 Python 第三方包到工作区。适用于：数据分析需要 pandas、"
            "图表生成需要 matplotlib、数据处理需要 numpy 等。"
            "安装后可在 run_python 中 import 使用。"
            "包安装在工作区 .packages/ 目录中，不影响系统 Python 环境。"
        ),
        parameters={
            "package": {"type": "string", "description": "要安装的包名，如 'pandas' 或 'matplotlib'"},
        },
        handler=None,  # Step 100: install_package_handler
    ),
]

# 工具名 → ToolSpec 快速查找表
TOOL_REGISTRY: dict[str, ToolSpec] = {t.name: t for t in WORKER_TOOLS}


# =============================================================================
# Tool Handler 实现（Phase 23）
# =============================================================================


# ── Step 105: Timeline HTML 模板 ──

TIMELINE_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>时间线</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem}
.timeline{position:relative;max-width:800px;margin:0 auto}
.timeline::after{content:'';position:absolute;width:3px;background:#334155;top:0;bottom:0;left:50%;margin-left:-1.5px}
.timeline-item{padding:10px 40px;position:relative;width:50%}
.timeline-item.left{left:0}.timeline-item.right{left:50%}
.timeline-item .date{font-size:12px;color:#94a3b8;margin-bottom:4px}
.timeline-item .content{background:#1e293b;border-radius:8px;padding:12px 16px;border:1px solid #334155}
.timeline-item .content h3{font-size:16px;margin-bottom:4px;color:#38bdf8}
.timeline-item .content p{font-size:14px;color:#cbd5e1}
@media(max-width:600px){.timeline::after{left:20px}.timeline-item{width:100%;padding-left:50px}.timeline-item.right{left:0}}
</style></head><body><div class="timeline">{{ITEMS}}</div></body></html>"""


# ── Step 105: Special Tools ──

@dataclass
class SpecialToolSpec:
    """特殊工具规格——预设的高阶工具，用于 Pipeline 特定节点。"""
    key: str              # 注册表键名，如 "mindmap"
    name: str             # 工具函数名（Agent 看到的）
    description: str      # 出现在 Agent 决策 prompt 中
    parameters: dict      # 参数定义
    suitable_roles: list[str]  # 推荐角色


SPECIAL_TOOLS: dict[str, SpecialToolSpec] = {
    "mindmap": SpecialToolSpec(
        key="mindmap",
        name="mindmap_generate",
        description="基于主题生成 Mermaid 思维导图，保存为 mindmap.md",
        parameters={"topic": {"type": "string", "required": True}},
        suitable_roles=["analyst", "writer"],
    ),
    "chart": SpecialToolSpec(
        key="chart",
        name="chart_generate",
        description="基于 JSON 数据生成图表（bar/line/pie/scatter），保存为 chart.png",
        parameters={
            "data_json": {"type": "string", "required": True, "description": "JSON 数据: {labels:[], values:[], title:''}"},
            "chart_type": {"type": "string", "required": True, "description": "图表类型: bar/line/pie/scatter"},
        },
        suitable_roles=["analyst", "executor"],
    ),
    "timeline": SpecialToolSpec(
        key="timeline",
        name="timeline_generate",
        description="基于事件 JSON 数组生成交互式时间线 HTML，保存为 timeline.html",
        parameters={"events_json": {"type": "string", "required": True, "description": "JSON 数组: [{date, title, desc}]"}},
        suitable_roles=["writer", "analyst"],
    ),
    "summarize": SpecialToolSpec(
        key="summarize",
        name="summarize",
        description="对指定文件生成结构化摘要，保存为 summary.md",
        parameters={
            "path": {"type": "string", "required": True, "description": "要摘要的文件路径"},
            "max_words": {"type": "number", "required": False, "description": "最大字数，默认 200"},
        },
        suitable_roles=["analyst", "writer", "reviewer"],
    ),
    "translate": SpecialToolSpec(
        key="translate",
        name="translate",
        description="将指定文件翻译为目标语言，保存为 {name}_{lang}.md",
        parameters={
            "path": {"type": "string", "required": True, "description": "要翻译的文件路径"},
            "target_lang": {"type": "string", "required": False, "description": "目标语言，默认 'en'"},
        },
        suitable_roles=["writer"],
    ),
    "data_profile": SpecialToolSpec(
        key="data_profile",
        name="data_profile",
        description="对 CSV/JSON 数据文件生成数据画像（行数/列名/类型/缺失率/分布），保存为 data_profile.md",
        parameters={"path": {"type": "string", "required": True, "description": "CSV 或 JSON 文件路径"}},
        suitable_roles=["analyst"],
    ),
    "code_review": SpecialToolSpec(
        key="code_review",
        name="code_review",
        description="对代码文件进行 4 维度审查（Bug/风格/性能/安全），保存为 code_review.md",
        parameters={"path": {"type": "string", "required": True, "description": "代码文件路径"}},
        suitable_roles=["reviewer"],
    ),
    "outline": SpecialToolSpec(
        key="outline",
        name="outline_generate",
        description="为主题生成结构化文档大纲（Markdown 层级标题），保存为 outline.md",
        parameters={
            "topic": {"type": "string", "required": True, "description": "文档主题"},
            "sections": {"type": "number", "required": False, "description": "章节数，默认 5"},
        },
        suitable_roles=["writer"],
    ),
}


def make_worker_tools(workspace, extra_tools: list[str] | None = None) -> list[ToolSpec]:
    """为 Worker 创建闭包工具集——捕获 WorkspaceProvider 引用。

    每个 tool handler 通过闭包访问 workspace（LocalWorkspace 或 CloudWorkspace），
    产生真实的文件系统副作用。引擎不需要知道 workspace 的具体类型。

    Args:
        workspace: WorkspaceProvider 实例

    Returns:
        ToolSpec 列表，其中每个 tool 的 handler 已填入捕获了 workspace 的闭包
    """
    from engines.worker.sandbox import check_code_safety

    # ── web_search ──
    async def web_search_handler(query: str) -> str:
        """搜索互联网。"""
        from llm.search import web_search, format_search_results
        results = await web_search(query, max_results=5)
        return format_search_results(results)

    # ── run_python ──
    async def run_python_handler(code: str) -> str:
        """在沙盒中执行 Python 代码。"""
        if not code or not isinstance(code, str) or len(code.strip()) == 0:
            return "错误：代码不能为空。"
        result = await workspace.run_python(code)
        output_parts = []
        if result.stdout:
            output_parts.append(f"--- stdout ---\n{result.stdout}")
        if result.stderr:
            output_parts.append(f"--- stderr ---\n{result.stderr}")
        if not result.stdout and not result.stderr:
            output_parts.append("(无输出)")
        output_parts.append(f"退出码: {result.exit_code}")
        return "\n\n".join(output_parts)

    # ── write_file ──
    async def write_file_handler(path: str, content: str) -> str:
        """创建或覆盖写入文件（自动快照）。"""
        if not path or not isinstance(path, str):
            return "错误：请提供有效的文件路径。"
        if content is None or not isinstance(content, str):
            return "错误：请提供有效的文件内容。"
        if any(c in path for c in ('\\', '..')):
            return f"错误：路径包含非法字符: {path}"
        try:
            full_path = await workspace.write_file(path, content)
            # 获取快照数量
            try:
                snaps = await workspace.list_snapshots(path) if hasattr(workspace, 'list_snapshots') else []
                version_hint = f" (版本 #{len(snaps) + 1})" if snaps else ""
            except Exception:
                version_hint = ""
            logger.info(f"[worker-tool] write_file: {path} → {full_path} ({len(content)} chars)")
            return f"✅ 已写入 {path} ({len(content)} 字符{version_hint})"
        except PermissionError as e:
            return f"权限错误: {e}"
        except Exception as e:
            logger.error(f"[worker-tool] write_file failed: {e}")
            return f"写入失败: {e}"

    # ── read_file ──
    async def read_file_handler(path: str, snapshot: str = "") -> str:
        """读取文件内容（支持读取历史快照版本）。"""
        if not path or not isinstance(path, str):
            return "错误：请提供有效的文件路径。"
        try:
            snap = snapshot if snapshot else None
            content = await workspace.read_file(path, snap)
            label = f"[文件 {path} 内容如下]"
            if snapshot:
                label = f"[快照 {snapshot} 内容如下]"
            return f"{label}\n\n{content}"
        except FileNotFoundError:
            return f"文件不存在: {path}。请确认文件名是否正确。工作区中的文件列表可用 list_files 查看。"
        except PermissionError as e:
            return f"权限错误: {e}"
        except Exception as e:
            return f"读取失败: {e}"

    # ── list_files ──
    async def list_files_handler(directory: str = "") -> str:
        """列出工作区文件（含 .snapshots 可见）。"""
        try:
            files = await workspace.list_files(directory)
            if not files:
                return "工作区为空。"
            lines = [f"工作区文件（{len(files)} 个）:"]
            for f_info in files:
                size_kb = f_info.size / 1024
                size_str = f"{size_kb:.1f}KB" if size_kb >= 0.1 else f"{f_info.size}B"
                lines.append(f"  - {f_info.path} ({size_str})")
            # 提示快照功能
            if hasattr(workspace, 'list_snapshots'):
                lines.append("\n💡 提示: 使用 read_file('path', snapshot='name') 可读取历史版本。")
                lines.append("   使用 list_files('.snapshots') 可查看版本历史。")
            return "\n".join(lines)
        except Exception as e:
            return f"列出文件失败: {e}"

    # ── install_package (Step 100) ──
    async def install_package_handler(package: str) -> str:
        """安装 Python 包到工作区 .packages/ 目录。"""
        import sys
        import subprocess as _sp
        from pathlib import Path as _Path

        if not package or not isinstance(package, str) or not package.strip():
            return "错误：请提供要安装的包名。"
        # 安全校验：只允许字母数字和 -_. 字符
        if not all(c.isalnum() or c in "-_." for c in package.strip()):
            return f"错误：包名包含非法字符: {package}"

        pkg_name = package.strip().lower()
        packages_dir = _Path(workspace.root if hasattr(workspace, 'root') else ".", ".packages")
        packages_dir.mkdir(exist_ok=True)

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "pip", "install",
                "--target", str(packages_dir),
                "--quiet", "--no-input",
                pkg_name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=60)
            if proc.returncode == 0:
                logger.info(f"[worker-tool] install_package: {pkg_name} ✅")
                return f"✅ 已安装 {pkg_name} 到工作区。可在 run_python 中 import 使用。"
            else:
                err = stderr.decode("utf-8", errors="replace")[:500]
                logger.warning(f"[worker-tool] install_package failed: {pkg_name} — {err}")
                return f"❌ 安装 {pkg_name} 失败: {err}"
        except asyncio.TimeoutError:
            return f"❌ 安装 {pkg_name} 超时（60秒）。"
        except Exception as e:
            return f"❌ 安装 {pkg_name} 失败: {e}"

    # 构造闭包 ToolSpec 列表（复制原 ToolSpec 并填入 handler）
    base_tools = [
        ToolSpec(
            name="web_search",
            description=TOOL_REGISTRY["web_search"].description,
            parameters=TOOL_REGISTRY["web_search"].parameters,
            handler=web_search_handler,
        ),
        ToolSpec(
            name="run_python",
            description=TOOL_REGISTRY["run_python"].description,
            parameters=TOOL_REGISTRY["run_python"].parameters,
            handler=run_python_handler,
        ),
        ToolSpec(
            name="write_file",
            description=TOOL_REGISTRY["write_file"].description,
            parameters=TOOL_REGISTRY["write_file"].parameters,
            handler=write_file_handler,
        ),
        ToolSpec(
            name="read_file",
            description=(
                "读取工作区中某个文件的内容。支持读取历史快照版本——"
                "传入 snapshot 参数（快照文件名）可读历史版本。"
                "用 list_files('.snapshots') 可查看所有快照。"
            ),
            parameters={
                "path": {"type": "string", "description": "要读取的文件相对路径，如 'report.md'"},
                "snapshot": {"type": "string", "description": "可选——快照文件名，如 'report.md.20260801_143000'"},
            },
            handler=read_file_handler,
        ),
        ToolSpec(
            name="list_files",
            description=TOOL_REGISTRY["list_files"].description,
            parameters=TOOL_REGISTRY["list_files"].parameters,
            handler=list_files_handler,
        ),
        ToolSpec(
            name="install_package",
            description=TOOL_REGISTRY["install_package"].description,
            parameters=TOOL_REGISTRY["install_package"].parameters,
            handler=install_package_handler,
        ),
    ]

    # ── Step 105: 特殊工具闭包 ──
    extra = extra_tools or []
    special_specs: list[ToolSpec] = []

    if "mindmap" in extra:
        async def mindmap_handler(topic: str) -> str:
            """生成 Mermaid 思维导图。"""
            prompt = (
                f"你是思维导图生成器。基于以下主题生成 Mermaid mindmap 格式的思维导图。\n"
                f"主题：{topic}\n"
                f"要求：至少 3 层深度，使用 Mermaid mindmap 语法，不要输出非 Mermaid 内容。\n"
                f"格式示例：\n```mermaid\nmindmap\n  root((中心主题))\n    分支1\n      细节A\n    分支2\n      细节B\n```"
            )
            try:
                from llm.client import create_model_client
                client = create_model_client("act")
                result = await client.create(
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7, max_tokens=500,
                )
                content = result.content.strip()
                # 提取 mermaid 代码块
                import re
                m = re.search(r"```mermaid\s*\n?([\s\S]*?)```", content)
                mermaid = m.group(1).strip() if m else content
                await workspace.write_file("mindmap.md", "```mermaid\n" + mermaid + "\n```")
                return f"✅ 思维导图已生成 → mindmap.md"
            except Exception as e:
                logger.warning(f"[special-tool] mindmap failed: {e}")
                return f"❌ 思维导图生成失败: {e}"
        special_specs.append(ToolSpec(
            name="mindmap_generate",
            description=SPECIAL_TOOLS["mindmap"].description,
            parameters=SPECIAL_TOOLS["mindmap"].parameters,
            handler=mindmap_handler,
        ))

    if "chart" in extra:
        async def chart_handler(data_json: str, chart_type: str) -> str:
            """用 matplotlib 生成图表。"""
            # Fix: 转义数据防止代码注入
            safe_data = data_json.replace("\\", "\\\\").replace("'''", "\\'\\'\\'")
            safe_type = chart_type.replace("'", "\\'").strip()
            if safe_type not in ("bar", "line", "pie", "scatter"):
                return f"❌ 不支持的图表类型: {chart_type[:20]}，请使用 bar/line/pie/scatter"
            code = (
                "import matplotlib\nmatplotlib.use('Agg')\n"
                "import matplotlib.pyplot as plt\nimport json\n"
                f"data = json.loads('''{safe_data}''')\n"
                f"chart_type = '{safe_type}'\n"
                "fig, ax = plt.subplots(figsize=(10, 6))\n"
                "if chart_type == 'bar': ax.bar(data.get('labels', []), data.get('values', []))\n"
                "elif chart_type == 'line': ax.plot(data.get('labels', []), data.get('values', []))\n"
                "elif chart_type == 'pie': ax.pie(data.get('values', []), labels=data.get('labels', []), autopct='%1.1f%%')\n"
                "elif chart_type == 'scatter': ax.scatter(data.get('x', []), data.get('y', []))\n"
                "else: print(f'ERROR: unknown chart_type {chart_type}')\n"
                "ax.set_title(data.get('title', 'Chart'))\n"
                "plt.tight_layout()\nplt.savefig('chart.png', dpi=150)\nprint('OK')"
            )
            result = await workspace.run_python(code)
            if result.exit_code == 0 and "OK" in (result.stdout or ""):
                return "✅ 图表已生成 → chart.png"
            return f"❌ 图表生成失败: {result.stderr or result.stdout or '未知错误'}"
        special_specs.append(ToolSpec(
            name="chart_generate",
            description=SPECIAL_TOOLS["chart"].description,
            parameters=SPECIAL_TOOLS["chart"].parameters,
            handler=chart_handler,
        ))

    if "timeline" in extra:
        async def timeline_handler(events_json: str) -> str:
            """生成交互式时间线 HTML。"""
            import json as _j
            events = _j.loads(events_json)
            items = ""
            for i, ev in enumerate(events):
                side = "left" if i % 2 == 0 else "right"
                items += (
                    f'<div class="timeline-item {side}">'
                    f'<div class="date">{ev.get("date", "")}</div>'
                    f'<div class="content"><h3>{ev.get("title", "")}</h3>'
                    f'<p>{ev.get("desc", "")}</p></div></div>\n'
                )
            html = TIMELINE_HTML_TEMPLATE.replace("{{ITEMS}}", items)
            await workspace.write_file("timeline.html", html)
            return f"✅ 时间线已生成 → timeline.html ({len(events)} 个事件)"
        special_specs.append(ToolSpec(
            name="timeline_generate",
            description=SPECIAL_TOOLS["timeline"].description,
            parameters=SPECIAL_TOOLS["timeline"].parameters,
            handler=timeline_handler,
        ))

    if "summarize" in extra:
        async def summarize_handler(path: str, max_words: int = 200) -> str:
            """LLM 智能摘要。"""
            content = await workspace.read_file(path)
            prompt = (
                f"请用不超过{max_words}字总结以下内容，保留关键数据和结论：\n\n{content[:8000]}"
            )
            try:
                from llm.client import create_model_client
                client = create_model_client("act")
                result = await client.create(
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.5, max_tokens=400,
                )
                summary = result.content.strip()
                await workspace.write_file("summary.md", summary)
                return f"✅ 摘要已生成 → summary.md ({len(summary)} 字符)"
            except Exception as e:
                return f"❌ 摘要生成失败: {e}"
        special_specs.append(ToolSpec(
            name="summarize",
            description=SPECIAL_TOOLS["summarize"].description,
            parameters=SPECIAL_TOOLS["summarize"].parameters,
            handler=summarize_handler,
        ))

    if "translate" in extra:
        async def translate_handler(path: str, target_lang: str = "en") -> str:
            """LLM 翻译文档。"""
            content = await workspace.read_file(path)
            prompt = f"将以下内容翻译为{target_lang}，保持 Markdown 格式不变：\n\n{content[:6000]}"
            try:
                from llm.client import create_model_client
                client = create_model_client("act")
                result = await client.create(
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.4, max_tokens=600,
                )
                translated = result.content.strip()
                from pathlib import Path
                stem = Path(path).stem
                out = f"{stem}_{target_lang}.md"
                await workspace.write_file(out, translated)
                return f"✅ 翻译完成 → {out}"
            except Exception as e:
                return f"❌ 翻译失败: {e}"
        special_specs.append(ToolSpec(
            name="translate",
            description=SPECIAL_TOOLS["translate"].description,
            parameters=SPECIAL_TOOLS["translate"].parameters,
            handler=translate_handler,
        ))

    if "data_profile" in extra:
        async def data_profile_handler(path: str) -> str:
            """pandas 数据画像。"""
            safe_path = path.replace("\\", "\\\\").replace("'", "\\'")
            code = (
                "import pandas as pd, json\n"
                f"path = '{safe_path}'\n"
                "df = pd.read_csv(path) if path.endswith('.csv') else pd.read_json(path)\n"
                "lines = []\n"
                f"lines.append('# 数据画像: {path}')\n"
                "lines.append(f'\\n## 基本信息')\n"
                "lines.append(f'- 行数: {len(df)}')\n"
                "lines.append(f'- 列数: {len(df.columns)}')\n"
                "lines.append(f'- 内存: {df.memory_usage(deep=True).sum() / 1024:.1f} KB')\n"
                "lines.append('\\n## 列信息')\n"
                "for col in df.columns:\n"
                "    lines.append(f'- **{col}** ({df[col].dtype}): 缺失 {df[col].isna().sum()} ({df[col].isna().mean():.1%})')\n"
                "with open('data_profile.md', 'w') as f: f.write('\\n'.join(lines))\n"
                "print('OK')"
            )
            result = await workspace.run_python(code)
            if result.exit_code == 0:
                return "✅ 数据画像已生成 → data_profile.md"
            return f"❌ 数据画像生成失败: {result.stderr or result.stdout or '未知错误'}"
        special_specs.append(ToolSpec(
            name="data_profile",
            description=SPECIAL_TOOLS["data_profile"].description,
            parameters=SPECIAL_TOOLS["data_profile"].parameters,
            handler=data_profile_handler,
        ))

    if "code_review" in extra:
        async def code_review_handler(path: str) -> str:
            """LLM 代码审查。"""
            content = await workspace.read_file(path)
            ext = path.split(".")[-1] if "." in path else ""
            prompt = (
                f"你是代码审查专家。请从 Bug 风险/代码风格/性能问题/安全隐患 4 个维度"
                f"审查这段 {ext} 代码，输出 Markdown 审查报告（含总体评分 X/10）：\n\n"
                f"```{ext}\n{content[:6000]}\n```"
            )
            try:
                from llm.client import create_model_client
                client = create_model_client("think")
                result = await client.create(
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.5, max_tokens=800,
                )
                await workspace.write_file("code_review.md", result.content.strip())
                return "✅ 代码审查报告已生成 → code_review.md"
            except Exception as e:
                return f"❌ 审查失败: {e}"
        special_specs.append(ToolSpec(
            name="code_review",
            description=SPECIAL_TOOLS["code_review"].description,
            parameters=SPECIAL_TOOLS["code_review"].parameters,
            handler=code_review_handler,
        ))

    if "outline" in extra:
        async def outline_handler(topic: str, sections: int = 5) -> str:
            """LLM 文档大纲生成。"""
            prompt = (
                f"你是一个文档大纲生成器。请为以下主题生成 {sections} 章的文档大纲。\n"
                f"主题：{topic}\n"
                f"要求：每章包含章节标题 + 3-5 个要点，使用 Markdown 层级标题"
                f"（## 第X章 ...），结构从背景到结论，逻辑递进。不要输出其他内容。"
            )
            try:
                from llm.client import create_model_client
                client = create_model_client("act")
                result = await client.create(
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7, max_tokens=500,
                )
                await workspace.write_file("outline.md", result.content.strip())
                return "✅ 文档大纲已生成 → outline.md"
            except Exception as e:
                return f"❌ 大纲生成失败: {e}"
        special_specs.append(ToolSpec(
            name="outline_generate",
            description=SPECIAL_TOOLS["outline"].description,
            parameters=SPECIAL_TOOLS["outline"].parameters,
            handler=outline_handler,
        ))

    return base_tools + special_specs
