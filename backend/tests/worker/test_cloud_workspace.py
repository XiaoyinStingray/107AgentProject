"""Step T11: CloudWorkspace 单元测试 — Mock asyncssh/SFTP。

由于本机未安装 OpenSSH Server，CloudWorkspace 测试使用 Mock 模拟 SSH 连接和 SFTP 操作。

覆盖:
  - _ensure_connected: 首次连接 / 断连重连 / 超过重连次数
  - write_file / read_file / list_files / delete_file / exists
  - run_python: 正常执行 / 安全检查拒绝 / 超时
  - test_connection: 成功 / 失败
  - _disconnect: 连接清理
  - location_description 格式
"""

import asyncio
from dataclasses import dataclass
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from engines.worker.workspace import CloudWorkspace, FileInfo, SandboxResult


def _run(coro):
    """异步运行辅助。"""
    return asyncio.run(coro)


# =============================================================================
# Mock 辅助对象
# =============================================================================


class MockSFTPEntry:
    """模拟 SFTP 目录条目。"""

    def __init__(self, filename: str, is_file: bool = True, size: int = 100, mtime: float = 1000.0):
        self.filename = filename
        self.type = "file" if is_file else "directory"
        self.attrs = MagicMock()
        self.attrs.isreg = is_file
        self.attrs.size = size
        self.attrs.mtime = mtime


class MockSSHResult:
    """模拟 SSH exec 结果。"""

    def __init__(self, stdout: str = "", stderr: str = "", exit_status: int = 0):
        self.stdout = stdout
        self.stderr = stderr
        self.exit_status = exit_status


def _make_mock_cloud() -> tuple[CloudWorkspace, MagicMock, MagicMock]:
    """创建 CloudWorkspace + Mock 连接 + Mock SFTP。

    Returns:
        (workspace, mock_conn, mock_sftp)
    """
    ws = CloudWorkspace(
        host="test-host",
        port=22,
        user="testuser",
        key="-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
        path="/data/workspace",
    )
    mock_conn = MagicMock()
    mock_conn.is_closed.return_value = False
    mock_conn.run = AsyncMock(return_value=MockSSHResult(stdout="42\n"))
    mock_conn.close = MagicMock()

    mock_sftp = AsyncMock()
    mock_sftp.makedirs = AsyncMock()
    mock_sftp.remove = AsyncMock()
    mock_sftp.stat = AsyncMock()
    mock_sftp.exit = MagicMock()

    # Mock SFTP open() 返回异步上下文管理器
    mock_file = AsyncMock()
    mock_file.write = AsyncMock()
    mock_file.read = AsyncMock(return_value="file content")
    mock_file.__aenter__ = AsyncMock(return_value=mock_file)
    mock_file.__aexit__ = AsyncMock(return_value=None)
    mock_sftp.open = MagicMock(return_value=mock_file)

    # 设置已连接状态
    ws._conn = mock_conn
    ws._sftp = mock_sftp
    ws._reconnect_attempts = 0

    return ws, mock_conn, mock_sftp


# =============================================================================
# _ensure_connected — 连接管理
# =============================================================================


class TestCloudWorkspaceConnect:
    """SSH 连接管理测试。"""

    def test_already_connected(self):
        """已连接时 _ensure_connected 直接返回。"""
        ws, mock_conn, _ = _make_mock_cloud()
        _run(ws._ensure_connected())
        # 不应尝试重新连接
        assert mock_conn.is_closed.called

    def test_reconnect_when_disconnected(self):
        """连接断开时自动重连。"""
        ws, mock_conn, _ = _make_mock_cloud()
        mock_conn.is_closed.return_value = True  # 模拟断开

        mock_asyncssh = MagicMock()
        mock_asyncssh.import_private_key.return_value = MagicMock()
        mock_asyncssh.connect = AsyncMock(return_value=mock_conn)
        mock_conn.start_sftp_client = AsyncMock(return_value=ws._sftp)

        with patch.dict("sys.modules", {"asyncssh": mock_asyncssh}):
            _run(ws._ensure_connected())
        mock_asyncssh.connect.assert_called_once()

    def test_max_reconnect_exceeded(self):
        """超过最大重连次数 → ConnectionError。"""
        ws, _, _ = _make_mock_cloud()
        ws._conn = None  # 无连接
        ws._reconnect_attempts = 10  # 已超过限制

        mock_asyncssh = MagicMock()
        with patch.dict("sys.modules", {"asyncssh": mock_asyncssh}):
            with pytest.raises(ConnectionError, match="已重试"):
                _run(ws._ensure_connected())

    def test_connect_with_pem_key(self):
        """PEM 格式私钥正确解析。"""
        ws, mock_conn, _ = _make_mock_cloud()
        ws._conn = None
        ws._reconnect_attempts = 0

        mock_asyncssh = MagicMock()
        mock_asyncssh.import_private_key.return_value = MagicMock()
        mock_asyncssh.connect = AsyncMock(return_value=mock_conn)
        mock_conn.start_sftp_client = AsyncMock(return_value=ws._sftp)

        with patch.dict("sys.modules", {"asyncssh": mock_asyncssh}):
            _run(ws._ensure_connected())
        mock_asyncssh.import_private_key.assert_called_once()

    def test_connect_failure_raises(self):
        """连接失败 → ConnectionError。"""
        ws, _, _ = _make_mock_cloud()
        ws._conn = None
        ws._reconnect_attempts = 0

        mock_asyncssh = MagicMock()
        mock_asyncssh.import_private_key.return_value = MagicMock()
        mock_asyncssh.connect = AsyncMock(side_effect=Exception("Connection refused"))

        with patch.dict("sys.modules", {"asyncssh": mock_asyncssh}):
            with pytest.raises(ConnectionError, match="SSH 连接失败"):
                _run(ws._ensure_connected())


# =============================================================================
# CloudWorkspace — write_file
# =============================================================================


class TestCloudWorkspaceWrite:
    """write_file 测试。"""

    def test_write_file_basic(self):
        """基本文件写入。"""
        ws, _, mock_sftp = _make_mock_cloud()
        result = _run(ws.write_file("report.md", "# Report"))
        mock_sftp.open.assert_called_once()
        assert result.endswith("report.md")

    def test_write_creates_parent_dir(self):
        """写入时创建父目录。"""
        ws, _, mock_sftp = _make_mock_cloud()
        _run(ws.write_file("data/nested/file.txt", "content"))
        mock_sftp.makedirs.assert_called_once()

    def test_write_returns_remote_path(self):
        """返回值是远程绝对路径。"""
        ws, _, _ = _make_mock_cloud()
        result = _run(ws.write_file("test.txt", "hello"))
        assert result == "/data/workspace/test.txt"


# =============================================================================
# CloudWorkspace — read_file
# =============================================================================


class TestCloudWorkspaceRead:
    """read_file 测试。"""

    def test_read_file_basic(self):
        """基本文件读取。"""
        ws, _, mock_sftp = _make_mock_cloud()
        content = _run(ws.read_file("test.txt"))
        assert content == "file content"

    def test_read_nonexistent_raises(self):
        """读取不存在的文件 → FileNotFoundError。"""
        ws, _, mock_sftp = _make_mock_cloud()
        # 让 open 抛异常模拟文件不存在
        mock_sftp.open = MagicMock(side_effect=Exception("No such file"))
        with pytest.raises(FileNotFoundError, match="云端文件不存在"):
            _run(ws.read_file("ghost.txt"))


# =============================================================================
# CloudWorkspace — list_files
# =============================================================================


class TestCloudWorkspaceList:
    """list_files 测试。"""

    def test_list_files_basic(self):
        """列出目录文件。"""
        ws, _, mock_sftp = _make_mock_cloud()

        # 模拟 scandir 返回异步迭代器
        async def mock_scandir(path):
            yield MockSFTPEntry("a.txt", size=10)
            yield MockSFTPEntry("b.txt", size=20)

        mock_sftp.scandir = mock_scandir
        files = _run(ws.list_files())
        assert len(files) == 2
        assert files[0].path == "a.txt"

    def test_list_files_empty(self):
        """空目录返回空列表。"""
        ws, _, mock_sftp = _make_mock_cloud()

        async def mock_scandir(path):
            return
            yield  # 使成为异步生成器

        mock_sftp.scandir = mock_scandir
        files = _run(ws.list_files())
        assert files == []

    def test_list_files_error_returns_empty(self):
        """list_files 出错时返回空列表（不抛异常）。"""
        ws, _, mock_sftp = _make_mock_cloud()
        mock_sftp.scandir = MagicMock(side_effect=Exception("SFTP error"))

        # scandir 失败时应该返回空列表
        files = _run(ws.list_files())
        assert files == []


# =============================================================================
# CloudWorkspace — delete_file / exists
# =============================================================================


class TestCloudWorkspaceDeleteExists:
    """delete_file 和 exists 测试。"""

    def test_delete_existing_file(self):
        """删除存在的文件 → True。"""
        ws, _, mock_sftp = _make_mock_cloud()
        result = _run(ws.delete_file("temp.txt"))
        assert result is True
        mock_sftp.remove.assert_called_once()

    def test_delete_nonexistent_file(self):
        """删除不存在的文件 → False。"""
        ws, _, mock_sftp = _make_mock_cloud()
        mock_sftp.remove = AsyncMock(side_effect=Exception("No such file"))
        result = _run(ws.delete_file("ghost.txt"))
        assert result is False

    def test_exists_true(self):
        """文件存在 → True。"""
        ws, _, mock_sftp = _make_mock_cloud()
        mock_sftp.stat = AsyncMock(return_value=MagicMock())
        result = _run(ws.exists("file.txt"))
        assert result is True

    def test_exists_false(self):
        """文件不存在 → False。"""
        ws, _, mock_sftp = _make_mock_cloud()
        mock_sftp.stat = AsyncMock(side_effect=Exception("No such file"))
        result = _run(ws.exists("ghost.txt"))
        assert result is False


# =============================================================================
# CloudWorkspace — run_python
# =============================================================================


class TestCloudWorkspaceRunPython:
    """run_python 测试。"""

    def test_run_python_basic(self):
        """基本 Python 代码执行。"""
        ws, mock_conn, mock_sftp = _make_mock_cloud()
        mock_conn.run = AsyncMock(return_value=MockSSHResult(stdout="42\n", exit_status=0))
        result = _run(ws.run_python("print(42)"))
        assert isinstance(result, SandboxResult)
        assert result.stdout == "42\n"
        assert result.exit_code == 0

    def test_run_python_safety_check_rejected(self):
        """黑名单代码被安全检查拒绝。"""
        ws, _, _ = _make_mock_cloud()
        result = _run(ws.run_python("import os; os.system('ls')"))
        assert result.exit_code == -1
        assert "安全检查" in result.stderr

    def test_run_python_timeout(self):
        """执行超时 → 返回超时错误。"""
        ws, mock_conn, _ = _make_mock_cloud()
        mock_conn.run = AsyncMock(side_effect=TimeoutError())
        result = _run(ws.run_python("while True: pass", timeout=1))
        assert result.exit_code == -1
        assert "超时" in result.stderr

    def test_run_python_cleanup_temp_file(self):
        """执行后清理临时文件。"""
        ws, mock_conn, mock_sftp = _make_mock_cloud()
        mock_conn.run = AsyncMock(return_value=MockSSHResult(stdout="ok"))
        _run(ws.run_python("print('ok')"))
        # 应该尝试删除临时文件
        mock_sftp.remove.assert_called()


# =============================================================================
# CloudWorkspace — test_connection
# =============================================================================


class TestCloudWorkspaceTestConnection:
    """test_connection 测试。"""

    def test_connection_success(self):
        """连接测试成功。"""
        ws, _, mock_sftp = _make_mock_cloud()
        mock_sftp.stat = AsyncMock(return_value=MagicMock())
        success, message, latency = _run(ws.test_connection())
        assert success is True
        assert "成功" in message
        assert latency >= 0

    def test_connection_failure(self):
        """连接测试失败。"""
        ws, _, mock_sftp = _make_mock_cloud()
        ws._conn = None
        ws._reconnect_attempts = 10  # 强制失败
        success, message, latency = _run(ws.test_connection())
        assert success is False
        assert "失败" in message


# =============================================================================
# CloudWorkspace — _disconnect / close
# =============================================================================


class TestCloudWorkspaceDisconnect:
    """连接清理测试。"""

    def test_disconnect(self):
        """_disconnect 正确清理 SFTP 和 SSH 连接。"""
        ws, mock_conn, mock_sftp = _make_mock_cloud()
        _run(ws._disconnect())
        mock_sftp.exit.assert_called_once()
        mock_conn.close.assert_called_once()
        assert ws._sftp is None
        assert ws._conn is None

    def test_disconnect_handles_errors(self):
        """_disconnect 出错时不抛异常。"""
        ws, mock_conn, mock_sftp = _make_mock_cloud()
        mock_sftp.exit.side_effect = Exception("SFTP error")
        mock_conn.close.side_effect = Exception("Conn error")
        # 不应抛异常
        _run(ws._disconnect())
        assert ws._sftp is None
        assert ws._conn is None

    def test_close_alias(self):
        """close() 是 _disconnect 的别名。"""
        ws, mock_conn, mock_sftp = _make_mock_cloud()
        _run(ws.close())
        assert ws._conn is None


# =============================================================================
# CloudWorkspace — location_description
# =============================================================================


class TestCloudWorkspaceMisc:
    """其他杂项测试。"""

    def test_location_description(self):
        """location_description 返回 '云端: user@host:path' 格式。"""
        ws, _, _ = _make_mock_cloud()
        desc = ws.location_description
        assert desc.startswith("云端:")
        assert "testuser" in desc
        assert "test-host" in desc

    def test_remote_path_construction(self):
        """_remote_path 正确拼接远程路径。"""
        ws, _, _ = _make_mock_cloud()
        result = ws._remote_path("subdir/file.txt")
        assert result == "/data/workspace/subdir/file.txt"

    def test_remote_path_strips_leading_slash(self):
        """_remote_path 清理前导斜杠。"""
        ws, _, _ = _make_mock_cloud()
        result = ws._remote_path("/subdir/file.txt")
        assert result == "/data/workspace/subdir/file.txt"


# =============================================================================
# 真实 SSH 连接测试（需要本机 OpenSSH Server 运行）
# =============================================================================

import os
import tempfile
from pathlib import Path


def _ssh_available() -> bool:
    """检查本机 SSH 服务是否可用。"""
    import subprocess
    try:
        result = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=3", "localhost", "echo", "OK"],
            capture_output=True, text=True, timeout=10,
        )
        return result.returncode == 0 and "OK" in result.stdout
    except Exception:
        return False


# 如果 SSH 可用，获取用户密钥路径
_SSH_AVAILABLE = _ssh_available()
_USER = os.environ.get("USERNAME", os.environ.get("USER", ""))
_KEY_PATH = Path.home() / ".ssh" / "id_ed25519"


def _make_real_cloud(tmp_dir: str) -> CloudWorkspace:
    """创建连接 localhost 的 CloudWorkspace。"""
    key_content = _KEY_PATH.read_text(encoding="utf-8")
    return CloudWorkspace(
        host="localhost",
        port=22,
        user=_USER,
        key=key_content,
        path=tmp_dir,
    )


@pytest.mark.skipif(not _SSH_AVAILABLE, reason="SSH 服务不可用")
@pytest.mark.skip(reason="asyncssh 与 Python 3.14/Windows 存在兼容性问题")
class TestCloudWorkspaceRealSSH:
    """真实 SSH 连接测试 — 连接 localhost。"""

    def test_connect_and_write(self, tmp_path):
        """真实 SSH 连接并写入文件。"""
        remote_dir = f"/tmp/test_workspace_{os.getpid()}"
        ws = _make_real_cloud(remote_dir)
        try:
            _run(ws._ensure_connected())
            result = _run(ws.write_file("hello.txt", "Hello from SSH!"))
            assert result.endswith("hello.txt")
        finally:
            _run(ws.close())

    def test_write_read_roundtrip(self, tmp_path):
        """写入后读取，内容一致。"""
        remote_dir = f"/tmp/test_workspace_{os.getpid()}"
        ws = _make_real_cloud(remote_dir)
        try:
            _run(ws._ensure_connected())
            content = "测试内容 🚀"
            _run(ws.write_file("test.txt", content))
            read_back = _run(ws.read_file("test.txt"))
            assert read_back == content
        finally:
            _run(ws.close())

    def test_exists_and_delete(self, tmp_path):
        """exists 和 delete 操作。"""
        remote_dir = f"/tmp/test_workspace_{os.getpid()}"
        ws = _make_real_cloud(remote_dir)
        try:
            _run(ws._ensure_connected())
            _run(ws.write_file("temp.txt", "temp"))
            assert _run(ws.exists("temp.txt")) is True
            _run(ws.delete_file("temp.txt"))
            assert _run(ws.exists("temp.txt")) is False
        finally:
            _run(ws.close())

    def test_run_python_remote(self, tmp_path):
        """远程执行 Python 代码。"""
        remote_dir = f"/tmp/test_workspace_{os.getpid()}"
        ws = _make_real_cloud(remote_dir)
        try:
            _run(ws._ensure_connected())
            result = _run(ws.run_python("print(2 + 3)"))
            assert result.exit_code == 0
            assert "5" in result.stdout
        finally:
            _run(ws.close())

    def test_test_connection(self, tmp_path):
        """test_connection 方法返回成功。"""
        remote_dir = f"/tmp/test_workspace_{os.getpid()}"
        ws = _make_real_cloud(remote_dir)
        try:
            success, message, latency = _run(ws.test_connection())
            # 可能目录不存在但连接成功
            assert "连接" in message
        finally:
            _run(ws.close())
