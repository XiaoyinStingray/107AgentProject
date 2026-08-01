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


def make_worker_tools(workspace) -> list[ToolSpec]:
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
    return [
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
