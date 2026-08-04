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

class EdgeType(str, Enum):
    """管道边的类型。"""
    FLOW = "flow"         # 普通数据流（实线）：A 产出文件 → B 读取
    LOOP = "loop"         # 回边（虚线弧线）：质检 FAIL → 回到分析重新来
    BRANCH = "branch"     # 条件分支（点线）：质检 PASS → 跳到发布


@dataclass
class PipelineNodeSpec:
    """管道节点规格——描述管道中的一个步骤。

    Step 104 扩充：role / produces / expects / extra_tools / enabled_tools。
    """
    # ── 基础标识 ──
    id: str                           # 唯一标识（英文，如 "research" / "analyze" / "write"）
    title: str                        # 人类可读的标题
    agent_id: str                     # 执行此节点的 Agent ID

    # ── 任务定义 ──
    task: str                         # 此节点的任务描述（自然语言）
    role: str = "worker"              # 结点角色: analyst / writer / reviewer / executor / worker
    produces: list[str] = field(default_factory=list)    # 本结点承诺产出的文件清单
    expects: list[str] = field(default_factory=list)     # 本结点需要的输入文件清单

    # ── 依赖（过渡期保留，Step 106 后建议用显式 Edge 替代）──
    depends_on: list[str] = field(default_factory=list)
    depends_on_files: list[str] = field(default_factory=list)

    # ── 工具 (Step 105) ──
    extra_tools: list[str] = field(default_factory=list)     # 本结点专属工具名
    enabled_tools: list[str] = field(default_factory=list)   # 精确控制可用工具（空=全部）


@dataclass
class PipelineEdge:
    """管道中的一条有向边，从源节点指向目标节点。

    Step 104 新建：显式边携带控制流信息，取代隐式的 depends_on。
    """
    id: str                           # 边 ID（如 "e_review_loop_analyze"）
    from_node: str                    # 源节点 ID
    to_node: str                      # 目标节点 ID
    edge_type: EdgeType = EdgeType.FLOW

    # ── 条件（Loop 和 Branch 共用）──
    condition: str | None = None      # 触发条件: "FAILED" / "score < 0.7" / "/error/"
    condition_field: str | None = None  # 从哪个文件读取条件值

    # ── Loop 专属 ──
    max_iterations: int = 3           # 最大循环次数
    iteration_label: str = ""         # 循环标签（前端显示用）

    # ── Branch 专属 ──
    priority: int = 0                 # 分支优先级（多条 branch 同时满足 → 选最高的）
    label: str = ""                   # 分支标签（前端显示用，如 "通过" / "驳回"）


@dataclass
class PipelineSpec:
    """管道规格——完整的管道定义。"""
    id: str                           # 管道唯一 ID
    name: str                         # 人类可读的名称
    description: str = ""             # 管道用途描述
    nodes: list[PipelineNodeSpec] = field(default_factory=list)  # 节点列表
    edges: list[PipelineEdge] = field(default_factory=list)      # 边列表 (Step 104)
    status: PipelineStatus = PipelineStatus.DRAFT


# =============================================================================
# 验证函数
# =============================================================================

def validate_pipeline(pipeline: PipelineSpec) -> tuple[bool, str]:
    """验证管道定义是否合法。

    Step 104 更新：同时检查显式 edges 和隐式 depends_on；
    LOOP/BRANCH 边不参与 DAG 检查。

    Returns:
        (is_valid, error_message)
    """
    if not pipeline.nodes:
        return False, "管道至少需要一个节点"

    node_ids = {n.id for n in pipeline.nodes}
    if len(node_ids) != len(pipeline.nodes):
        return False, "节点 ID 不唯一"

    # 检查边引用的节点存在
    for edge in pipeline.edges:
        if edge.from_node not in node_ids:
            return False, f"边 '{edge.id}' 的 from_node '{edge.from_node}' 不存在"
        if edge.to_node not in node_ids:
            return False, f"边 '{edge.id}' 的 to_node '{edge.to_node}' 不存在"

    # 检查 depends_on 引用的节点存在
    for node in pipeline.nodes:
        for dep in node.depends_on:
            if dep not in node_ids:
                return False, f"节点 '{node.id}' 依赖的节点 '{dep}' 不存在"

    # 构建所有 FLOW 依赖关系（显式 FLOW edge + 隐式 depends_on）
    flow_deps: dict[str, set[str]] = {n.id: set() for n in pipeline.nodes}
    for edge in pipeline.edges:
        if edge.edge_type == EdgeType.FLOW:
            flow_deps[edge.to_node].add(edge.from_node)
    for node in pipeline.nodes:
        for dep in node.depends_on:
            flow_deps[node.id].add(dep)

    # 入口节点检查（仅检查 FLOW 依赖）
    has_entry = any(not flow_deps[n.id] for n in pipeline.nodes)
    if not has_entry:
        return False, "管道必须至少有一个入口节点（无 FLOW 依赖）"

    # DAG 循环检测（仅 FLOW 边；LOOP/BRANCH 允许环）
    try:
        _topological_sort(pipeline.nodes, flow_deps)
    except ValueError as e:
        return False, str(e)

    return True, "ok"


def get_flow_deps(nodes: list[PipelineNodeSpec], edges: list[PipelineEdge]) -> dict[str, set[str]]:
    """从显式 Edge + 隐式 depends_on 构建 FLOW 依赖映射。"""
    flow_deps: dict[str, set[str]] = {n.id: set() for n in nodes}
    for edge in edges:
        if edge.edge_type == EdgeType.FLOW:
            flow_deps[edge.to_node].add(edge.from_node)
    for node in nodes:
        for dep in node.depends_on:
            flow_deps[node.id].add(dep)
    return flow_deps


def get_loop_edges(edges: list[PipelineEdge], from_node: str) -> list[PipelineEdge]:
    """获取以指定节点为起点的所有 LOOP 边。"""
    return [e for e in edges if e.edge_type == EdgeType.LOOP and e.from_node == from_node]


def get_branch_edges(edges: list[PipelineEdge], from_node: str) -> list[PipelineEdge]:
    """获取以指定节点为起点的所有 BRANCH 边。"""
    return [e for e in edges if e.edge_type == EdgeType.BRANCH and e.from_node == from_node]


def _topological_sort(
    nodes: list[PipelineNodeSpec],
    deps: dict[str, set[str]] | None = None,
) -> list[list[PipelineNodeSpec]]:
    """拓扑排序 → 按层级分组。

    返回 [[层0节点], [层1节点], ...]
    如果存在循环引用则抛出 ValueError。

    Step 104: 接受可选的 deps 映射（从 get_flow_deps 计算），
    用于使用显式 Edge 的场景。
    """
    node_map = {n.id: n for n in nodes}
    in_degree = {n.id: 0 for n in nodes}

    if deps is None:
        # 兼容旧版：从 depends_on 推断
        deps = {n.id: set(n.depends_on) for n in nodes}

    for nid, dep_ids in deps.items():
        if nid in in_degree:
            in_degree[nid] = len([d for d in dep_ids if d in in_degree])

    levels: list[list[PipelineNodeSpec]] = []
    remaining = set(in_degree.keys())

    while remaining:
        current = [nid for nid in remaining if in_degree[nid] == 0]
        if not current:
            raise ValueError("管道存在循环依赖")
        levels.append([node_map[nid] for nid in current])
        for nid in current:
            remaining.remove(nid)
            # Step 104: 用 deps 映射替代 node.depends_on
            for other_id, other_deps in deps.items():
                if nid in other_deps and other_id in in_degree:
                    in_degree[other_id] -= 1

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
