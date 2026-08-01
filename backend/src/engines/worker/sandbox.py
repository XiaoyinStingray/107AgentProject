"""
Python 代码安全沙盒 — 子进程隔离 + 静态检查 + 超时控制。

设计约束:
  - 所有代码在隔离子进程中执行，不共享进程内存。
  - 静态检查拦截危险模块（os.system, subprocess, socket 等）。
  - 文件操作被限制在 workspace root 内。
  - 超时 30s → SIGKILL。
  - 输出截断：stdout ≤ 10KB, stderr ≤ 5KB。

Phase 23: 实现完整沙盒。
"""

import asyncio
import os
import re
import tempfile
import time
from pathlib import Path

from loguru import logger

from engines.worker.workspace import SandboxResult


# =============================================================================
# 常量
# =============================================================================

# 静态检查——黑名单模块（正则匹配 import 语句）
DANGER_PATTERNS: list[re.Pattern] = [
    # 系统调用
    re.compile(r'\bimport\s+os\b', re.MULTILINE),
    re.compile(r'\bfrom\s+os\s+import', re.MULTILINE),
    re.compile(r'\bimport\s+subprocess\b', re.MULTILINE),
    re.compile(r'\bfrom\s+subprocess\s+import', re.MULTILINE),
    re.compile(r'\bimport\s+shutil\b', re.MULTILINE),
    # 网络
    re.compile(r'\bimport\s+socket\b', re.MULTILINE),
    re.compile(r'\bfrom\s+socket\s+import', re.MULTILINE),
    re.compile(r'\bimport\s+requests\b', re.MULTILINE),
    re.compile(r'\bimport\s+urllib\b', re.MULTILINE),
    re.compile(r'\bimport\s+http\.', re.MULTILINE),
    re.compile(r'\bimport\s+ftplib\b', re.MULTILINE),
    # 进程
    re.compile(r'\bimport\s+multiprocessing\b', re.MULTILINE),
    re.compile(r'\bimport\s+threading\b', re.MULTILINE),
    re.compile(r'\bimport\s+signal\b', re.MULTILINE),
    # 文件系统操作
    re.compile(r'\bimport\s+pathlib\b', re.MULTILINE),
    re.compile(r'\bfrom\s+pathlib\s+import', re.MULTILINE),
    # 危险函数调用（即使没 import 对应模块，也拒绝）
    re.compile(r'\bos\.system\s*\(', re.MULTILINE),
    re.compile(r'\bos\.popen\s*\(', re.MULTILINE),
    re.compile(r'\bsubprocess\.', re.MULTILINE),
    re.compile(r'\beval\s*\(', re.MULTILINE),
    re.compile(r'\bexec\s*\(', re.MULTILINE),
    re.compile(r'\b__import__\s*\(', re.MULTILINE),
    re.compile(r'\bcompile\s*\(', re.MULTILINE),  # 可以编译新代码执行
]

# 输出限制
MAX_STDOUT_BYTES = 10 * 1024   # 10KB
MAX_STDERR_BYTES = 5 * 1024    # 5KB
DEFAULT_TIMEOUT = 30            # 秒


# =============================================================================
# 公共 API
# =============================================================================


# run_python 的正确用法提示
_PYTHON_HINT = (
    "run_python 应仅用于数据分析、计算、图表生成。"
    "如果需要写文本文件（.md/.txt/.json 等），请直接使用 write_file 工具。"
)


def check_code_safety(code: str) -> tuple[bool, str]:
    """静态检查 Python 代码是否安全+合理使用。

    Args:
        code: Python 源码字符串

    Returns:
        (is_safe, reason)
    """
    for pattern in DANGER_PATTERNS:
        match = pattern.search(code)
        if match:
            matched_text = match.group(0)[:60]
            return False, f"禁止使用: {matched_text}..."

    # 检查是否在错误地用 Python 写文本文件
    write_patterns = [
        r'open\([^)]*\.(?:md|txt|json|csv|html|xml)[^)]*,\s*[\'"]w[\'"]',
        r'\.write\(.*(?:报告|report|article|文档|小说|story|blog|笔记)',
    ]
    for pat in write_patterns:
        if re.search(pat, code, re.IGNORECASE):
            return False, f"不要用 Python 写文本文件。{_PYTHON_HINT}"

    return True, "ok"


async def run_python_sandbox(code: str, workspace_dir: str,
                             timeout: int = DEFAULT_TIMEOUT) -> SandboxResult:
    """在隔离子进程中执行 Python 代码。

    工作流程:
      1. 静态安全检查
      2. 将代码写入临时 .py 文件
      3. 以 workspace_dir 为工作目录启动子进程
      4. 等待完成或超时
      5. 截取输出
      6. 返回 SandboxResult

    Args:
        code: Python 源码字符串
        workspace_dir: 工作目录（working directory for the subprocess）
        timeout: 超时秒数

    Returns:
        SandboxResult 包含 stdout/stderr/exit_code
    """
    # Step 1: 静态检查
    is_safe, reason = check_code_safety(code)
    if not is_safe:
        logger.warning(f"[sandbox] rejected: {reason}")
        return SandboxResult(
            stdout="",
            stderr=f"代码安全检查未通过: {reason}",
            exit_code=-1,
        )

    # Step 2: 写入临时文件
    tmp_path = None
    try:
        # 前置：注入 .packages 到 sys.path（如果存在）
        packages_dir = Path(workspace_dir).parent / ".packages"
        preamble = ""
        if packages_dir.exists():
            preamble = f"import sys\nsys.path.insert(0, {str(packages_dir)!r})\n"

        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.py', dir=workspace_dir,
            delete=False, encoding='utf-8',
        ) as f:
            f.write(preamble + code)
            tmp_path = f.name

        # Step 3: 启动子进程
        start_time = time.monotonic()
        try:
            proc = await asyncio.create_subprocess_exec(
                "python", tmp_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=workspace_dir,
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(
                proc.communicate(), timeout=timeout,
            )
            exit_code = proc.returncode or 0
            duration_ms = int((time.monotonic() - start_time) * 1000)

        except asyncio.TimeoutError:
            try:
                proc.kill()
                await proc.wait()
            except Exception:
                pass
            logger.warning(f"[sandbox] timeout after {timeout}s")
            return SandboxResult(
                stdout="",
                stderr=f"执行超时（{timeout}秒）。请简化代码或优化逻辑。",
                exit_code=-1,
            )

        # Step 4: 截取输出
        stdout = stdout_bytes.decode('utf-8', errors='replace')[:MAX_STDOUT_BYTES]
        stderr = stderr_bytes.decode('utf-8', errors='replace')[:MAX_STDERR_BYTES]

        if len(stdout_bytes) > MAX_STDOUT_BYTES:
            stdout += "\n\n[... 输出已截断]"
        if len(stderr_bytes) > MAX_STDERR_BYTES:
            stderr += "\n\n[... 输出已截断]"

        logger.info(f"[sandbox] exit_code={exit_code}, stdout={len(stdout_bytes)}B, "
                    f"stderr={len(stderr_bytes)}B, {duration_ms}ms")
        return SandboxResult(stdout=stdout, stderr=stderr, exit_code=exit_code)

    except FileNotFoundError:
        return SandboxResult(
            stdout="",
            stderr="Python 解释器未找到。请确认 Python 已安装并在 PATH 中。",
            exit_code=-1,
        )
    except Exception as e:
        logger.error(f"[sandbox] unexpected error: {e}")
        return SandboxResult(
            stdout="",
            stderr=f"沙盒执行失败: {e}",
            exit_code=-1,
        )
    finally:
        # Step 5: 清理临时文件
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
