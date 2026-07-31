"""
Worker SSE 事件 Schema — 所有 SSE 事件的定义和数据类。

设计约束:
  - 所有事件遵循统一信封:
      {"type": "<WorkerEventType>", "data": {...}, "timestamp": "ISO8601"}
  - Phase 22 定义 Schema，Phase 23 实现事件生成。
  - 每种事件类型的 data 字段精确到字段名和类型。实现时不得增减字段。
  - 前端按 type 字段路由到不同的渲染逻辑。

事件流向:
    后端 AgentWorker → SSE async generator → FastAPI StreamingResponse → 前端 EventSource

对应 TS 类型（前端使用）:
    type WorkerEventType = ...  // 见下方 Literal 联合类型
    type WorkerEvent = {
      type: WorkerEventType;
      data: Record<string, unknown>;
      timestamp: string;
    }
"""

from dataclasses import dataclass, field
from typing import Literal


# =============================================================================
# 事件类型枚举
# =============================================================================

WorkerEventType = Literal[
    "worker.started",        # Worker 启动 → 显示任务标题
    "worker.plan",           # Agent 制定计划 → 显示步骤列表
    "worker.step_decision",  # Agent 决策 → 显示"Agent 正在思考..."
    "worker.tool_start",     # 工具开始执行 → 显示"正在搜索/正在写入..."
    "worker.tool_result",    # 工具执行结果 → 显示结果卡片/摘要
    "worker.reflection",     # Agent 反思 → 显示"Agent 评估结果..."
    "worker.file_updated",   # 文件变更 → 文件面板更新
    "worker.done",           # Agent 判断完成 → 显示完成状态 + 下载按钮
    "worker.error",          # 错误 → 红色高亮显示
    "worker.summary",        # 最终汇总 → 显示自评 + 关键发现
    "worker.thought",        # Agent 自由思考（调试用，不在终端显示但记录在日志中）
]


# =============================================================================
# 事件 data 数据类
# =============================================================================


@dataclass
class WorkerStartedData:
    """worker.started — Worker 启动，Agent 开始工作。"""
    run_id: str              # 本次运行的唯一 ID
    agent_name: str          # Agent 显示名
    task: str                # 用户任务原文
    workspace: str           # 工作区位置描述 (来自 WorkspaceProvider.location_description)


@dataclass
class PlanStep:
    """计划步骤。"""
    title: str               # 步骤标题，如 "搜索 AI Agent 框架资料"
    estimated_tools: list[str]  # 预计使用的工具列表，如 ["web_search"]


@dataclass
class WorkerPlanData:
    """worker.plan — Agent 制定的执行计划。"""
    steps: list[PlanStep]    # 计划步骤列表
    total_steps: int         # 步骤总数
    strategy: str = ""       # Agent 的整体策略简述


@dataclass
class WorkerStepDecisionData:
    """worker.step_decision — Agent 的每步决策。"""
    step_index: int          # 当前步骤编号 (1-based)
    action: Literal["tool_call", "deliverable", "done"]
    reason: str              # 为什么做这个决定（一句话）


@dataclass
class WorkerToolStartData:
    """worker.tool_start — 工具开始执行。"""
    step_index: int          # 当前步骤编号
    tool_name: str           # 工具名: web_search | run_python | write_file | read_file | list_files
    args_summary: str        # 参数摘要（不暴露敏感信息，≤100 字符）


@dataclass
class WorkerToolResultData:
    """worker.tool_result — 工具执行结果。"""
    step_index: int          # 当前步骤编号
    tool_name: str           # 工具名
    result_summary: str      # 结果摘要（≤200 字符）
    result_detail: str       # 完整结果（用于折叠展开，后端截断到 2KB）
    duration_ms: int         # 执行耗时（毫秒）
    success: bool            # 是否成功


@dataclass
class WorkerReflectionData:
    """worker.reflection — Agent 对上一步结果的反思评估。"""
    step_index: int          # 当前步骤编号
    satisfied: bool          # 对上一步结果是否满意
    plan_changed: bool       # 是否需要调整后续计划
    thought: str             # 反思内容（自由文本，≤500 字符）
    next_action: Literal["continue", "revise", "done"]


@dataclass
class WorkerFileUpdatedData:
    """worker.file_updated — 工作区文件变更通知。"""
    step_index: int | None   # 当前步骤编号（可能为 None）
    files: list[dict]        # [{path: str, size: int}] 变更的文件列表


@dataclass
class WorkerDoneData:
    """worker.done — Agent 判断任务完成。"""
    reason: str              # 完成原因
    total_steps: int         # 总共执行的步数
    files: list[str]         # 产出物文件路径列表


@dataclass
class WorkerErrorData:
    """worker.error — 执行过程中发生错误。"""
    step_index: int | None   # 发生错误的步骤（可能为 None）
    error_type: str          # 错误类型: "tool_timeout" | "parse_error" | "llm_api_error" | "sandbox_rejected" | "unknown"
    message: str             # 人类可读的错误消息
    recoverable: bool        # 是否可恢复（True → Agent 可重试，False → 终止）


@dataclass
class WorkerSummaryData:
    """worker.summary — 任务完成后的最终汇总。"""
    deliverable_summary: str     # Agent 对交付物的自我评价
    self_rating: str             # Agent 自评 (1-5)
    key_findings: list[str]      # 关键发现列表
    total_duration_ms: int = 0   # 总耗时（毫秒）


@dataclass
class WorkerThoughtData:
    """worker.thought — Agent 自由思考（不在终端中突出显示，记录在日志中）。"""
    step_index: int | None   # 当前步骤编号
    thought: str             # 思考内容（自由文本）


# =============================================================================
# Tool 参数 schemas（供 Agent 决策 prompt 动态生成工具列表）
# =============================================================================

TOOL_PARAM_SCHEMAS: dict[str, dict] = {
    "web_search": {
        "query": {"type": "string", "description": "搜索关键词"},
    },
    "run_python": {
        "code": {"type": "string", "description": "Python 代码，将写入临时文件后执行"},
    },
    "write_file": {
        "path": {"type": "string", "description": "文件路径（workspace root 下的相对路径）"},
        "content": {"type": "string", "description": "文件完整内容（UTF-8 文本）"},
    },
    "read_file": {
        "path": {"type": "string", "description": "要读取的文件路径（相对路径）"},
    },
    "list_files": {
        "directory": {"type": "string", "description": "目录路径，空字符串 "" 表示根目录"},
    },
}
