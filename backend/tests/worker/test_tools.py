"""Step T10: Tool handler 测试（Mock WorkspaceProvider）。"""

import asyncio
from dataclasses import dataclass, field
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from engines.worker.tools import (
    ToolSpec,
    build_tool_list_text,
    make_worker_tools,
    TOOL_REGISTRY,
)
from engines.worker.workspace import FileInfo, SandboxResult, WorkspaceProvider


def _run(coro):
    """Python 3.14 兼容的异步运行辅助。"""
    return asyncio.run(coro)


class MockWorkspace(WorkspaceProvider):
    """测试用 Mock WorkspaceProvider。"""

    def __init__(self):
        self._files: dict[str, str] = {}

    async def write_file(self, path: str, content: str) -> str:
        self._files[path] = content
        return f"/mock/{path}"

    async def read_file(self, path: str, snapshot: str | None = None) -> str:
        if path not in self._files:
            raise FileNotFoundError(f"文件不存在: {path}")
        return self._files[path]

    async def list_files(self, directory: str = "") -> list[FileInfo]:
        return [
            FileInfo(path=p, size=len(c), modified_at="2024-01-01T00:00:00Z")
            for p, c in self._files.items()
            if not directory or p.startswith(directory)
        ]

    async def delete_file(self, path: str) -> bool:
        if path in self._files:
            del self._files[path]
            return True
        return False

    async def run_python(self, code: str, timeout: int = 30) -> SandboxResult:
        return SandboxResult(stdout="42\n", stderr="", exit_code=0)

    async def exists(self, path: str) -> bool:
        return path in self._files

    async def list_snapshots(self, path: str) -> list[dict]:
        """Mock 快照列表——返回空。"""
        return []

    @property
    def location_description(self) -> str:
        return "本地: /mock/test"


class TestToolRegistration:
    """工具注册测试。"""

    def test_all_tools_registered(self):
        """所有工具都已注册（含 install_package）。"""
        expected = {"web_search", "run_python", "write_file", "read_file", "list_files", "install_package"}
        actual = set(TOOL_REGISTRY.keys())
        assert actual == expected

    def test_each_tool_has_description(self):
        """每个工具有描述和参数。"""
        for name, tool in TOOL_REGISTRY.items():
            assert tool.description, f"{name} 缺少描述"
            assert isinstance(tool.parameters, dict), f"{name} 缺少参数定义"

    def test_build_tool_list_text(self):
        """工具列表文本生成。"""
        tools = list(TOOL_REGISTRY.values())
        text = build_tool_list_text(tools)
        for name in ["web_search", "run_python", "write_file", "read_file", "list_files", "install_package"]:
            assert name in text, f"{name} 应该在工具列表中"


class TestMakeWorkerTools:
    """闭包工具工厂测试。"""

    def setup_method(self):
        self.workspace = MockWorkspace()
        self.tools = make_worker_tools(self.workspace)
        self.tool_map = {t.name: t for t in self.tools}

    def test_make_returns_six_tools(self):
        """返回 6 个工具（含 install_package）。"""
        assert len(self.tools) == 6

    def test_all_handlers_assigned(self):
        """所有 handler 都已赋值。"""
        for tool in self.tools:
            assert tool.handler is not None, f"{tool.name} handler 为 None"

    def test_write_file_tool(self):
        """write_file 工具。"""
        handler = self.tool_map["write_file"].handler
        assert handler is not None
        result = _run(handler(path="test.md", content="# Hello"))
        assert "test.md" in result
        assert "test.md" in self.workspace._files

    def test_read_file_tool(self):
        """read_file 工具。"""
        self.workspace._files["existing.txt"] = "existing content"
        handler = self.tool_map["read_file"].handler
        assert handler is not None
        result = _run(handler(path="existing.txt"))
        assert "existing content" in result

    def test_read_file_nonexistent_returns_error(self):
        """读取不存在的文件返回错误消息。"""
        handler = self.tool_map["read_file"].handler
        assert handler is not None
        result = _run(handler(path="nope.txt"))
        assert "不存在" in result or "exist" in result.lower()
        assert result.success is False

    def test_list_files_tool(self):
        """list_files 工具。"""
        self.workspace._files["a.txt"] = "a"
        self.workspace._files["b.txt"] = "bb"
        handler = self.tool_map["list_files"].handler
        assert handler is not None
        result = _run(handler(directory=""))
        assert "a.txt" in result
        assert "b.txt" in result

    def test_list_files_empty_workspace(self):
        """空工作区列出文件。"""
        handler = self.tool_map["list_files"].handler
        assert handler is not None
        result = _run(handler(directory=""))
        assert "空" in result or "empty" in result.lower()

    def test_run_python_tool(self):
        """run_python 工具委托给 workspace。"""
        handler = self.tool_map["run_python"].handler
        assert handler is not None
        result = _run(handler(code="print(42)"))
        assert "42" in result
        assert "0" in result  # exit code

    def test_run_python_empty_code(self):
        """run_python 空代码返回错误提示。"""
        handler = self.tool_map["run_python"].handler
        assert handler is not None
        result = _run(handler(code=""))
        assert "错误" in result or "空" in result
        assert result.success is False

    def test_run_python_nonzero_exit_is_failure(self):
        """沙盒退出码非零时，事件层不能再把工具标成成功。"""
        handler = self.tool_map["run_python"].handler
        assert handler is not None
        self.workspace.run_python = AsyncMock(
            return_value=SandboxResult(stdout="", stderr="沙盒执行失败", exit_code=-1)
        )

        result = _run(handler(code="print('x')"))

        assert "退出码: -1" in result
        assert result.success is False

    def test_web_search_tool_mock(self):
        """web_search 工具调用搜索引擎（mock）。"""
        handler = self.tool_map["web_search"].handler
        with patch("engines.worker.tools.make_worker_tools") as mock_make:
            # web_search 需要真实网络，仅验证 handler 存在
            assert handler is not None

    def test_write_file_rejects_illegal_path(self):
        """write_file 拒绝包含 .. 的路径。"""
        handler = self.tool_map["write_file"].handler
        assert handler is not None
        for bad_path in ["../escape.txt", "sub\\..\\escape.txt"]:
            result = _run(handler(path=bad_path, content="bad"))
            assert "非法" in result or "illegal" in result.lower() or "错误" in result

    def test_write_file_rejects_empty_path(self):
        """write_file 拒绝空路径。"""
        handler = self.tool_map["write_file"].handler
        assert handler is not None
        result = _run(handler(path="", content="x"))
        assert "有效" in result or "错误" in result or "valid" in result.lower()

    def test_write_file_rejects_none_content(self):
        """write_file 拒绝 None 内容。"""
        handler = self.tool_map["write_file"].handler
        assert handler is not None
        result = _run(handler(path="test.txt", content=None))
        assert "错误" in result or "valid" in result.lower()

    def test_install_package_rejects_bad_name(self):
        """install_package 拒绝非法包名。"""
        handler = self.tool_map["install_package"].handler
        assert handler is not None
        result = _run(handler(package="bad;package!"))
        assert "错误" in result or "非法" in result

    def test_install_package_empty_name(self):
        """install_package 拒绝空包名。"""
        handler = self.tool_map["install_package"].handler
        assert handler is not None
        result = _run(handler(package=""))
        assert "错误" in result or "包名" in result
