"""Step T10: LocalWorkspace 测试。"""

import asyncio
import tempfile
from pathlib import Path

import pytest
from engines.worker.workspace import LocalWorkspace, FileInfo, _resolve_safe


@pytest.fixture
def temp_workspace():
    """创建临时工作区。"""
    with tempfile.TemporaryDirectory() as tmpdir:
        ws = LocalWorkspace(tmpdir, "test-run")
        yield ws


class TestPathSafety:
    """路径安全校验。"""

    def test_normal_path_resolved(self):
        """普通路径正常解析。"""
        result = _resolve_safe("/tmp/test", "hello.txt")
        assert result.endswith("hello.txt")

    def test_parent_traversal_blocked(self):
        """../ 路径穿越被拦截。"""
        with pytest.raises(PermissionError):
            _resolve_safe("/tmp/test", "../../etc/passwd")

    def test_absolute_path_blocked(self):
        """绝对路径——如果指向 root 外部则被拦截。"""
        import sys
        if sys.platform == "win32":
            with pytest.raises(PermissionError):
                _resolve_safe("C:\\safe\\dir", "C:\\windows\\system32\\config")
        else:
            with pytest.raises(PermissionError):
                _resolve_safe("/tmp/test", "/etc/passwd")


class TestLocalWorkspace:
    """LocalWorkspace CRUD 测试。"""

    def test_write_and_read(self, temp_workspace):
        """写入和读取。"""
        asyncio.get_event_loop().run_until_complete(
            temp_workspace.write_file("test.txt", "hello")
        )
        content = asyncio.get_event_loop().run_until_complete(
            temp_workspace.read_file("test.txt")
        )
        assert content == "hello"

    def test_write_nested_path(self, temp_workspace):
        """嵌套路径写入自动创建父目录。"""
        asyncio.get_event_loop().run_until_complete(
            temp_workspace.write_file("sub/dir/deep.txt", "deep content")
        )
        content = asyncio.get_event_loop().run_until_complete(
            temp_workspace.read_file("sub/dir/deep.txt")
        )
        assert content == "deep content"

    def test_read_nonexistent(self, temp_workspace):
        """读取不存在的文件。"""
        with pytest.raises(FileNotFoundError):
            asyncio.get_event_loop().run_until_complete(
                temp_workspace.read_file("nonexistent.txt")
            )

    def test_list_files(self, temp_workspace):
        """列出文件。"""
        asyncio.get_event_loop().run_until_complete(
            temp_workspace.write_file("a.txt", "a")
        )
        asyncio.get_event_loop().run_until_complete(
            temp_workspace.write_file("b.txt", "bb")
        )
        files = asyncio.get_event_loop().run_until_complete(
            temp_workspace.list_files()
        )
        assert len(files) == 2
        paths = {f.path for f in files}
        assert "a.txt" in paths
        assert "b.txt" in paths

    def test_list_files_empty(self, temp_workspace):
        """空工作区返回空列表。"""
        files = asyncio.get_event_loop().run_until_complete(
            temp_workspace.list_files()
        )
        assert files == []

    def test_delete_file(self, temp_workspace):
        """删除文件。"""
        asyncio.get_event_loop().run_until_complete(
            temp_workspace.write_file("to_delete.txt", "bye")
        )
        deleted = asyncio.get_event_loop().run_until_complete(
            temp_workspace.delete_file("to_delete.txt")
        )
        assert deleted is True

        exists = asyncio.get_event_loop().run_until_complete(
            temp_workspace.exists("to_delete.txt")
        )
        assert exists is False

    def test_delete_nonexistent(self, temp_workspace):
        """删除不存在的文件返回 False。"""
        deleted = asyncio.get_event_loop().run_until_complete(
            temp_workspace.delete_file("nope.txt")
        )
        assert deleted is False

    def test_exists(self, temp_workspace):
        """存在检查。"""
        assert asyncio.get_event_loop().run_until_complete(
            temp_workspace.exists("anything.txt")
        ) is False

        asyncio.get_event_loop().run_until_complete(
            temp_workspace.write_file("anything.txt", "x")
        )
        assert asyncio.get_event_loop().run_until_complete(
            temp_workspace.exists("anything.txt")
        ) is True

    def test_run_python(self, temp_workspace):
        """在工作区中执行 Python。"""
        result = asyncio.get_event_loop().run_until_complete(
            temp_workspace.run_python("print(42)")
        )
        assert result.exit_code == 0
        assert "42" in result.stdout

    def test_location_description(self, temp_workspace):
        """位置描述包含 ~ 路径缩写。"""
        desc = temp_workspace.location_description
        assert "本地" in desc or "local" in desc.lower()

    def test_write_overwrite(self, temp_workspace):
        """覆盖写入。"""
        asyncio.get_event_loop().run_until_complete(
            temp_workspace.write_file("same.txt", "v1")
        )
        asyncio.get_event_loop().run_until_complete(
            temp_workspace.write_file("same.txt", "v2")
        )
        content = asyncio.get_event_loop().run_until_complete(
            temp_workspace.read_file("same.txt")
        )
        assert content == "v2"
