"""
AgentWorker 引擎 — 状态机驱动的单 Agent 决策循环。

设计约束:
  - AgentWorker 不 import FastAPI / WorldEngine / GroupChat。
  - 所有状态转换通过 _transition() 记录日志 + 发射 SSE 事件。
  - Agent 决策 JSON 解析失败 → 重试 → 仍失败 → ERROR。
  - MAX_STEPS = 20，超限强制终止。

架构:
    API Layer → AgentWorker.execute(task) → SSE events → 前端
                   │
                   ├── LifeAgent (LLM 调用)
                   ├── WorkspaceProvider (文件 I/O)
                   ├── ToolSpec[] (工具注册表)
                   └── state_machine (状态驱动)

Phase 23: 完整实现。
"""

import asyncio
import json
import time
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from pathlib import Path

from loguru import logger

from engines.worker.state_machine import (
    MAX_LLM_RETRIES,
    MAX_PARSE_RETRIES,
    MAX_STEPS,
    ErrorLevel,
    WorkerState,
    get_error_strategy,
)
from engines.worker.events import (
    WorkerDoneData,
    WorkerErrorData,
    WorkerFileUpdatedData,
    WorkerPlanData,
    WorkerReflectionData,
    WorkerStartedData,
    WorkerStepDecisionData,
    WorkerSummaryData,
    WorkerThoughtData,
    WorkerToolResultData,
    WorkerToolStartData,
    PlanStep,
)
from engines.worker.prompts import (
    WORKER_SYSTEM_PROMPT,
    RETRY_HINT,
    build_decision_prompt,
    build_reflection_prompt,
)
from engines.worker.tools import make_worker_tools, ToolSpec
from engines.worker.workspace import LocalWorkspace, WorkspaceProvider, safe_read
from engines.worker.recipes import get_recipe, list_recipes as _list_recipes
from engines.worker.recipes import Recipe


# =============================================================================
# 辅助函数
# =============================================================================


def _now_iso() -> str:
    """当前时间 ISO8601 字符串。"""
    return datetime.now(timezone.utc).isoformat()


def _sse_event(event_type: str, data: dict) -> str:
    """构建 SSE 事件字符串。

    Args:
        event_type: WorkerEventType 字面量
        data: 事件 data 字典（可以是 dict 或 dataclass 实例）

    Returns:
        "data: {json}\n\n" 格式的 SSE 字符串
    """
    # 将 dataclass 实例转为 dict（否则 json.dumps 无法序列化）
    from dataclasses import asdict, is_dataclass
    serializable_data = {}
    for key, value in (data.items() if isinstance(data, dict) else data.__dict__.items()):
        if is_dataclass(value):
            serializable_data[key] = asdict(value)
        elif isinstance(value, list):
            serializable_data[key] = [
                asdict(v) if is_dataclass(v) else v for v in value
            ]
        else:
            serializable_data[key] = value

    payload = json.dumps({
        "type": event_type,
        "data": serializable_data,
        "timestamp": _now_iso(),
    }, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _safe_json_parse(text: str) -> dict | None:
    """安全解析 JSON——容忍 Markdown 代码块包裹。返回 dict 或 None。

    尝试多种策略:
      1. 直接解析（必须是 JSON 对象）
      2. 提取 ```json ... ``` 代码块
      3. 查找第一个 { 到最后一个 } 之间的内容
    所有策略都确保返回 dict（拒绝数组/字符串/数字等非对象 JSON）。
    """
    text = text.strip()
    if not text:
        return None

    def _parse(s: str) -> dict | None:
        """解析 JSON 字符串，仅当结果是 dict 时返回。"""
        try:
            result = json.loads(s)
            if isinstance(result, dict):
                return result
            return None
        except json.JSONDecodeError:
            return None

    # 策略 1: 直接解析
    result = _parse(text)
    if result is not None:
        return result

    # 策略 2: 提取代码块
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        if end > start:
            result = _parse(text[start:end].strip())
            if result is not None:
                return result

    # 策略 3: 从第一个 { 到最后一个 }
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start >= 0 and brace_end > brace_start:
        result = _parse(text[brace_start:brace_end + 1])
        if result is not None:
            return result

    return None


# =============================================================================
# AgentWorker
# =============================================================================


class AgentWorker:
    """状态机驱动的单 Agent 任务执行引擎。

    生命周期:
        worker = AgentWorker(agent, workspace)
        async for event in worker.execute("调研 AI Agent 框架"):
            # 发送 SSE 到前端

    设计约束:
        - 不依赖 WorldEngine / GroupChat / PlanManager。
        - Agent 决策是纯 JSON 格式，不涉及自由文本聊天。
        - 工具通过闭包捕获 WorkspaceProvider，产生真实文件系统副作用。
    """

    def __init__(
        self,
        agent,           # LifeAgent 实例
        workspace: WorkspaceProvider = None,
        base_dir: str = None,
    ):
        """创建 Worker。

        Args:
            agent: LifeAgent 实例（需已配置 model_client）
            workspace: WorkspaceProvider 实例（可选，不提供则自动创建 LocalWorkspace）
            base_dir: 本地工作区基础目录（workspace 为 None 时使用）
        """
        self._agent = agent
        import uuid
        self._run_id = f"run-{uuid.uuid4().hex[:8]}"
        self._agent_name = agent.persona.name if hasattr(agent, 'persona') else "Worker"

        # Step 100: 配方模式
        self._recipe: Recipe | None = None
        self._recipe_phase_index = 0

        # Workspace
        if workspace is not None:
            self._workspace = workspace
        else:
            from pathlib import Path
            self._workspace = LocalWorkspace(
                base_dir=base_dir or str(Path.home() / "workspaces"),
                run_id=self._run_id,
            )

        # 状态
        self._state = WorkerState.IDLE
        self._cancel_requested = False

        # 工具（延迟初始化——需要 workspace 引用）
        self._tools: list[ToolSpec] = []

        # 步骤追踪
        self._step_index = 0
        self._plan_steps: list[dict] = []       # Agent 的计划
        self._completed_steps: list[dict] = []   # 已完成的步骤摘要
        self._files_created: list[str] = []       # 本运行中创建的文件
        self._start_time: float = 0
        self._execution_memory = None             # 任务执行前注入的 Memory 元数据

        # 文件锁 — 用户编辑时禁止 Agent 写入
        self._locked_files: set[str] = set()

        # 重试计数
        self._llm_errors = 0
        self._parse_errors = 0

        logger.info(f"AgentWorker created: agent={self._agent_name}, "
                    f"workspace={self._workspace.location_description}")

    # ─────────────────────────────────────────────────────────────────
    # 公共 API
    # ─────────────────────────────────────────────────────────────────

    async def execute(
        self, task: str, is_follow_up: bool = False, recipe_id: str = "",
        extra_tools: list[str] | None = None,
        enabled_tools: list[str] | None = None,
    ) -> AsyncGenerator[str, None]:
        """执行任务——返回 SSE 事件生成器。

        Args:
            task: 用户的任务描述
            is_follow_up: 是否为追加任务（复用工作区时设为 True）
            recipe_id: 配方 ID（可选，如 "deep_research"）
            extra_tools: Step 105 — 本节点专属工具名列表
            enabled_tools: Step 105 — 精确启用的工具列表（空=全部）
        """
        self._is_follow_up = is_follow_up

        # Step 100: 加载配方
        if recipe_id:
            self._recipe = get_recipe(recipe_id)
            if self._recipe:
                self._recipe_phase_index = 0
                logger.info(f"AgentWorker recipe: {self._recipe.name}")
            else:
                logger.warning(f"AgentWorker: unknown recipe '{recipe_id}'")

        if self._state != WorkerState.IDLE:
            yield _sse_event("worker.error", WorkerErrorData(
                step_index=None,
                error_type="invalid_state",
                message=f"Worker 不是空闲状态 (当前: {self._state.value})",
                recoverable=False,
            ).__dict__)
            return

        # M9 / M12 / Pipeline 共用入口：真实 Agent 在每次工作前按当前任务
        # 检索并注入持久化 Memory。默认 Worker 和测试替身会自动跳过。
        from engines.agent_factory.execution_memory import (
            prepare_execution_memory_context,
        )
        self._execution_memory = await prepare_execution_memory_context(
            self._agent,
            task,
        )

        self._start_time = time.monotonic()
        self._tools = make_worker_tools(self._workspace, extra_tools=extra_tools or [], enabled_tools=enabled_tools or [])

        # Step 103: 从用户参数读取 max_steps 和 timeout
        try:
            from config import get_settings as _get_user_settings
            _us = _get_user_settings()
            self._max_steps = _us.worker_max_steps
            self._timeout_seconds = _us.worker_timeout_minutes * 60
        except Exception:
            self._max_steps = MAX_STEPS
            self._timeout_seconds = 900  # 15 min default

        logger.info(f"AgentWorker.execute: task='{task[:80]}...' max_steps={self._max_steps}")

        # 初始事件
        self._transition(WorkerState.PLANNING)
        yield _sse_event("worker.started", WorkerStartedData(
            run_id=self._run_id,
            agent_name=self._agent_name,
            task=task,
            workspace=self._workspace.location_description,
        ).__dict__)

        try:
            # ── 主循环（状态机驱动）──
            while True:
                if self._cancel_requested:
                    cancel_events = await self._handle_cancel()
                    for ev in cancel_events:
                        yield ev
                    return

                # Fix: 全局超时检查 (Step 103 worker_timeout_minutes)
                _timeout = getattr(self, '_timeout_seconds', 900)
                if time.monotonic() - self._start_time > _timeout:
                    logger.warning(f"AgentWorker: timeout after {_timeout}s")
                    yield _sse_event("worker.error", WorkerErrorData(
                        step_index=self._step_index,
                        error_type="timeout",
                        message=f"任务超时（{_timeout // 60} 分钟）",
                        recoverable=False,
                    ).__dict__)
                    self._transition(WorkerState.DONE)
                    break

                match self._state:
                    case WorkerState.PLANNING:
                        async for event in self._do_planning(task):
                            yield event

                    case WorkerState.DECIDING:
                        async for event in self._do_deciding(task):
                            yield event
                        # deciding 可能直接转换到 DONE
                        if self._state == WorkerState.DONE:
                            done_events = await self._handle_done()
                            for ev in done_events:
                                yield ev
                            return

                    case WorkerState.EXECUTING:
                        async for event in self._do_executing():
                            yield event

                    case WorkerState.REFLECTING:
                        async for event in self._do_reflecting():
                            yield event

                    case WorkerState.DONE:
                        done_events = await self._handle_done()
                        for ev in done_events:
                            yield ev
                        return

                    case WorkerState.ERROR:
                        error_events = await self._handle_error()
                        for ev in error_events:
                            yield ev
                        return

                    case _:
                        break

        except Exception as e:
            logger.exception(f"AgentWorker unexpected error: {e}")
            self._transition(WorkerState.ERROR)
            yield _sse_event("worker.error", WorkerErrorData(
                step_index=self._step_index,
                error_type="unknown",
                message=str(e)[:500],
                recoverable=False,
            ).__dict__)
            self._transition(WorkerState.DONE)

    def cancel(self):
        """Cancel the worker at the next state checkpoint."""
        logger.info(f"AgentWorker.cancel: run_id={self._run_id}")
        self._cancel_requested = True

    @property
    def state(self) -> WorkerState:
        return self._state

    @property
    def run_id(self) -> str:
        return self._run_id

    @property
    def workspace(self):
        return self._workspace

    # -- file locking (block Agent writes during user editing) --

    def lock_file(self, path: str):
        """Lock file so agent's write_file tool rejects it."""
        self._locked_files.add(path.replace("\\", "/"))

    def unlock_file(self, path: str):
        """Unlock file."""
        self._locked_files.discard(path.replace("\\", "/"))

    def is_file_locked(self, path: str) -> bool:
        """Check if file is locked by user."""
        return path.replace("\\", "/") in self._locked_files

    # ─────────────────────────────────────────────────────────────────
    # 状态处理
    # ─────────────────────────────────────────────────────────────────

    async def _do_planning(self, task: str) -> AsyncGenerator[str, None]:
        """PLANNING 状态：引导 Agent 制定计划。

        发送决策 prompt（step_index=1），Agent 的回复中包含计划概述。
        提取 reason 字段作为计划描述。
        """
        plan_text = f"任务：{task}"
        prompt = build_decision_prompt(
            step_index=1,
            task=task,
            plan_summary="（尚未制定）",
            completed_steps="（无）",
            file_list="（空工作区）",
            last_action="",
            last_result="",
            tools=self._tools,
        )

        # 调用 LLM
        response = await self._call_llm(WORKER_SYSTEM_PROMPT, prompt)
        if response is None:
            self._transition(WorkerState.ERROR)
            yield _sse_event("worker.error", WorkerErrorData(
                step_index=1,
                error_type="llm_api_error",
                message="LLM 调用失败，无法制定计划",
                recoverable=False,
            ).__dict__)
            return

        decision = _safe_json_parse(response)
        if decision is None:
            # JSON 解析失败
            self._parse_errors += 1
            if self._parse_errors >= MAX_PARSE_RETRIES:
                self._transition(WorkerState.ERROR)
                yield _sse_event("worker.error", WorkerErrorData(
                    step_index=1,
                    error_type="json_parse_failure",
                    message=f"Agent 输出无法解析为 JSON (已重试 {MAX_PARSE_RETRIES} 次)",
                    recoverable=False,
                ).__dict__)
                return
            # 重试
            logger.warning("Agent planning JSON parse failed, retrying...")
            retry_prompt = prompt + RETRY_HINT
            response = await self._call_llm(WORKER_SYSTEM_PROMPT, retry_prompt)
            if response is None:
                self._transition(WorkerState.ERROR)
                return
            decision = _safe_json_parse(response)
            if decision is None:
                self._transition(WorkerState.ERROR)
                yield _sse_event("worker.error", WorkerErrorData(
                    step_index=1,
                    error_type="json_parse_failure",
                    message=f"Agent 输出无法解析为 JSON (已重试 {MAX_PARSE_RETRIES} 次)",
                    recoverable=False,
                ).__dict__)
                return

        # 提取计划（从 reason 字段）
        reason = decision.get("reason", "（无计划）")
        self._plan_steps = [{"title": f"Step 1: {reason[:200]}"}]

        # 发射 plan 事件
        plan_steps = [PlanStep(title=s["title"], estimated_tools=["待定"]) for s in self._plan_steps]
        yield _sse_event("worker.plan", WorkerPlanData(
            steps=plan_steps,
            total_steps=len(plan_steps),
            strategy=reason,
        ).__dict__)

        # 发射 thought 事件
        yield _sse_event("worker.thought", WorkerThoughtData(
            step_index=1,
            thought=f"[计划] {reason[:500]}",
        ).__dict__)

        self._transition(WorkerState.DECIDING)

    async def _do_deciding(self, task: str) -> AsyncGenerator[str, None]:
        """DECIDING 状态：Agent 决定下一步做什么。

        返回 JSON {"decision": "tool_call"|"done", "tool_name": ..., "tool_args": ..., "reason": ...}
        """
        self._step_index += 1

        # 检查步数限制（Step 103: 用户可调）
        _limit = getattr(self, '_max_steps', MAX_STEPS)
        if self._step_index > _limit:
            logger.warning(f"AgentWorker: reached max_steps ({_limit}), forcing DONE")
            self._transition(WorkerState.DONE)
            return

        # 构建上下文
        plan_summary = "\n".join(s["title"] for s in self._plan_steps) if self._plan_steps else "（无详细计划）"
        completed_text = "\n".join(
            f"- {s.get('title', '?')} → {str(s.get('result', '?'))[:100]}"
            for s in self._completed_steps
        ) if self._completed_steps else "（无）"

        # 文件列表
        try:
            files = await self._workspace.list_files()
            file_list = "\n".join(f"- {f.path} ({f.size}B)" for f in files) if files else "（空）"
        except Exception:
            file_list = "（无法读取）"

        # 上一步信息
        last = self._completed_steps[-1] if self._completed_steps else {}
        last_action = last.get("title", "")
        last_result = last.get("result", "")

        # Step 100: 配方上下文
        recipe_context = ""
        if self._recipe and self._recipe_phase_index < len(self._recipe.phases):
            phase = self._recipe.phases[self._recipe_phase_index]
            recipe_context = (
                f"\n## 🔬 当前配方: {self._recipe.name}（阶段 {self._recipe_phase_index + 1}/{len(self._recipe.phases)}）\n"
                f"**当前阶段: {phase.title}**\n"
                f"指令: {phase.instruction}\n"
                f"必须使用的工具: {', '.join(phase.required_tools)}\n"
                f"本阶段产出: {phase.output}\n"
                f"⚠️ 本阶段完成前不要跳到下一阶段。\n"
            )

        # Step 100c: Fork 历史注入
        fork_context = ""
        if getattr(self, "_is_fork", False):
            hist = getattr(self, "_fork_history", []) or []
            alt = getattr(self, "_fork_decision", "")
            pt = getattr(self, "_fork_point", 0)
            fork_context = (
                f"\n## 🔀 分叉模式\n"
                f"这是从原始运行的 Step {pt} 处分叉的。分叉点之前的决策历史:\n"
            )
            for h in hist[-5:]:  # 最近 5 步
                fork_context += (
                    f"  - Step {h.get('step_index','?')}: {h.get('action','?')} "
                    f"({h.get('reason','')[:80]})\n"
                )
            if alt:
                fork_context += (
                    f"\n⚠️ 在分叉点处，原始 Agent 的决策被替换为:\n"
                    f"「{alt}」\n"
                    f"请基于这个新方向继续执行任务。\n"
                )

        prompt = build_decision_prompt(
            step_index=self._step_index,
            task=task,
            plan_summary=plan_summary,
            completed_steps=completed_text,
            file_list=file_list,
            last_action=last_action,
            last_result=last_result,
            tools=self._tools,
            is_follow_up=getattr(self, "_is_follow_up", False),
            recipe_context=recipe_context,
            fork_context=fork_context,
        )

        # 调用 LLM
        decision = await self._get_decision(prompt)
        if decision is None:
            # 已经处理了重试，仍然失败 → ERROR
            self._transition(WorkerState.ERROR)
            yield _sse_event("worker.error", WorkerErrorData(
                step_index=self._step_index,
                error_type="json_parse_failure",
                message="Agent JSON 解析连续失败",
                recoverable=False,
            ).__dict__)
            return

        action = decision.get("decision", "done")
        reason = decision.get("reason", "")

        logger.info(f"AgentWorker deciding: step={self._step_index}, action={action}, reason={reason[:80]}")

        # Step 100c: 记录决策到日志（供分叉使用）
        try:
            from engines.worker.fork import save_decision_step
            tool_name = decision.get("tool_name", action) if action == "tool_call" else action
            save_decision_step(
                self._run_id, self._step_index,
                action=action, reason=reason,
                tool_name=tool_name if isinstance(tool_name, str) else "",
            )
        except Exception:
            pass

        # 发射决策事件
        yield _sse_event("worker.thought", WorkerThoughtData(
            step_index=self._step_index,
            thought=f"[决策] {reason[:500]}",
        ).__dict__)

        yield _sse_event("worker.step_decision", WorkerStepDecisionData(
            step_index=self._step_index,
            action=action,
            reason=reason,
        ).__dict__)

        # 容错：如果 decision 值本身是已知工具名，视为 tool_call
        known_tool_names = {t.name for t in self._tools}
        if action in known_tool_names:
            tool_name = action
            tool_args = decision.get("tool_args", {}) or {}
            if "query" not in tool_args and "path" not in tool_args and "code" not in tool_args and "content" not in tool_args:
                # Agent 把 tool_args 放在了顶层 JSON 而不是嵌套的 tool_args 字段
                tool_args = {k: v for k, v in decision.items()
                            if k not in ("decision", "tool_name", "reason", "deliverable_summary")}
            logger.info(f"AgentWorker: LLM used '{action}' directly as decision, auto-corrected to tool_call")
            self._pending_decision = {"tool_name": tool_name, "tool_args": tool_args}
            self._transition(WorkerState.EXECUTING)

        elif action == "tool_call":
            tool_name = decision.get("tool_name", "")
            tool_args = decision.get("tool_args", {}) or {}

            # 验证工具名
            if tool_name not in known_tool_names:
                yield _sse_event("worker.thought", WorkerThoughtData(
                    step_index=self._step_index,
                    thought=f"警告：Agent 请求了未知工具 '{tool_name}'，引导 Agent 选择正确的工具",
                ).__dict__)
                self._completed_steps.append({
                    "title": f"Step {self._step_index}: 决策错误 (未知工具: {tool_name})",
                    "result": f"工具 '{tool_name}' 未注册。可用工具: {', '.join(known_tool_names)}",
                })
                return

            self._pending_decision = {"tool_name": tool_name, "tool_args": tool_args}
            self._transition(WorkerState.EXECUTING)

        elif action == "done":
            self._transition(WorkerState.DONE)

        else:
            # 未知 action → 记录但不崩溃
            logger.warning(f"AgentWorker: unknown decision='{action}' → recording as skipped step")
            self._completed_steps.append({
                "title": f"Step {self._step_index}: 未知决策 ({action})",
                "result": f"Agent 返回了未识别的决策类型: {action}。{reason}",
            })
            # 继续下一轮

    async def _do_executing(self) -> AsyncGenerator[str, None]:
        """EXECUTING 状态：执行 Agent 选择的工具。"""
        decision = getattr(self, "_pending_decision", {})
        if not decision:
            self._transition(WorkerState.DECIDING)
            return

        tool_name = decision["tool_name"]
        tool_args = decision["tool_args"]
        tool_spec = next((t for t in self._tools if t.name == tool_name), None)

        # 发射 tool_start 事件
        args_summary = ", ".join(f"{k}={str(v)[:50]}" for k, v in (tool_args or {}).items())
        yield _sse_event("worker.tool_start", WorkerToolStartData(
            step_index=self._step_index,
            tool_name=tool_name,
            args_summary=args_summary[:100],
        ).__dict__)

        # 文件锁检查：write_file 时如果用户正在编辑该文件，拒绝执行
        if tool_name == "write_file" and tool_args:
            target_path = tool_args.get("path", "")
            if target_path and self.is_file_locked(target_path):
                duration_ms = 0
                yield _sse_event("worker.tool_result", WorkerToolResultData(
                    step_index=self._step_index,
                    tool_name=tool_name,
                    result_summary="文件正在被用户编辑，暂时锁定",
                    result_detail=f"文件 '{target_path}' 正在被用户编辑中，Agent 写入被阻止。用户关闭编辑器后锁自动释放。",
                    duration_ms=0,
                    success=False,
                ).__dict__)
                self._completed_steps.append({
                    "title": f"Step {self._step_index}: {tool_name} (被锁)",
                    "result": f"文件 {target_path} 正在被用户编辑",
                })
                self._transition(WorkerState.REFLECTING)
                return

        # 执行工具
        start_time = time.monotonic()
        try:
            if tool_spec and tool_spec.handler:
                result_str = str(await tool_spec.handler(**tool_args))
                success = True
            else:
                result_str = f"工具 '{tool_name}' 未实现（handler 未注册）"
                success = False
        except Exception as e:
            result_str = f"工具执行失败: {e}"
            success = False
            logger.error(f"AgentWorker tool error: {tool_name} — {e}")

        duration_ms = int((time.monotonic() - start_time) * 1000)

        # 发射 tool_result 事件
        result_summary = result_str[:200]
        yield _sse_event("worker.tool_result", WorkerToolResultData(
            step_index=self._step_index,
            tool_name=tool_name,
            result_summary=result_summary,
            result_detail=result_str[:2000],
            duration_ms=duration_ms,
            success=success,
        ).__dict__)

        # 如果是文件写入工具，发射 file_updated 事件（含 preview）
        if tool_name in ("write_file",) and success:
            path_arg = tool_args.get("path", "")
            content_arg = tool_args.get("content", "")
            if path_arg:
                self._files_created.append(path_arg)
            try:
                files = await self._workspace.list_files()
                file_data = []
                for f in files:
                    entry = {"path": f.path, "size": f.size}
                    # Step 100: 附带文件预览（前 5000 字符）
                    if f.path == path_arg and content_arg:
                        entry["preview"] = content_arg[:5000]
                    elif f.path.endswith((".md", ".txt", ".json", ".csv", ".py")):
                        try:
                            raw = safe_read(Path(self._workspace.root) / "files" / f.path.replace("\\", "/"))
                            entry["preview"] = raw[:5000]
                        except Exception:
                            pass
                    file_data.append(entry)
                yield _sse_event("worker.file_updated", WorkerFileUpdatedData(
                    step_index=self._step_index,
                    files=file_data,
                ).__dict__)
            except Exception:
                pass

        # Step 100: 配方阶段自动推进
        if self._recipe and self._recipe_phase_index < len(self._recipe.phases):
            phase = self._recipe.phases[self._recipe_phase_index]
            should_advance = False
            output_pattern = phase.output

            if not output_pattern:
                # 无产出要求（如 setup_env）→ 执行完工具就推进
                should_advance = True
            elif output_pattern.endswith("/*"):
                # glob 模式（如 sources/raw/*.md）→ 检查目录下是否有文件
                dir_path = output_pattern[:-2]  # strip "/*"
                try:
                    files = await self._workspace.list_files(dir_path)
                    if files:
                        should_advance = True
                except Exception:
                    pass
            elif output_pattern.endswith("/"):
                # 目录（如 charts/）→ 检查目录下是否有文件
                try:
                    files = await self._workspace.list_files(output_pattern.rstrip("/"))
                    if files:
                        should_advance = True
                except Exception:
                    pass
            else:
                # 具体文件 → exists 检查
                try:
                    exists = await self._workspace.exists(output_pattern)
                    if exists:
                        should_advance = True
                except Exception:
                    pass

            if should_advance:
                self._recipe_phase_index += 1
                logger.info(
                    f"Recipe phase advanced: {phase.title} → "
                    f"{self._recipe.phases[self._recipe_phase_index].title if self._recipe_phase_index < len(self._recipe.phases) else 'done'}"
                )
                if self._recipe.all_done(self._recipe_phase_index):
                    yield _sse_event("worker.thought", WorkerThoughtData(
                        step_index=self._step_index,
                        thought=f"🎉 配方「{self._recipe.name}」所有阶段完成！",
                    ).__dict__)

        # 记录完成的步骤
        self._completed_steps.append({
            "title": f"Step {self._step_index}: {tool_name}",
            "result": result_summary,
        })

        # 检查错误级别
        if not success:
            strategy = get_error_strategy("tool_unexpected_output")
            if strategy.level == ErrorLevel.RETRYABLE:
                # 自动重试（简单策略：给 Agent 反映）
                pass  # Agent 在下一轮 DECIDING 中会看到上一步失败，自己决定是否重试
            elif strategy.level == ErrorLevel.FATAL:
                self._transition(WorkerState.ERROR)
                yield _sse_event("worker.error", WorkerErrorData(
                    step_index=self._step_index,
                    error_type="tool_fatal",
                    message=f"工具 '{tool_name}' 执行失败且不可恢复",
                    recoverable=False,
                ).__dict__)
                return

        self._transition(WorkerState.REFLECTING)

    async def _do_reflecting(self) -> AsyncGenerator[str, None]:
        """REFLECTING 状态：Agent 评估上一步结果，决定下一步。"""
        if not self._completed_steps:
            self._transition(WorkerState.DECIDING)
            return

        last = self._completed_steps[-1]
        prompt = build_reflection_prompt(
            tool_name=last.get("title", "未知"),
            result_summary=last.get("result", ""),
        )

        response = await self._call_llm(WORKER_SYSTEM_PROMPT, prompt)
        if response is None:
            # LLM 调用失败 → 默认继续
            logger.warning("AgentWorker reflection LLM failed, defaulting to continue")
            self._transition(WorkerState.DECIDING)
            return

        reflection = _safe_json_parse(response)
        if reflection is None:
            # 解析失败 → 默认继续
            logger.warning("AgentWorker reflection parse failed, defaulting to continue")
            self._transition(WorkerState.DECIDING)
            return

        satisfied = reflection.get("satisfied", True)
        plan_changed = reflection.get("plan_changed", False)
        thought = reflection.get("thought", "")
        next_action = reflection.get("next_action", "continue")

        yield _sse_event("worker.thought", WorkerThoughtData(
            step_index=self._step_index,
            thought=f"[反思] {thought[:500]}",
        ).__dict__)

        yield _sse_event("worker.reflection", WorkerReflectionData(
            step_index=self._step_index,
            satisfied=satisfied,
            plan_changed=plan_changed,
            thought=thought[:500],
            next_action=next_action,
        ).__dict__)

        # 根据反思结果转换状态
        if next_action == "done":
            self._transition(WorkerState.DONE)
        elif next_action == "revise":
            self._transition(WorkerState.PLANNING)
        else:  # "continue"
            self._transition(WorkerState.DECIDING)

    async def _handle_done(self) -> list[str]:
        """DONE 状态：返回完成事件列表。"""
        events = []
        total_duration_ms = int((time.monotonic() - self._start_time) * 1000)

        try:
            files = await self._workspace.list_files()
            file_paths = [f.path for f in files]
        except Exception:
            file_paths = self._files_created

        events.append(_sse_event("worker.done", WorkerDoneData(
            reason="任务已完成",
            total_steps=self._step_index,
            files=file_paths,
        ).__dict__))

        summary = f"任务完成。共执行 {self._step_index} 步，产生 {len(file_paths)} 个文件。"
        events.append(_sse_event("worker.summary", WorkerSummaryData(
            deliverable_summary=summary,
            self_rating="3",
            key_findings=[f"产出 {len(file_paths)} 个文件"] + file_paths[:5],
            total_duration_ms=total_duration_ms,
        ).__dict__))

        # Step 100a: 存储元数据供纪念墙使用
        self._total_duration_ms = total_duration_ms
        self._self_rating = "3"
        self._key_findings = [f"产出 {len(file_paths)} 个文件"] + file_paths[:3]

        logger.info(f"AgentWorker DONE: {self._step_index} steps, "
                    f"{len(file_paths)} files, {total_duration_ms}ms")
        return events

    async def _handle_error(self) -> list[str]:
        """ERROR 状态：返回错误事件列表。"""
        events = [_sse_event("worker.error", WorkerErrorData(
            step_index=self._step_index,
            error_type="fatal",
            message="Worker 遇到致命错误已终止",
            recoverable=False,
        ).__dict__)]
        self._transition(WorkerState.DONE)
        return events

    async def _handle_cancel(self) -> list[str]:
        """处理取消请求——返回取消事件列表。"""
        logger.info(f"AgentWorker cancelled: run_id={self._run_id}")
        return [_sse_event("worker.done", WorkerDoneData(
            reason="用户取消",
            total_steps=self._step_index,
            files=self._files_created,
        ).__dict__)]

    # ─────────────────────────────────────────────────────────────────
    # 内部方法
    # ─────────────────────────────────────────────────────────────────

    def _transition(self, new_state: WorkerState):
        """状态转换——记录日志。"""
        old_state = self._state
        self._state = new_state
        logger.debug(f"AgentWorker: {old_state.value} → {new_state.value}")

    async def _call_llm(self, system_prompt: str, user_message: str) -> str | None:
        """调用 LLM 并返回文本响应。

        使用 LifeAgent.autogen_agent.on_messages() 进行单次调用。

        Returns:
            LLM 响应文本，如果失败返回 None
        """
        from autogen_agentchat.messages import TextMessage

        for attempt in range(MAX_LLM_RETRIES):
            try:
                agent = self._agent
                # 将 system + user prompt 合并为一条 TextMessage
                combined = f"{system_prompt}\n\n---\n\n{user_message}"
                result = await agent.autogen_agent.on_messages(
                    [TextMessage(content=combined, source="worker")],
                    cancellation_token=None,
                )
                # AutoGen 返回 ChatMessage，提取 content
                chat_msg = result.chat_message
                content = chat_msg.content if hasattr(chat_msg, 'content') else str(chat_msg)
                logger.debug(f"AgentWorker LLM: {len(content)} chars")
                return content

            except Exception as e:
                logger.warning(f"AgentWorker LLM attempt {attempt + 1}/{MAX_LLM_RETRIES} failed: {e}")
                self._llm_errors += 1
                if attempt < MAX_LLM_RETRIES - 1:
                    await asyncio.sleep(2 * (attempt + 1))  # 指数退避
                else:
                    self._llm_errors = 0  # reset
                    return None

        return None

    async def _get_decision(self, prompt: str) -> dict | None:
        """获取 Agent 决策——包含 JSON 解析和重试逻辑。

        Returns:
            解析后的决策 dict，失败返回 None
        """
        response = await self._call_llm(WORKER_SYSTEM_PROMPT, prompt)
        if response is None:
            return None

        decision = _safe_json_parse(response)
        if decision is not None:
            self._parse_errors = 0  # reset on success
            return decision

        # JSON 解析失败 → 重试
        self._parse_errors += 1
        logger.warning(f"AgentWorker JSON parse failed (attempt {self._parse_errors}/{MAX_PARSE_RETRIES})")

        if self._parse_errors >= MAX_PARSE_RETRIES:
            return None

        # 重试——追加格式要求
        retry_prompt = prompt + RETRY_HINT
        response = await self._call_llm(WORKER_SYSTEM_PROMPT, retry_prompt)
        if response is None:
            return None

        decision = _safe_json_parse(response)
        if decision is not None:
            self._parse_errors = 0
            return decision

        self._parse_errors += 1
        return None
