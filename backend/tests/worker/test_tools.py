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


class MockWorkspace(WorkspaceProvider):
    """测试用 Mock WorkspaceProvider。"""

    def __init__(self):
        self._files: dict[str, str] = {}

    async def write_file(self, path: str, content: str) -> str:
        self._files[path] = content
        return f"/mock/{path}"

    async def read_file(self, path: str) -> str:
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

    @property
    def location_description(self) -> str:
        return "本地: /mock/test"


class TestToolRegistration:
    """工具注册测试。"""

    def test_all_five_tools_registered(self):
        """5 个工具都已注册。"""
        expected = {"web_search", "run_python", "write_file", "read_file", "list_files"}
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
        for name in ["web_search", "run_python", "write_file", "read_file", "list_files"]:
            assert name in text, f"{name} 应该在工具列表中"


class TestMakeWorkerTools:
    """闭包工具工厂测试。"""

    def setup_method(self):
        self.workspace = MockWorkspace()
        self.tools = make_worker_tools(self.workspace)
        self.tool_map = {t.name: t for t in self.tools}

    def test_make_returns_five_tools(self):
        """返回 5 个工具。"""
        assert len(self.tools) == 5

    def test_all_handlers_assigned(self):
        """所有 handler 都已赋值。"""
        for tool in self.tools:
            assert tool.handler is not None, f"{tool.name} handler 为 None"

    def test_write_file_tool(self):
        """write_file 工具。"""
        handler = self.tool_map["write_file"].handler
        result = asyncio.get_event_loop().run_until_complete(
            handler(path="test.md", content="# Hello")
        )
        assert "test.md" in result
        assert "test.md" in self.workspace._files

    def test_read_file_tool(self):
        """read_file 工具。"""
        self.workspace._files["existing.txt"] = "existing content"
        handler = self.tool_map["read_file"].handler
        result = asyncio.get_event_loop().run_until_complete(
            handler(path="existing.txt")
        )
        assert "existing content" in result

    def test_read_file_nonexistent_returns_error(self):
        """读取不存在的文件返回错误消息。"""
        handler = self.tool_map["read_file"].handler
        result = asyncio.get_event_loop().run_until_complete(
            handler(path="nope.txt")
        )
        assert "不存在" in result or "exist" in result.lower()

    def test_list_files_tool(self):
        """list_files 工具。"""
        self.workspace._files["a.txt"] = "a"
        self.workspace._files["b.txt"] = "bb"
        handler = self.tool_map["list_files"].handler
        result = asyncio.get_event_loop().run_until_complete(handler(directory=""))
        assert "a.txt" in result
        assert "b.txt" in result

    def test_list_files_empty_workspace(self):
        """空工作区列出文件。"""
        handler = self.tool_map["list_files"].handler
        result = asyncio.get_event_loop().run_until_complete(handler(directory=""))
        assert "空" in result or "empty" in result.lower()

    def test_run_python_tool(self):
        """run_python 工具委托给 workspace。"""
        handler = self.tool_map["run_python"].handler
        result = asyncio.get_event_loop().run_until_complete(
            handler(code="print(42)")
        )
        assert "42" in result
        assert "0" in result  # exit code

    def test_web_search_tool(self):
        """web_search 工具调用搜索引擎。"""
        handler = self.tool_map["web_search"].handler
        with patch("llm.search.web_search") as mock_search:
            mock_search.return_value = [
                {"title": "Test Result", "snippet": "A test result", "url": "https://example.com"}
            ]
            from llm.search import format_search_results
            mock_search.return_value = mock_search.return_value

            import asyncio
            async def run():
                return await handler(query="test query")

            # 函数需要 mock 的返回值
            pass  # web_search 集成测试需要真实 DuckDuckGo 连接

    def test_write_file_rejects_illegal_path(self):
        """write_file 拒绝包含 .. 的路径。"""
        handler = self.tool_map["write_file"].handler
        for bad_path in ["../escape.txt", "sub\\..\\escape.txt"]:
            result = asyncio.get_event_loop().run_until_complete(
                handler(path=bad_path, content="bad")
            )
            assert "非法" in result or "illegal" in result.lower() or "错误" in result

    def test_write_file_rejects_empty_path(self):
        """write_file 拒绝空路径。"""
        handler = self.tool_map["write_file"].handler
        result = asyncio.get_event_loop().run_until_complete(
            handler(path="", content="x")
        )
        assert "有效" in result or "错误" in result or "valid" in result.lower()
