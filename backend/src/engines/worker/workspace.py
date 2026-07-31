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

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import NamedTuple


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
# 预注册实现（Phase 23 / 24 实现）
# =============================================================================
#
# class LocalWorkspace(WorkspaceProvider):
#     """本地文件系统实现。workspace root = {base_dir}/{run_id}/"""
#     def __init__(self, base_dir: str, run_id: str): ...
#
# class CloudWorkspace(WorkspaceProvider):
#     """SSH 远程文件系统实现。通过 asyncssh SFTP 操作文件。"""
#     def __init__(self, host: str, port: int, user: str, key: str, path: str): ...
