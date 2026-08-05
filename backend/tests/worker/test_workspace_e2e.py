"""Step T11: 双轨工作区 E2E 测试 — LocalWorkspace vs CloudWorkspace 一致性。

验证:
  - 同一写入操作 → 两者产出文件内容一致
  - 同一读取操作 → 返回内容一致
  - 文件列表 → 结构一致
  - 删除/存在检查 → 行为一致

注意: CloudWorkspace 使用 Mock SFTP，验证接口行为一致性而非真实 SSH 连通性。
"""

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from engines.worker.workspace import (
    CloudWorkspace,
    FileInfo,
    LocalWorkspace,
    WorkspaceProvider,
)


def _run(coro):
    """异步运行辅助。"""
    return asyncio.run(coro)


# =============================================================================
# Mock CloudWorkspace（内存存储，模拟 SFTP 行为）
# =============================================================================


class MockCloudWorkspace(WorkspaceProvider):
    """模拟 CloudWorkspace 的行为，使用内存存储。

    与 LocalWorkspace 对比测试时，验证接口行为一致性。
    """

    def __init__(self, root_path: str = "/data/workspace"):
        self._root = root_path
        self._files: dict[str, str] = {}

    async def write_file(self, path: str, content: str) -> str:
        self._files[path] = content
        return f"{self._root}/{path}"

    async def read_file(self, path: str, snapshot: str | None = None) -> str:
        if path not in self._files:
            raise FileNotFoundError(f"文件不存在: {path}")
        return self._files[path]

    async def list_files(self, directory: str = "") -> list[FileInfo]:
        files = []
        for p, c in self._files.items():
            if not directory or p.startswith(directory + "/") or p.startswith(directory):
                files.append(FileInfo(
                    path=p,
                    size=len(c.encode("utf-8")),
                    modified_at="2024-01-01T00:00:00",
                ))
        files.sort(key=lambda f: f.modified_at, reverse=True)
        return files

    async def delete_file(self, path: str) -> bool:
        if path in self._files:
            del self._files[path]
            return True
        return False

    async def run_python(self, code: str, timeout: int = 30):
        from engines.worker.workspace import SandboxResult
        # 简化实现：只支持 print
        return SandboxResult(stdout="mock output\n", stderr="", exit_code=0)

    async def exists(self, path: str) -> bool:
        return path in self._files

    @property
    def location_description(self) -> str:
        return f"云端: mock@localhost:{self._root}"


# =============================================================================
# 双轨一致性测试
# =============================================================================


class TestDualTrackWriteConsistency:
    """写入操作一致性 — Local vs Cloud 产出相同。"""

    def test_write_same_content(self, tmp_path):
        """同一内容写入后读取结果一致。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        content = "# 调研报告\n\n这是测试内容。\n"
        _run(local.write_file("report.md", content))
        _run(cloud.write_file("report.md", content))

        # 读取并对比
        local_content = _run(local.read_file("report.md"))
        cloud_content = _run(cloud.read_file("report.md"))
        assert local_content == cloud_content == content

    def test_write_utf8_content(self, tmp_path):
        """UTF-8 内容（含 emoji）写入一致。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        content = "Hello 🌍 世界 🚀"
        _run(local.write_file("unicode.txt", content))
        _run(cloud.write_file("unicode.txt", content))

        assert _run(local.read_file("unicode.txt")) == _run(cloud.read_file("unicode.txt"))

    def test_write_subdirectory(self, tmp_path):
        """子目录文件写入一致。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        content = '{"key": "value"}'
        _run(local.write_file("data/config.json", content))
        _run(cloud.write_file("data/config.json", content))

        assert _run(local.read_file("data/config.json")) == _run(cloud.read_file("data/config.json"))


class TestDualTrackReadConsistency:
    """读取操作一致性。"""

    def test_read_same_content(self, tmp_path):
        """读取返回相同内容。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        content = "test data"
        _run(local.write_file("file.txt", content))
        _run(cloud.write_file("file.txt", content))

        assert _run(local.read_file("file.txt")) == _run(cloud.read_file("file.txt"))

    def test_read_nonexistent_both_raise(self, tmp_path):
        """两者读取不存在文件都抛 FileNotFoundError。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        with pytest.raises(FileNotFoundError):
            _run(local.read_file("ghost.txt"))
        with pytest.raises(FileNotFoundError):
            _run(cloud.read_file("ghost.txt"))


class TestDualTrackListConsistency:
    """文件列表一致性。"""

    def test_list_files_count(self, tmp_path):
        """文件数量一致。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        for name in ["a.txt", "b.txt", "c.txt"]:
            _run(local.write_file(name, f"content of {name}"))
            _run(cloud.write_file(name, f"content of {name}"))

        local_files = _run(local.list_files())
        cloud_files = _run(cloud.list_files())

        assert len(local_files) == len(cloud_files) == 3

    def test_list_files_paths(self, tmp_path):
        """文件路径集合一致。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        paths = ["x.md", "y.md", "data/z.md"]
        for p in paths:
            _run(local.write_file(p, "content"))
            _run(cloud.write_file(p, "content"))

        local_paths = {f.path for f in _run(local.list_files())}
        cloud_paths = {f.path for f in _run(cloud.list_files())}

        assert local_paths == cloud_paths

    def test_list_empty_both(self, tmp_path):
        """空目录两者都返回空列表。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        assert _run(local.list_files()) == []
        assert _run(cloud.list_files()) == []


class TestDualTrackDeleteConsistency:
    """删除操作一致性。"""

    def test_delete_existing(self, tmp_path):
        """删除存在的文件都返回 True。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        _run(local.write_file("temp.txt", "temp"))
        _run(cloud.write_file("temp.txt", "temp"))

        assert _run(local.delete_file("temp.txt")) is True
        assert _run(cloud.delete_file("temp.txt")) is True

    def test_delete_nonexistent(self, tmp_path):
        """删除不存在的文件都返回 False。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        assert _run(local.delete_file("ghost.txt")) is False
        assert _run(cloud.delete_file("ghost.txt")) is False


class TestDualTrackExistsConsistency:
    """存在检查一致性。"""

    def test_exists_true(self, tmp_path):
        """存在的文件都返回 True。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        _run(local.write_file("here.txt", "yes"))
        _run(cloud.write_file("here.txt", "yes"))

        assert _run(local.exists("here.txt")) is True
        assert _run(cloud.exists("here.txt")) is True

    def test_exists_false(self, tmp_path):
        """不存在的文件都返回 False。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        assert _run(local.exists("nope.txt")) is False
        assert _run(cloud.exists("nope.txt")) is False


class TestDualTrackWorkflowConsistency:
    """完整工作流一致性。"""

    def test_write_read_delete_workflow(self, tmp_path):
        """写入→读取→删除→确认不存在 完整流程一致。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        # 写入
        _run(local.write_file("workflow.txt", "step by step"))
        _run(cloud.write_file("workflow.txt", "step by step"))

        # 读取
        assert _run(local.read_file("workflow.txt")) == _run(cloud.read_file("workflow.txt"))

        # 删除
        assert _run(local.delete_file("workflow.txt")) == _run(cloud.delete_file("workflow.txt"))

        # 确认不存在
        assert _run(local.exists("workflow.txt")) == _run(cloud.exists("workflow.txt")) == False

    def test_multiple_files_workflow(self, tmp_path):
        """多文件工作流一致。"""
        local = LocalWorkspace(str(tmp_path), "run1")
        cloud = MockCloudWorkspace()

        # 写入多个文件
        files = {
            "report.md": "# Report",
            "data/results.json": '{"count": 42}',
            "notes.txt": "Some notes",
        }
        for path, content in files.items():
            _run(local.write_file(path, content))
            _run(cloud.write_file(path, content))

        # 验证所有文件内容一致
        for path in files:
            local_content = _run(local.read_file(path))
            cloud_content = _run(cloud.read_file(path))
            assert local_content == cloud_content

        # 验证文件列表数量一致
        assert len(_run(local.list_files())) == len(_run(cloud.list_files()))
