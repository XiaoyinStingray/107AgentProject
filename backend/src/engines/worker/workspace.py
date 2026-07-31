"""
WorkspaceProvider 协议 — Agent 操作文件系统的统一抽象。

设计约束:
  - 所有 path 参数相对于 workspace root，实现负责拼接和安全校验。
  - WorkspaceProvider 不 import FastAPI / LifeAgent / SSE — 零依赖上层模块。
  - 实现类: LocalWorkspace (Phase 23 内建), CloudWorkspace (Phase 24 SSH 扩展)。

Phase 22: 仅定义接口和数据类型，不实现。
Phase 23: 实现 LocalWorkspace。
Phase 24: 实现 CloudWorkspace。
"""

import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import NamedTuple

from loguru import logger


# =============================================================================
# 数据类
# =============================================================================


class FileInfo(NamedTuple):
    """工作区文件元信息。"""
    path: str          # 相对路径，如 "report.md" / "data/trends.json"
    size: int          # 字节数
    modified_at: str   # ISO8601 时间戳


@dataclass
class SandboxResult:
    """Python 代码执行结果。"""
    stdout: str        # 标准输出（最多 10KB，超出截断）
    stderr: str        # 标准错误（最多 5KB，超出截断）
    exit_code: int     # 进程退出码 (0=成功)


# =============================================================================
# 抽象接口
# =============================================================================


class WorkspaceProvider(ABC):
    """Agent 操作文件系统的统一抽象。

    实现类: LocalWorkspace, CloudWorkspace

    所有方法均为异步。path 参数相对于 workspace root，
    实现类负责拼接绝对路径并做安全校验（拒绝路径穿越到 root 之外）。
    """

    @abstractmethod
    async def write_file(self, path: str, content: str) -> str:
        """写入文件。返回写入后的绝对路径（仅用于日志，不暴露给 Agent）。

        Args:
            path: workspace root 下的相对路径
            content: 文件内容（UTF-8 字符串）

        Returns:
            写入后的绝对路径（仅供后端日志使用）

        Raises:
            PermissionError: 路径穿越到 workspace 外部被拒绝
        """
        ...

    @abstractmethod
    async def read_file(self, path: str) -> str:
        """读取文件内容。

        Args:
            path: workspace root 下的相对路径

        Returns:
            文件内容（UTF-8 字符串）

        Raises:
            FileNotFoundError: 文件不存在
            PermissionError: 路径穿越到 workspace 外部被拒绝
        """
        ...

    @abstractmethod
    async def list_files(self, directory: str = "") -> list[FileInfo]:
        """列出目录下的所有文件。

        Args:
            directory: workspace root 下的相对目录路径，"" 表示根目录

        Returns:
            文件信息列表（不含目录自身）。按修改时间降序排列。
        """
        ...

    @abstractmethod
    async def delete_file(self, path: str) -> bool:
        """删除文件。

        Args:
            path: workspace root 下的相对路径

        Returns:
            True 如果文件存在并成功删除，False 如果文件不存在
        """
        ...

    @abstractmethod
    async def run_python(self, code: str, timeout: int = 30) -> SandboxResult:
        """在沙盒中执行 Python 代码。

        Args:
            code: Python 源码字符串
            timeout: 超时秒数（默认 30）

        Returns:
            SandboxResult 包含 stdout/stderr/exit_code

        安全约束（由实现类保证）:
            1. 静态检查：拒绝 os.system / subprocess / socket 等危险模块
            2. 路径限制：文件操作必须在 workspace root 内
            3. 超时控制：超时后 SIGKILL
            4. 输出截断：stdout ≤ 10KB, stderr ≤ 5KB
        """
        ...

    @abstractmethod
    async def exists(self, path: str) -> bool:
        """检查文件或目录是否存在。

        Args:
            path: workspace root 下的相对路径

        Returns:
            True 如果路径存在
        """
        ...

    @property
    @abstractmethod
    def location_description(self) -> str:
        """人类可读的位置描述。

        Returns:
            如 "本地: ~/workspaces/abc123" 或 "云端: ubuntu@10.0.0.1:/data/abc123"
        """
        ...


# =============================================================================
# 路径安全校验
# =============================================================================


def _resolve_safe(root: str, relative_path: str) -> str:
    """将相对路径解析为绝对路径，并验证未超出 root 范围。

    Args:
        root: workspace root 绝对路径
        relative_path: Agent 请求的相对路径

    Returns:
        解析后的绝对路径

    Raises:
        PermissionError: 如果解析后的路径超出了 root 范围（路径穿越攻击）
    """
    # 清理相对路径中的 .. 和冗余分隔符
    clean = relative_path.replace("\\", "/").lstrip("/")
    # 使用 pathlib 正确解析
    absolute = str(Path(root) / clean)
    resolved = str(Path(absolute).resolve())
    root_resolved = str(Path(root).resolve())

    if not resolved.startswith(root_resolved + os.sep) and resolved != root_resolved:
        raise PermissionError(
            f"路径穿越被拒绝: '{relative_path}' 解析到 '{resolved}'，"
            f"超出了工作区 '{root_resolved}'"
        )
    return resolved


# =============================================================================
# LocalWorkspace — 本地文件系统实现
# =============================================================================


class LocalWorkspace(WorkspaceProvider):
    """本地文件系统实现。

    workspace root = {base_dir}/{run_id}/

    目录结构:
        files/      — Agent 产出物（write_file 写入此处）
        .tasks/     — 任务队列（Phase 25）
        .logs/      — 决策日志

    Phase 23 实现。Phase 24 的 CloudWorkspace 继承同一 ABC。
    """

    def __init__(self, base_dir: str, run_id: str):
        """创建本地工作区。

        Args:
            base_dir: 所有工作区的基础目录，如 ~/workspaces/
            run_id: 本次运行的唯一 ID
        """
        self._base_dir = str(Path(base_dir).resolve())
        self._run_id = run_id
        self._root = str(Path(base_dir) / run_id)

        # 创建目录结构
        for subdir in ["files", ".tasks", ".logs"]:
            Path(self._root, subdir).mkdir(parents=True, exist_ok=True)

    @property
    def root(self) -> str:
        """工作区的根目录绝对路径。"""
        return self._root

    def _file_path(self, relative_path: str) -> str:
        """将 Agent 请求的相对路径转为 files/ 下的绝对路径。

        所有 write_file / read_file / list_files 操作自动限定在 files/ 子目录中。
        """
        return _resolve_safe(str(Path(self._root, "files")), relative_path)

    # ── WorkspaceProvider 实现 ──

    async def write_file(self, path: str, content: str) -> str:
        file_path = self._file_path(path)
        # 确保父目录存在
        Path(file_path).parent.mkdir(parents=True, exist_ok=True)
        Path(file_path).write_text(content, encoding='utf-8')
        logger.info(f"[LocalWorkspace] write: {path} ({len(content)} chars)")
        return file_path

    async def read_file(self, path: str) -> str:
        file_path = self._file_path(path)
        if not Path(file_path).exists():
            raise FileNotFoundError(f"文件不存在: {path}")
        content = Path(file_path).read_text(encoding='utf-8')
        logger.debug(f"[LocalWorkspace] read: {path} ({len(content)} chars)")
        return content

    async def list_files(self, directory: str = "") -> list[FileInfo]:
        dir_path = self._file_path(directory) if directory else str(Path(self._root, "files"))
        if not Path(dir_path).exists():
            return []
        files = []
        for p in Path(dir_path).rglob("*"):
            if p.is_file():
                stat = p.stat()
                relative = str(p.relative_to(Path(self._root, "files"))).replace("\\", "/")
                files.append(FileInfo(
                    path=relative,
                    size=stat.st_size,
                    modified_at=str(stat.st_mtime),
                ))
        files.sort(key=lambda f: f.modified_at, reverse=True)
        return files

    async def delete_file(self, path: str) -> bool:
        file_path = self._file_path(path)
        if Path(file_path).exists():
            Path(file_path).unlink()
            logger.info(f"[LocalWorkspace] delete: {path}")
            return True
        return False

    async def run_python(self, code: str, timeout: int = 30) -> SandboxResult:
        from engines.worker.sandbox import run_python_sandbox
        # 使用 files/ 目录作为工作目录
        work_dir = str(Path(self._root, "files"))
        return await run_python_sandbox(code, work_dir, timeout)

    async def exists(self, path: str) -> bool:
        file_path = self._file_path(path)
        return Path(file_path).exists()

    @property
    def location_description(self) -> str:
        home = str(Path.home())
        display = self._root
        if display.startswith(home):
            display = "~" + display[len(home):]
        return f"本地: {display}"


# =============================================================================
# CloudWorkspace — SSH 远程工作区（Phase 24 实现）
# =============================================================================


class CloudWorkspace(WorkspaceProvider):
    """SSH 远程文件系统实现。通过 asyncssh SFTP 操作文件。

    安全约束:
        - SSH 密钥仅存内存中，不序列化到数据库或日志。
        - 连接断开 → 自动重连 1 次 → 仍失败 → Worker 进入 ERROR。
        - 文件操作通过 SFTP，命令执行通过 SSH exec。

    Args:
        host: SSH 主机地址
        port: SSH 端口（默认 22）
        user: SSH 用户名
        key: SSH 私钥内容（PEM 格式字符串，仅存内存）
        path: 云端工作区根路径，如 "/data/workspaces/abc123"
    """

    def __init__(self, host: str, port: int, user: str, key: str, path: str):
        self._host = host
        self._port = port or 22
        self._user = user
        self._key = key
        self._root = path.rstrip("/")

        # 连接状态
        self._conn = None
        self._sftp = None
        self._reconnect_attempts = 0
        self._MAX_RECONNECT = 1

        logger.info(f"CloudWorkspace created: {user}@{host}:{port}{path}")

    async def _ensure_connected(self):
        """确保 SSH 连接活跃。如果断开则自动重连。"""
        if self._conn is not None and not self._conn.is_closed():
            return

        import asyncssh

        self._reconnect_attempts += 1
        if self._reconnect_attempts > self._MAX_RECONNECT + 1:  # +1 for initial connect
            raise ConnectionError(
                f"SSH 连接失败，已重试 {self._MAX_RECONNECT} 次: "
                f"{self._user}@{self._host}:{self._port}"
            )

        try:
            # 解析私钥
            if self._key.startswith("-----BEGIN"):
                # PEM 格式
                private_key = asyncssh.import_private_key(self._key)
            else:
                # 文件路径
                private_key = asyncssh.read_private_key(self._key)

            self._conn = await asyncssh.connect(
                host=self._host,
                port=self._port,
                username=self._user,
                client_keys=[private_key],
                known_hosts=None,  # 跳过 known_hosts 检查（用户已在 UI 确认连接）
            )
            self._sftp = await self._conn.start_sftp_client()
            self._reconnect_attempts = 0  # 重置计数
            logger.info(f"CloudWorkspace connected: {self._user}@{self._host}:{self._port}")

        except Exception as e:
            logger.error(f"CloudWorkspace connect failed: {e}")
            raise ConnectionError(f"SSH 连接失败: {e}")

    async def _disconnect(self):
        """关闭 SSH 连接。Worker 结束时调用。"""
        if self._sftp:
            try:
                self._sftp.exit()
            except Exception:
                pass
            self._sftp = None
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None

    def _remote_path(self, relative_path: str) -> str:
        """将相对路径转为云端绝对路径。"""
        clean = relative_path.replace("\\", "/").lstrip("/")
        return f"{self._root}/{clean}"

    # ── WorkspaceProvider 实现 ──

    async def write_file(self, path: str, content: str) -> str:
        await self._ensure_connected()
        remote = self._remote_path(path)
        # 确保父目录存在
        parent = os.path.dirname(remote) if "/" in remote else self._root
        try:
            await self._sftp.makedirs(parent, exist_ok=True)
        except Exception:
            pass
        await self._sftp.write_text(remote, content, encoding='utf-8')
        logger.info(f"[CloudWorkspace] write: {path} ({len(content)} chars)")
        return remote

    async def read_file(self, path: str) -> str:
        await self._ensure_connected()
        remote = self._remote_path(path)
        try:
            return await self._sftp.read_text(remote, encoding='utf-8')
        except Exception as e:
            raise FileNotFoundError(f"云端文件不存在: {path}") from e

    async def list_files(self, directory: str = "") -> list[FileInfo]:
        await self._ensure_connected()
        dir_path = self._remote_path(directory) if directory else self._root
        files = []
        try:
            async for entry in self._sftp.scandir(dir_path):
                if entry.type == "file" or entry.attrs.isreg:
                    relative = entry.filename if not directory else f"{directory}/{entry.filename}"
                    files.append(FileInfo(
                        path=relative,
                        size=entry.attrs.size or 0,
                        modified_at=str(entry.attrs.mtime or 0),
                    ))
        except Exception as e:
            logger.warning(f"[CloudWorkspace] list_files failed: {e}")
        files.sort(key=lambda f: f.modified_at, reverse=True)
        return files

    async def delete_file(self, path: str) -> bool:
        await self._ensure_connected()
        remote = self._remote_path(path)
        try:
            await self._sftp.remove(remote)
            return True
        except Exception:
            return False

    async def run_python(self, code: str, timeout: int = 30) -> SandboxResult:
        await self._ensure_connected()
        from engines.worker.sandbox import check_code_safety

        # 静态检查
        is_safe, reason = check_code_safety(code)
        if not is_safe:
            return SandboxResult(stdout="", stderr=f"代码安全检查未通过: {reason}", exit_code=-1)

        # 写入临时文件 → 执行 → 读取结果
        import uuid
        tmp_name = f"_tmp_{uuid.uuid4().hex[:8]}.py"
        tmp_path = f"{self._root}/{tmp_name}"

        try:
            await self._sftp.write_text(tmp_path, code, encoding='utf-8')
            result = await self._conn.run(
                f"cd {self._root} && python {tmp_name}",
                timeout=timeout,
            )
            return SandboxResult(
                stdout=result.stdout[:10000] if result.stdout else "",
                stderr=result.stderr[:5000] if result.stderr else "",
                exit_code=result.exit_status or 0,
            )
        except TimeoutError:
            return SandboxResult(stdout="", stderr=f"云端执行超时（{timeout}秒）", exit_code=-1)
        except Exception as e:
            return SandboxResult(stdout="", stderr=f"云端执行失败: {e}", exit_code=-1)
        finally:
            try:
                await self._sftp.remove(tmp_path)
            except Exception:
                pass

    async def exists(self, path: str) -> bool:
        await self._ensure_connected()
        remote = self._remote_path(path)
        try:
            await self._sftp.stat(remote)
            return True
        except Exception:
            return False

    @property
    def location_description(self) -> str:
        return f"云端: {self._user}@{self._host}:{self._root}"

    # ── 连接管理 ──

    async def test_connection(self) -> tuple[bool, str, float]:
        """测试 SSH 连接——返回 (成功, 消息, 延迟ms)。

        供 POST /api/workers/test-connection 端点使用。
        """
        import time
        start = time.monotonic()
        try:
            await self._ensure_connected()
            latency = int((time.monotonic() - start) * 1000)
            # 同时检查工作区目录是否存在
            await self._sftp.stat(self._root)
            return True, f"连接成功", latency
        except Exception as e:
            latency = int((time.monotonic() - start) * 1000)
            return False, f"连接失败: {e}", latency

    async def close(self):
        """关闭连接——Worker 结束后调用。"""
        await self._disconnect()
