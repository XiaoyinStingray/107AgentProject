"""
管道节点数据模型 — 预设计（Phase 25 使用）。

设计约束:
  - 管道是 DAG——节点 + 有向边。
  - 每个节点是一个 Agent 子任务，有明确的输入/输出文件。
  - 节点间通过文件传递数据，不通过消息通信。
  - 拓扑排序 → 按层级并行执行（同层不超过 3 个并发）。

Phase 22: 定义数据模型和约束，不写任何执行逻辑。
Phase 25: 实现 PipelineEngine + Coordinator。
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


# =============================================================================
# 枚举
# =============================================================================

class NodeStatus(str, Enum):
    """管道节点状态。"""
    PENDING = "pending"        # 等待依赖完成
    RUNNING = "running"        # 正在执行
    COMPLETE = "complete"      # 执行成功
    ERROR = "error"            # 执行失败
    SKIPPED = "skipped"        # 因上游失败被跳过
    CANCELLED = "cancelled"    # 用户取消


class PipelineStatus(str, Enum):
    """管道整体状态。"""
    DRAFT = "draft"            # 编辑中（未运行）
    RUNNING = "running"        # 执行中
    COMPLETE = "complete"      # 全部完成
    PARTIAL = "partial"        # 部分完成（有节点失败）
    CANCELLED = "cancelled"    # 被取消


# =============================================================================
# 数据类
# =============================================================================


@dataclass
class PipelineNodeSpec:
    """管道节点规格——描述管道中的一个步骤。"""
    id: str                           # 唯一标识（英文，如 "research" / "analyze" / "write"）
    title: str                        # 人类可读的标题
    agent_id: str                     # 执行此节点的 Agent ID
    task: str                         # 此节点的任务描述
    depends_on: list[str] = field(default_factory=list)  # 依赖的节点 ID 列表（通过文件传递）
    depends_on_files: list[str] = field(default_factory=list)  # 依赖的文件路径列表（更精确的依赖）


@dataclass
class PipelineSpec:
    """管道规格——完整的管道定义。"""
    id: str                           # 管道唯一 ID
    name: str                         # 人类可读的名称
    description: str = ""             # 管道用途描述
    nodes: list[PipelineNodeSpec] = field(default_factory=list)  # 节点列表
    status: PipelineStatus = PipelineStatus.DRAFT


# =============================================================================
# 验证函数
# =============================================================================

def validate_pipeline(pipeline: PipelineSpec) -> tuple[bool, str]:
    """验证管道定义是否合法。

    检查项:
      1. 节点列表非空
      2. 所有节点 ID 唯一
      3. 所有 depends_on 引用的节点存在
      4. 无循环依赖（DAG）
      5. 至少有一个没有依赖的入口节点

    Returns:
        (is_valid, error_message)
    """
    if not pipeline.nodes:
        return False, "管道至少需要一个节点"

    node_ids = {n.id for n in pipeline.nodes}
    if len(node_ids) != len(pipeline.nodes):
        return False, "节点 ID 不唯一"

    for node in pipeline.nodes:
        for dep in node.depends_on:
            if dep not in node_ids:
                return False, f"节点 '{node.id}' 依赖的节点 '{dep}' 不存在"

    # 入口节点检查
    has_entry = any(not n.depends_on for n in pipeline.nodes)
    if not has_entry:
        return False, "管道必须至少有一个入口节点（无依赖）"

    # 循环检测: 拓扑排序
    try:
        _topological_sort(pipeline.nodes)
    except ValueError as e:
        return False, str(e)

    return True, "ok"


def _topological_sort(nodes: list[PipelineNodeSpec]) -> list[list[PipelineNodeSpec]]:
    """拓扑排序 → 按层级分组。

    返回 [[层0节点], [层1节点], ...]
    如果存在循环引用则抛出 ValueError。
    """
    node_map = {n.id: n for n in nodes}
    in_degree = {n.id: 0 for n in nodes}
    for n in nodes:
        for dep in n.depends_on:
            if dep in in_degree:
                in_degree[n.id] += 1

    levels: list[list[PipelineNodeSpec]] = []
    remaining = set(in_degree.keys())

    while remaining:
        current = [nid for nid in remaining if in_degree[nid] == 0]
        if not current:
            raise ValueError("管道存在循环依赖")
        levels.append([node_map[nid] for nid in current])
        for nid in current:
            remaining.remove(nid)
            for node in nodes:
                if nid in node.depends_on:
                    in_degree[node.id] -= 1

    return levels


# =============================================================================
# 文件锁协议（预设计）
# =============================================================================
#
# Agent 之间通过文件系统协调，不通过消息队列。
# 这是 Worker 模式的核心设计决策——文件就是接口。
#
# 锁协议:
#   Agent A 要写 report.md:
#     1. 创建 report.md.lock（空文件，标记占用，原子操作 O_EXCL）
#     2. 写入 report.md 内容
#     3. 删除 report.md.lock
#
#   Agent B 要读 report.md:
#     1. 检查 report.md.lock 是否存在 → 存在则等待（最多 30s，每秒轮询）
#     2. 读取 report.md
#
# 任务队列 (workspace 中的 .tasks/ 目录):
#   .tasks/pending/    → 待处理任务文件（JSON）
#   .tasks/claimed/    → 已被 Agent 认领
#   .tasks/done/       → 已完成
#
# 任务 JSON 格式:
#   {
#     "id": "task-001",
#     "title": "搜索 AI Agent 框架",
#     "agent_id": "abc123",
#     "depends_on": ["task-000"],  // 依赖的任务 ID
#     "created_at": "ISO8601"
#   }
