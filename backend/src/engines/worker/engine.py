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
from engines.worker.workspace import LocalWorkspace, WorkspaceProvider


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
        data: 事件 data 字典（必须是可 JSON 序列化的）

    Returns:
        "data: {json}\n\n" 格式的 SSE 字符串
    """
    payload = json.dumps({
        "type": event_type,
        "data": data,
        "timestamp": _now_iso(),
    }, ensure_ascii=False)
    return f"data: {payload}\n\n"


def _safe_json_parse(text: str) -> dict | None:
    """安全解析 JSON——容忍 Markdown 代码块包裹。

    尝试多种策略:
      1. 直接解析
      2. 提取 ```json ... ``` 代码块
      3. 查找第一个 { 到最后一个 } 之间的内容
    """
    text = text.strip()
    if not text:
        return None

    # 策略 1: 直接解析
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 策略 2: 提取代码块
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        if end > start:
            try:
                return json.loads(text[start:end].strip())
            except json.JSONDecodeError:
                pass

    # 策略 3: 从第一个 { 到最后一个 }
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start >= 0 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start:brace_end + 1])
        except json.JSONDecodeError:
            pass

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
        self._run_id = agent.id[:12] if hasattr(agent, 'id') else str(id(agent))[-12:]
        self._agent_name = agent.persona.name if hasattr(agent, 'persona') else "Worker"

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

        # 重试计数
        self._llm_errors = 0
        self._parse_errors = 0

        logger.info(f"AgentWorker created: agent={self._agent_name}, "
                    f"workspace={self._workspace.location_description}")

    # ─────────────────────────────────────────────────────────────────
    # 公共 API
    # ─────────────────────────────────────────────────────────────────

    async def execute(self, task: str) -> AsyncGenerator[str, None]:
        """执行任务——返回 SSE 事件生成器。

        Args:
            task: 用户的任务描述

        Yields:
            SSE 格式的字符串 ("data: {json}\\n\\n")
        """
        if self._state != WorkerState.IDLE:
            yield _sse_event("worker.error", WorkerErrorData(
                step_index=None,
                error_type="invalid_state",
                message=f"Worker 不是空闲状态 (当前: {self._state.value})",
                recoverable=False,
            ).__dict__)
            return

        self._start_time = time.monotonic()
        self._tools = make_worker_tools(self._workspace)

        logger.info(f"AgentWorker.execute: task='{task[:80]}...'")

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
                    for ev in self._handle_cancel():
                        yield ev
                    return

                match self._state:
                    case WorkerState.PLANNING:
                        async for event in self._do_planning(task):
                            yield event

                    case WorkerState.DECIDING:
                        async for event in self._do_deciding(task):
                            yield event
                        # deciding 可能直接转换到 DONE
                        if self._state == WorkerState.DONE:
                            for ev in self._handle_done():
                                yield ev
                            return

                    case WorkerState.EXECUTING:
                        async for event in self._do_executing():
                            yield event

                    case WorkerState.REFLECTING:
                        async for event in self._do_reflecting():
                            yield event

                    case WorkerState.DONE:
                        for ev in self._handle_done():
                            yield ev
                        return

                    case WorkerState.ERROR:
                        for ev in self._handle_error():
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
        """请求取消。Worker 在下一个状态检查点停止。"""
        logger.info(f"AgentWorker.cancel: run_id={self._run_id}")
        self._cancel_requested = True

    @property
    def state(self) -> WorkerState:
        return self._state

    @property
    def run_id(self) -> str:
        return self._run_id

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

        # 检查步数限制
        if self._step_index > MAX_STEPS:
            logger.warning(f"AgentWorker: reached MAX_STEPS ({MAX_STEPS}), forcing DONE")
            self._transition(WorkerState.DONE)
            return

        # 构建上下文
        plan_summary = "\n".join(s["title"] for s in self._plan_steps) if self._plan_steps else "（无详细计划）"
        completed_text = "\n".join(
            f"- {s.get('title', '?')} → {s.get('result', '?')[:100]}"
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

        prompt = build_decision_prompt(
            step_index=self._step_index,
            task=task,
            plan_summary=plan_summary,
            completed_steps=completed_text,
            file_list=file_list,
            last_action=last_action,
            last_result=last_result,
            tools=self._tools,
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

        if action == "tool_call":
            tool_name = decision.get("tool_name", "")
            tool_args = decision.get("tool_args", {}) or {}

            # 验证工具名
            if tool_name not in {t.name for t in self._tools}:
                yield _sse_event("worker.thought", WorkerThoughtData(
                    step_index=self._step_index,
                    thought=f"警告：Agent 请求了未知工具 '{tool_name}'，引导 Agent 选择正确的工具",
                ).__dict__)
                # 不进入 ERROR，让 Agent 在下一轮重新决定
                self._completed_steps.append({
                    "title": f"Step {self._step_index}: 决策错误 (未知工具: {tool_name})",
                    "result": f"工具 '{tool_name}' 未注册。可用工具: {', '.join(t.name for t in self._tools)}",
                })
                return

            # 保存决策到待执行
            self._pending_decision = {"tool_name": tool_name, "tool_args": tool_args}
            self._transition(WorkerState.EXECUTING)

        elif action == "done":
            self._transition(WorkerState.DONE)

        else:
            # deliverable 或其他 → 视为 tool_call 的特殊形式
            logger.info(f"AgentWorker: decision='{action}' → treating as logical step")
            self._completed_steps.append({
                "title": f"Step {self._step_index}: {action}",
                "result": decision.get("deliverable_summary", reason),
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

        # 执行工具
        start_time = time.monotonic()
        try:
            if tool_spec and tool_spec.handler:
                result_str = str(await tool_spec.handler(**tool_args))
            else:
                result_str = f"工具 '{tool_name}' 未实现"
            success = True
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

        # 如果是文件写入工具，发射 file_updated 事件
        if tool_name in ("write_file",) and success:
            path_arg = tool_args.get("path", "")
            if path_arg:
                self._files_created.append(path_arg)
            try:
                files = await self._workspace.list_files()
                yield _sse_event("worker.file_updated", WorkerFileUpdatedData(
                    step_index=self._step_index,
                    files=[{"path": f.path, "size": f.size} for f in files],
                ).__dict__)
            except Exception:
                pass

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

    async def _handle_done(self) -> AsyncGenerator[str, None]:
        """DONE 状态：生成完成事件和汇总。"""
        total_duration_ms = int((time.monotonic() - self._start_time) * 1000)

        # 列出所有产出物
        try:
            files = await self._workspace.list_files()
            file_paths = [f.path for f in files]
        except Exception:
            file_paths = self._files_created

        yield _sse_event("worker.done", WorkerDoneData(
            reason="任务已完成",
            total_steps=self._step_index,
            files=file_paths,
        ).__dict__)

        # 生成汇总（使用最后一次反思的内容）
        summary = f"任务完成。共执行 {self._step_index} 步，产生 {len(file_paths)} 个文件。"

        yield _sse_event("worker.summary", WorkerSummaryData(
            deliverable_summary=summary,
            self_rating="3",
            key_findings=[f"产出 {len(file_paths)} 个文件"] + file_paths[:5],
            total_duration_ms=total_duration_ms,
        ).__dict__)

        logger.info(f"AgentWorker DONE: {self._step_index} steps, "
                    f"{len(file_paths)} files, {total_duration_ms}ms")

    async def _handle_error(self) -> AsyncGenerator[str, None]:
        """ERROR 状态：生成错误事件。"""
        yield _sse_event("worker.error", WorkerErrorData(
            step_index=self._step_index,
            error_type="fatal",
            message="Worker 遇到致命错误已终止",
            recoverable=False,
        ).__dict__)
        self._transition(WorkerState.DONE)

    async def _handle_cancel(self) -> AsyncGenerator[str, None]:
        """处理取消请求。"""
        logger.info(f"AgentWorker cancelled: run_id={self._run_id}")
        yield _sse_event("worker.done", WorkerDoneData(
            reason="用户取消",
            total_steps=self._step_index,
            files=self._files_created,
        ).__dict__)

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
        from autogen_core.models import SystemMessage, UserMessage

        for attempt in range(MAX_LLM_RETRIES):
            try:
                # 使用 Agent 的 model_client 直接调用
                agent = self._agent
                messages = [
                    SystemMessage(content=system_prompt),
                    UserMessage(content=user_message, source="worker"),
                ]
                result = await agent.autogen_agent.on_messages(
                    messages,
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
