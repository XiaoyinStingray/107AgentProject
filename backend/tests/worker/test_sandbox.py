"""Step T10: Sandbox 安全性测试。"""

import asyncio
import pytest
from engines.worker.sandbox import check_code_safety, run_python_sandbox


def _run(coro):
    """Python 3.14 兼容的异步运行辅助。"""
    return asyncio.run(coro)


class TestCodeSafety:
    """静态检查——危险代码拦截。"""

    def test_safe_code_passes(self):
        """安全的代码通过检查。"""
        safe_codes = [
            'print("hello")',
            "x = 1 + 2\nprint(x)",
            "import math\nprint(math.pi)",
            "import json\ndata = json.loads('{}')",
            "for i in range(10): print(i)",
            "# This is safe",
        ]
        for code in safe_codes:
            is_safe, reason = check_code_safety(code)
            assert is_safe, f"Safe code rejected: {code!r} — {reason}"

    def test_os_import_rejected(self):
        """os 模块导入被拒绝。"""
        is_safe, reason = check_code_safety("import os\nos.system('ls')")
        assert not is_safe
        assert "os" in reason.lower()

    def test_subprocess_rejected(self):
        """subprocess 被拒绝。"""
        is_safe, reason = check_code_safety("import subprocess\nsubprocess.run(['ls'])")
        assert not is_safe

    def test_from_os_import_rejected(self):
        """from os import ... 被拒绝。"""
        is_safe, reason = check_code_safety("from os import system\nsystem('ls')")
        assert not is_safe

    def test_socket_rejected(self):
        """socket 被拒绝。"""
        is_safe, reason = check_code_safety("import socket\ns = socket.socket()")
        assert not is_safe

    def test_eval_rejected(self):
        """eval 被拒绝。"""
        is_safe, reason = check_code_safety("eval('print(1)')")
        assert not is_safe

    def test_exec_rejected(self):
        """exec 被拒绝。"""
        is_safe, reason = check_code_safety("exec('print(1)')")
        assert not is_safe

    def test_threading_rejected(self):
        """多线程被拒绝。"""
        is_safe, reason = check_code_safety("import threading\nthreading.Thread()")
        assert not is_safe

    def test_requests_rejected(self):
        """网络请求被拒绝。"""
        is_safe, reason = check_code_safety("import requests\nrequests.get('http://example.com')")
        assert not is_safe


class TestSandboxExecution:
    """实际沙盒执行测试。"""

    def test_simple_execution(self):
        """简单 Python 代码正确执行。"""
        result = _run(
            run_python_sandbox("print('hello world')", ".")
        )
        assert result.exit_code == 0
        assert "hello world" in result.stdout
        assert result.stderr == ""

    def test_arithmetic(self):
        """数学运算。"""
        result = _run(
            run_python_sandbox("print(1 + 2 * 3)", ".")
        )
        assert result.exit_code == 0
        assert "7" in result.stdout

    def test_multiline(self):
        """多行代码。"""
        result = _run(
            run_python_sandbox("x = 10\nfor i in range(3): print(i * x)", ".")
        )
        assert result.exit_code == 0

    def test_stderr_capture(self):
        """stderr 被捕获。"""
        result = _run(
            run_python_sandbox("import sys\nprint('ok', file=sys.stderr)", ".")
        )
        assert result.exit_code == 0
        assert "ok" in result.stderr

    def test_dangerous_code_rejected(self):
        """危险代码在运行时被拒绝。"""
        result = _run(
            run_python_sandbox("import os\nprint(os.getcwd())", ".")
        )
        assert result.exit_code != 0 or "禁止" in result.stderr

    def test_empty_code(self):
        """空代码。"""
        result = _run(
            run_python_sandbox("", ".")
        )
        # 空代码不会触发危险检查，但安全执行
        assert result.exit_code == 0
