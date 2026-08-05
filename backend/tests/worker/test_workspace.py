"""Step T11: LocalWorkspace 单元测试 — 真实文件系统，零 Mock。

覆盖:
  - 所有 WorkspaceProvider 方法 (write/read/list/delete/exists/run_python)
  - 路径穿越防护 (_resolve_safe)
  - 快照功能 (write_file 覆盖自动快照 + read_file snapshot 参数)
  - safe_write / safe_read 编码处理
  - location_description 格式
"""

import asyncio
import os
import shutil
from pathlib import Path

import pytest

from engines.worker.workspace import (
    FileInfo,
    LocalWorkspace,
    SandboxResult,
    WorkspaceProvider,
    _resolve_safe,
    safe_read,
    safe_write,
)


def _run(coro):
    """异步运行辅助。"""
    return asyncio.run(coro)


# =============================================================================
# _resolve_safe — 路径穿越防护
# =============================================================================


class TestResolveSafe:
    """路径解析与安全校验。"""

    def test_normal_path(self, tmp_path):
        """正常相对路径正确解析。"""
        root = str(tmp_path)
        result = _resolve_safe(root, "report.md")
        assert result.startswith(root)
        assert result.endswith("report.md")

    def test_subdirectory_path(self, tmp_path):
        """子目录路径正确解析。"""
        root = str(tmp_path)
        result = _resolve_safe(root, "data/trends.json")
        assert result.startswith(root)
        assert "data" in result

    def test_path_traversal_rejected(self, tmp_path):
        """路径穿越到 root 外部 → PermissionError。"""
        root = str(tmp_path)
        with pytest.raises(PermissionError, match="路径穿越"):
            _resolve_safe(root, "../../etc/passwd")

    def test_path_traversal_with_dots(self, tmp_path):
        """混合 .. 的路径穿越 → PermissionError。"""
        root = str(tmp_path)
        with pytest.raises(PermissionError, match="路径穿越"):
            _resolve_safe(root, "data/../../outside.txt")

    def test_backslash_normalization(self, tmp_path):
        """Windows 风格反斜杠路径被正确清理。"""
        root = str(tmp_path)
        result = _resolve_safe(root, "data\\report.md")
        assert result.startswith(root)

    def test_leading_slash_stripped(self, tmp_path):
        """前导斜杠被清理。"""
        root = str(tmp_path)
        result = _resolve_safe(root, "/report.md")
        assert result.startswith(root)
        assert result.endswith("report.md")

    def test_empty_path_resolves_to_root(self, tmp_path):
        """空路径解析为 root 自身。"""
        root = str(tmp_path)
        result = _resolve_safe(root, "")
        resolved_root = str(Path(root).resolve())
        assert result == resolved_root


# =============================================================================
# safe_write / safe_read — 编码安全 I/O
# =============================================================================


class TestSafeIO:
    """safe_write 和 safe_read 编码处理。"""

    def test_write_and_read_utf8(self, tmp_path):
        """UTF-8 内容正确读写。"""
        p = tmp_path / "test.txt"
        safe_write(p, "你好世界 🌍")
        content = safe_read(p)
        assert content == "你好世界 🌍"

    def test_write_creates_parent_dirs(self, tmp_path):
        """写入时自动创建父目录。"""
        p = tmp_path / "sub" / "dir" / "file.txt"
        safe_write(p, "hello")
        assert p.exists()
        assert safe_read(p) == "hello"

    def test_read_non_utf8_fallback(self, tmp_path):
        """非 UTF-8 文件通过 chardet 或 replace 兜底读取。"""
        p = tmp_path / "binary.txt"
        # 写入 GBK 编码内容
        p.write_bytes("你好".encode("gbk"))
        content = safe_read(p)
        # 应该能读取（可能通过 chardet 或 replace）
        assert len(content) > 0


# =============================================================================
# LocalWorkspace — 初始化
# =============================================================================


class TestLocalWorkspaceInit:
    """LocalWorkspace 初始化与目录结构。"""

    def test_creates_directory_structure(self, tmp_path):
        """创建 files/, .tasks/, .logs/ 子目录。"""
        ws = LocalWorkspace(str(tmp_path), "test_run")
        root = Path(tmp_path) / "test_run"
        assert (root / "files").is_dir()
        assert (root / ".tasks").is_dir()
        assert (root / ".logs").is_dir()

    def test_root_property(self, tmp_path):
        """root 属性返回正确路径。"""
        ws = LocalWorkspace(str(tmp_path), "run123")
        assert ws.root == str(Path(tmp_path) / "run123")

    def test_location_description(self, tmp_path):
        """location_description 返回 '本地: ...' 格式。"""
        ws = LocalWorkspace(str(tmp_path), "run123")
        desc = ws.location_description
        assert desc.startswith("本地:")


# =============================================================================
# LocalWorkspace — write_file
# =============================================================================


class TestLocalWorkspaceWrite:
    """write_file 测试。"""

    def test_write_file_basic(self, tmp_path):
        """基本文件写入。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        result = _run(ws.write_file("hello.txt", "hello world"))
        # 返回绝对路径
        assert result.endswith("hello.txt")
        assert Path(result).exists()
        assert Path(result).read_text(encoding="utf-8") == "hello world"

    def test_write_creates_subdirectory(self, tmp_path):
        """写入时自动创建子目录。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        _run(ws.write_file("data/nested/report.md", "# Report"))
        file_path = Path(tmp_path) / "run1" / "files" / "data" / "nested" / "report.md"
        assert file_path.exists()

    def test_write_overwrite_creates_snapshot(self, tmp_path):
        """覆盖写入时自动创建快照。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        _run(ws.write_file("report.md", "version 1"))
        _run(ws.write_file("report.md", "version 2"))
        # 当前文件是最新版本
        content = _run(ws.read_file("report.md"))
        assert content == "version 2"
        # 快照目录应有文件
        snapshot_dir = Path(tmp_path) / "run1" / ".snapshots"
        assert snapshot_dir.exists()
        snapshots = list(snapshot_dir.iterdir())
        assert len(snapshots) >= 1
        assert any("report.md" in s.name for s in snapshots)

    def test_write_returns_absolute_path(self, tmp_path):
        """返回值是绝对路径。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        result = _run(ws.write_file("test.txt", "content"))
        assert os.path.isabs(result)


# =============================================================================
# LocalWorkspace — read_file
# =============================================================================


class TestLocalWorkspaceRead:
    """read_file 测试。"""

    def test_read_file_basic(self, tmp_path):
        """基本文件读取。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        _run(ws.write_file("data.txt", "some data"))
        content = _run(ws.read_file("data.txt"))
        assert content == "some data"

    def test_read_nonexistent_raises(self, tmp_path):
        """读取不存在的文件 → FileNotFoundError。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        with pytest.raises(FileNotFoundError, match="文件不存在"):
            _run(ws.read_file("nonexistent.txt"))

    def test_read_snapshot(self, tmp_path):
        """通过 snapshot 参数读取历史版本。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        _run(ws.write_file("report.md", "v1"))
        _run(ws.write_file("report.md", "v2"))
        # 获取快照列表
        snapshots = _run(ws.list_snapshots("report.md"))
        assert len(snapshots) >= 1
        # 读取最早的快照
        oldest_snapshot = snapshots[-1]
        content = _run(ws.read_file("report.md", snapshot=oldest_snapshot["name"]))
        assert content == "v1"

    def test_read_nonexistent_snapshot_raises(self, tmp_path):
        """读取不存在的快照 → FileNotFoundError。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        with pytest.raises(FileNotFoundError, match="快照不存在"):
            _run(ws.read_file("anything.txt", snapshot="fake_snapshot"))


# =============================================================================
# LocalWorkspace — list_files / list_snapshots
# =============================================================================


class TestLocalWorkspaceList:
    """list_files 和 list_snapshots 测试。"""

    def test_list_files_root(self, tmp_path):
        """列出根目录文件。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        _run(ws.write_file("a.txt", "aaa"))
        _run(ws.write_file("b.txt", "bb"))
        files = _run(ws.list_files())
        paths = [f.path for f in files]
        assert "a.txt" in paths
        assert "b.txt" in paths

    def test_list_files_subdirectory(self, tmp_path):
        """列出子目录文件。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        _run(ws.write_file("data/x.txt", "x"))
        _run(ws.write_file("data/y.txt", "y"))
        _run(ws.write_file("other/z.txt", "z"))
        files = _run(ws.list_files("data"))
        paths = [f.path for f in files]
        assert len(paths) == 2

    def test_list_files_empty(self, tmp_path):
        """空目录返回空列表。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        files = _run(ws.list_files())
        assert files == []

    def test_list_files_returns_file_info(self, tmp_path):
        """返回 FileInfo 包含正确字段。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        _run(ws.write_file("test.txt", "hello"))
        files = _run(ws.list_files())
        assert len(files) == 1
        fi = files[0]
        assert isinstance(fi, FileInfo)
        assert fi.path == "test.txt"
        assert fi.size == 5
        assert fi.modified_at  # 非空时间戳

    def test_list_snapshots_empty(self, tmp_path):
        """无快照时返回空列表。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        snapshots = _run(ws.list_snapshots("nonexistent.txt"))
        assert snapshots == []

    def test_list_snapshots_after_overwrite(self, tmp_path):
        """覆盖后快照列表非空。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        _run(ws.write_file("doc.md", "v1"))
        _run(ws.write_file("doc.md", "v2"))
        _run(ws.write_file("doc.md", "v3"))
        snapshots = _run(ws.list_snapshots("doc.md"))
        # 快照命名精度为秒级，同秒内多次覆盖可能只保留最后 1 个
        assert len(snapshots) >= 1


# =============================================================================
# LocalWorkspace — delete_file / exists
# =============================================================================


class TestLocalWorkspaceDeleteExists:
    """delete_file 和 exists 测试。"""

    def test_delete_existing_file(self, tmp_path):
        """删除存在的文件 → True。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        _run(ws.write_file("temp.txt", "temp"))
        result = _run(ws.delete_file("temp.txt"))
        assert result is True
        assert not _run(ws.exists("temp.txt"))

    def test_delete_nonexistent_file(self, tmp_path):
        """删除不存在的文件 → False。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        result = _run(ws.delete_file("ghost.txt"))
        assert result is False

    def test_exists_true(self, tmp_path):
        """存在的文件 → True。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        _run(ws.write_file("here.txt", "yes"))
        assert _run(ws.exists("here.txt")) is True

    def test_exists_false(self, tmp_path):
        """不存在的文件 → False。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        assert _run(ws.exists("nope.txt")) is False


# =============================================================================
# LocalWorkspace — run_python
# =============================================================================


class TestLocalWorkspaceRunPython:
    """run_python 委托给 sandbox 执行。"""

    def test_run_python_basic(self, tmp_path):
        """基本 Python 代码执行。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        result = _run(ws.run_python("print(2 + 3)"))
        assert isinstance(result, SandboxResult)
        assert result.stdout.strip() == "5"
        assert result.exit_code == 0

    def test_run_python_rejected_code(self, tmp_path):
        """黑名单代码被拒绝。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        result = _run(ws.run_python("import os; os.system('ls')"))
        assert result.exit_code == -1
        assert "安全检查" in result.stderr


# =============================================================================
# LocalWorkspace — 路径穿越防护（集成测试）
# =============================================================================


class TestLocalWorkspacePathTraversal:
    """LocalWorkspace 路径穿越防护集成测试。"""

    def test_write_traversal_rejected(self, tmp_path):
        """写入路径穿越 → PermissionError。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        with pytest.raises(PermissionError):
            _run(ws.write_file("../../outside.txt", "malicious"))

    def test_read_traversal_rejected(self, tmp_path):
        """读取路径穿越 → PermissionError。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        with pytest.raises(PermissionError):
            _run(ws.read_file("../../etc/passwd"))

    def test_delete_traversal_rejected(self, tmp_path):
        """删除路径穿越 → PermissionError。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        with pytest.raises(PermissionError):
            _run(ws.delete_file("../../important_file"))

    def test_exists_traversal_rejected(self, tmp_path):
        """exists 路径穿越 → PermissionError。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        with pytest.raises(PermissionError):
            _run(ws.exists("../../etc/passwd"))


# =============================================================================
# WorkspaceProvider ABC 验证
# =============================================================================


class TestWorkspaceProviderABC:
    """WorkspaceProvider 抽象接口验证。"""

    def test_cannot_instantiate_abc(self):
        """不能直接实例化 WorkspaceProvider。"""
        with pytest.raises(TypeError):
            WorkspaceProvider()  # type: ignore[abstract]

    def test_local_workspace_is_provider(self, tmp_path):
        """LocalWorkspace 是 WorkspaceProvider 的子类。"""
        ws = LocalWorkspace(str(tmp_path), "run1")
        assert isinstance(ws, WorkspaceProvider)
