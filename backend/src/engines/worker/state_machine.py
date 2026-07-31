"""
Worker 状态机 — Agent 生命周期和状态转换的显式建模。

设计约束:
  - Agent 在 Worker 中的生命周期有且仅有 N 个状态。
  - 状态转换有且仅有 M 条路径，每条标注触发条件。
  - 错误恢复有明确的 fallback 状态。
  - 写代码时不猜——查状态机图。

状态机图 (Mermaid):
```mermaid
stateDiagram-v2
    [*] --> IDLE
    IDLE --> PLANNING : execute(task)
    PLANNING --> DECIDING : plan_ready
    DECIDING --> EXECUTING : agent_chooses("tool_call")
    DECIDING --> DONE : agent_chooses("done")
    EXECUTING --> REFLECTING : tool_success | tool_error
    REFLECTING --> DECIDING : next_action="continue"
    REFLECTING --> PLANNING : next_action="revise"
    REFLECTING --> DONE : next_action="done" | step>=MAX_STEPS
    DECIDING --> ERROR : fatal_error
    EXECUTING --> ERROR : fatal_error
    REFLECTING --> ERROR : fatal_error
    PLANNING --> ERROR : fatal_error
    ERROR --> DONE : (终止)
    [*] --> DONE : cancel(任何状态)
```
"""

from enum import Enum, auto
from dataclasses import dataclass, field
from typing import Optional, Callable


# =============================================================================
# 状态定义
# =============================================================================


class WorkerState(Enum):
    """Worker 状态机的 6 个状态。"""
    IDLE = "idle"             # 等待任务
    PLANNING = "planning"     # 制定执行计划
    DECIDING = "deciding"     # 决策下一步做什么
    EXECUTING = "executing"   # 执行工具调用
    REFLECTING = "reflecting" # 反思上一步结果
    DONE = "done"             # 任务完成
    ERROR = "error"           # 错误状态


# =============================================================================
# 状态转换定义
# =============================================================================


@dataclass
class StateTransition:
    """一条状态转换规则。"""
    from_state: WorkerState
    to_state: WorkerState
    event: str                # 触发事件名称
    condition: str            # 附加条件描述（人类可读）


# 精确的状态转换表——Phase 23 实现时直接引用
STATE_TRANSITIONS: list[StateTransition] = [
    # ── 正常流程 ──
    StateTransition(WorkerState.IDLE,      WorkerState.PLANNING,   "execute(task)",        "task 非空"),
    StateTransition(WorkerState.PLANNING,  WorkerState.DECIDING,   "plan_ready",           "plan.steps 非空"),
    StateTransition(WorkerState.DECIDING,  WorkerState.EXECUTING,  "agent_chooses",        "decision='tool_call' 且 tool_name 在注册表中"),
    StateTransition(WorkerState.DECIDING,  WorkerState.DONE,       "agent_chooses",        "decision='done'"),
    StateTransition(WorkerState.EXECUTING, WorkerState.REFLECTING, "tool_success",         "返回值可解析"),
    StateTransition(WorkerState.EXECUTING, WorkerState.REFLECTING, "tool_error",           "超时/权限/网络错误"),
    StateTransition(WorkerState.EXECUTING, WorkerState.ERROR,      "fatal_error",          "不可恢复的错误（磁盘满等）"),

    # ── 反思后分支 ──
    StateTransition(WorkerState.REFLECTING, WorkerState.DECIDING,  "next_action='continue'", "step < MAX_STEPS"),
    StateTransition(WorkerState.REFLECTING, WorkerState.PLANNING,  "next_action='revise'",   "step < MAX_STEPS"),
    StateTransition(WorkerState.REFLECTING, WorkerState.DONE,      "next_action='done'",     "—"),
    StateTransition(WorkerState.REFLECTING, WorkerState.DONE,      "step >= MAX_STEPS",      "强制终止"),

    # ── 错误传播 ──
    StateTransition(WorkerState.PLANNING,   WorkerState.ERROR, "fatal_error", "LLM API 连续失败"),
    StateTransition(WorkerState.DECIDING,   WorkerState.ERROR, "fatal_error", "JSON 解析连续失败"),
    StateTransition(WorkerState.EXECUTING,  WorkerState.ERROR, "fatal_error", "沙盒崩溃"),
    StateTransition(WorkerState.REFLECTING, WorkerState.ERROR, "fatal_error", "LLM API 连续失败"),

    # ── 用户取消 ──
    StateTransition(WorkerState.IDLE,       WorkerState.DONE,  "cancel", "用户取消（未开始的任务）"),
    StateTransition(WorkerState.PLANNING,   WorkerState.DONE,  "cancel", "用户取消"),
    StateTransition(WorkerState.DECIDING,   WorkerState.DONE,  "cancel", "用户取消"),
    StateTransition(WorkerState.EXECUTING,  WorkerState.DONE,  "cancel", "用户取消"),
    StateTransition(WorkerState.REFLECTING, WorkerState.DONE,  "cancel", "用户取消"),
]


# =============================================================================
# 状态查询辅助
# =============================================================================


def is_terminal(state: WorkerState) -> bool:
    """是否是终止状态。"""
    return state in (WorkerState.DONE, WorkerState.ERROR)


def is_active(state: WorkerState) -> bool:
    """是否是活跃状态（Worker 还在运行）。"""
    return state not in (WorkerState.IDLE, WorkerState.DONE, WorkerState.ERROR)


def can_transition(from_state: WorkerState, event: str) -> Optional[WorkerState]:
    """查询从某个状态通过某个事件可以转换到什么状态。

    Returns:
        目标状态，如果事件无效则返回 None
    """
    for t in STATE_TRANSITIONS:
        if t.from_state == from_state and t.event == event:
            return t.to_state
    return None


# =============================================================================
# 错误恢复策略
# =============================================================================


class ErrorLevel(Enum):
    """错误严重级别。"""
    RETRYABLE = "retryable"   # Level 1: 自动重试 1 次
    SKIPPABLE = "skippable"   # Level 2: Agent 自己决定
    FATAL = "fatal"           # Level 3: 立即终止 Worker


@dataclass
class ErrorStrategy:
    """错误处理策略。"""
    error_type: str
    level: ErrorLevel
    description: str
    recovery_action: str      # 人类可读的恢复动作


ERROR_STRATEGIES: list[ErrorStrategy] = [
    # ── Level 1: 可重试（自动重试 1 次）──
    ErrorStrategy(
        error_type="web_search_timeout",
        level=ErrorLevel.RETRYABLE,
        description="web_search 网络超时",
        recovery_action="等 2s → 自动重试 1 次 → 仍失败则降级为 skippable",
    ),
    ErrorStrategy(
        error_type="run_python_timeout",
        level=ErrorLevel.RETRYABLE,
        description="run_python 超时",
        recovery_action="提示 Agent 简化代码 → 自动重试 → 仍失败则降级为 skippable",
    ),
    ErrorStrategy(
        error_type="llm_api_timeout",
        level=ErrorLevel.RETRYABLE,
        description="LLM API 单次超时",
        recovery_action="等 3s → 自动重试 1 次 → 仍失败则致命",
    ),

    # ── Level 2: 可跳过（Agent 自己决定）──
    ErrorStrategy(
        error_type="search_no_results",
        level=ErrorLevel.SKIPPABLE,
        description="搜索无结果",
        recovery_action="Agent 决定: 换关键词重试 / 跳过此步",
    ),
    ErrorStrategy(
        error_type="file_not_found",
        level=ErrorLevel.SKIPPABLE,
        description="文件读取失败（不存在）",
        recovery_action="Agent 决定: 先创建文件 / 跳过此步",
    ),
    ErrorStrategy(
        error_type="tool_unexpected_output",
        level=ErrorLevel.SKIPPABLE,
        description="工具返回意外格式",
        recovery_action="Agent 决定: 用其他工具代替 / 重试",
    ),

    # ── Level 3: 致命（立即终止 Worker）──
    ErrorStrategy(
        error_type="llm_api_failure",
        level=ErrorLevel.FATAL,
        description="LLM API 连续 3 次失败",
        recovery_action="立即终止 Worker，通知用户",
    ),
    ErrorStrategy(
        error_type="disk_full",
        level=ErrorLevel.FATAL,
        description="磁盘空间不足",
        recovery_action="立即终止 Worker，提示用户清理空间",
    ),
    ErrorStrategy(
        error_type="ssh_disconnected",
        level=ErrorLevel.FATAL,
        description="SSH 连接断开且无法重连",
        recovery_action="立即终止 Worker，标记云端工作区状态",
    ),
    ErrorStrategy(
        error_type="json_parse_failure",
        level=ErrorLevel.FATAL,
        description="Agent JSON 格式输出连续 2 次解析失败",
        recovery_action="立即终止 Worker，记录 Agent 原始输出用于调试",
    ),
]


def get_error_strategy(error_type: str) -> Optional[ErrorStrategy]:
    """根据错误类型获取恢复策略。"""
    for s in ERROR_STRATEGIES:
        if s.error_type == error_type:
            return s
    # 未知错误 → 视为致命
    return ErrorStrategy(
        error_type=error_type,
        level=ErrorLevel.FATAL,
        description="未知错误类型",
        recovery_action="终止 Worker（保守策略）",
    )


# =============================================================================
# Workspace 生命周期
# =============================================================================

# 创建 → 活跃 → 完成/取消/错误 → 保留 → 清理
#
# 创建 Worker
#   → workspace_root = {base_dir}/{run_id}/
#   → 子目录: files/  .tasks/  .logs/
#
# Worker 运行中
#   → 所有 write_file 写入 files/
#   → 文件锁放在 files/
#   → Agent 决策日志写入 .logs/decision_log.jsonl
#
# Worker 完成/取消/错误
#   → 保留 workspace（用户可下载产物）
#   → 7 天后自动清理（定时任务）
#   → 用户可主动删除: DELETE /api/workers/{run_id}

# 配置常量（Phase 23 实现时引用）
MAX_STEPS = 20                     # Agent 最大步数
MAX_PARSE_RETRIES = 2              # JSON 解析最大重试次数
MAX_LLM_RETRIES = 3                # LLM API 最大重试次数
WORKSPACE_CLEANUP_DAYS = 7         # 工作区自动清理天数
WORKSPACE_SUBDIRS = ["files", ".tasks", ".logs"]  # 工作区子目录


# =============================================================================
# 管道状态机（预设计，Phase 25 用）
# =============================================================================
#
# Pipeline = DAG(PipelineNode)
#
# 每个 Node 状态:
#   PENDING → RUNNING → COMPLETE
#                    → ERROR
#                    → CANCELLED
#
# 管道执行规则:
#   1. 拓扑排序 → 按层级执行
#   2. 同一层级的节点并行（最多 3 个并发）
#   3. 某节点 ERROR → 依赖它的下游节点全部 SKIPPED
#   4. 不依赖该节点的同层节点继续执行
#
# 节点状态转换:
#   PENDING
#     → RUNNING   (所有依赖节点均为 COMPLETE 状态)
#     → SKIPPED   (至少一个依赖节点为 ERROR 状态)
#   RUNNING
#     → COMPLETE  (Worker 正常完成)
#     → ERROR     (Worker 异常终止)
#     → CANCELLED (用户取消)
