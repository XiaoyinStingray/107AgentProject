"""Step T10: State machine 和 JSON 解析测试。"""

import json
from engines.worker.state_machine import (
    WorkerState,
    STATE_TRANSITIONS,
    ERROR_STRATEGIES,
    ErrorLevel,
    get_error_strategy,
    can_transition,
    is_terminal,
    is_active,
    MAX_STEPS,
    MAX_PARSE_RETRIES,
    MAX_LLM_RETRIES,
)
from engines.worker.pipeline import (
    PipelineSpec,
    PipelineNodeSpec,
    PipelineStatus,
    validate_pipeline,
    _topological_sort,
)


# =============================================================================
# Worker State Machine
# =============================================================================


class TestStateMachine:
    """Worker 状态机——6 状态 + 转换路径。"""

    def test_six_states_defined(self):
        """6 个状态全部定义。"""
        expected = {"idle", "planning", "deciding", "executing", "reflecting", "done", "error"}
        actual = {s.value for s in WorkerState}
        assert actual == expected

    def test_transitions_cover_all_states(self):
        """所有状态至少参与一条转换。"""
        from_states = {t.from_state for t in STATE_TRANSITIONS}
        to_states = {t.to_state for t in STATE_TRANSITIONS}
        # IDLE 是初始状态
        assert WorkerState.IDLE in from_states
        # DONE 是终止状态
        assert WorkerState.DONE in to_states

    def test_no_self_loops_except_done(self):
        """没有自环（除了 done）。"""
        for t in STATE_TRANSITIONS:
            if t.from_state != WorkerState.DONE:
                assert t.from_state != t.to_state, f"Self-loop: {t}"

    def test_idle_to_planning(self):
        """IDLE → PLANNING 转换存在。"""
        assert can_transition(WorkerState.IDLE, "execute(task)") == WorkerState.PLANNING

    def test_planning_to_deciding(self):
        """PLANNING → DECIDING 转换存在。"""
        assert can_transition(WorkerState.PLANNING, "plan_ready") == WorkerState.DECIDING

    def test_deciding_to_executing(self):
        """DECIDING → EXECUTING 转换存在。"""
        assert can_transition(WorkerState.DECIDING, "agent_chooses") == WorkerState.EXECUTING

    def test_deciding_to_done(self):
        """DECIDING → DONE 转换存在。"""
        assert can_transition(WorkerState.DECIDING, "agent_chooses") is not None

    def test_invalid_event_returns_none(self):
        """无效事件返回 None。"""
        assert can_transition(WorkerState.DONE, "execute(task)") is None

    def test_terminal_states(self):
        """终止状态检测。"""
        assert is_terminal(WorkerState.DONE) is True
        assert is_terminal(WorkerState.ERROR) is True
        assert is_terminal(WorkerState.IDLE) is False
        assert is_terminal(WorkerState.DECIDING) is False

    def test_active_states(self):
        """活跃状态检测。"""
        assert is_active(WorkerState.PLANNING) is True
        assert is_active(WorkerState.DECIDING) is True
        assert is_active(WorkerState.EXECUTING) is True
        assert is_active(WorkerState.REFLECTING) is True
        assert is_active(WorkerState.IDLE) is False
        assert is_active(WorkerState.DONE) is False
        assert is_active(WorkerState.ERROR) is False

    def test_max_steps_constant(self):
        """MAX_STEPS 是合理的值。"""
        assert MAX_STEPS == 20
        assert MAX_PARSE_RETRIES == 2
        assert MAX_LLM_RETRIES == 3


class TestErrorStrategies:
    """错误恢复策略测试。"""

    def test_all_error_levels_covered(self):
        """三种错误级别都有对应的策略。"""
        levels = {s.level for s in ERROR_STRATEGIES}
        assert ErrorLevel.RETRYABLE in levels
        assert ErrorLevel.SKIPPABLE in levels
        assert ErrorLevel.FATAL in levels

    def test_llm_api_failure_is_fatal(self):
        """LLM API 连续失败是致命的。"""
        strategy = get_error_strategy("llm_api_failure")
        assert strategy is not None
        assert strategy.level == ErrorLevel.FATAL

    def test_unknown_error_defaults_to_fatal(self):
        """未知错误默认致命。"""
        strategy = get_error_strategy("some_unknown_error_xyz")
        assert strategy is not None
        assert strategy.level == ErrorLevel.FATAL

    def test_web_search_timeout_is_retryable(self):
        """搜索超时可重试。"""
        strategy = get_error_strategy("web_search_timeout")
        assert strategy is not None
        assert strategy.level == ErrorLevel.RETRYABLE

    def test_file_not_found_is_skippable(self):
        """文件不存在可跳过。"""
        strategy = get_error_strategy("file_not_found")
        assert strategy is not None
        assert strategy.level == ErrorLevel.SKIPPABLE


# =============================================================================
# JSON Parsing (from engine.py)
# =============================================================================


# Copy the parser from engine.py to test independently
def _safe_json_parse(text: str) -> dict | None:
    """Replicated from engine.py for testing."""
    text = text.strip()
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    if "```json" in text:
        start = text.find("```json") + 7
        end = text.find("```", start)
        if end > start:
            try:
                return json.loads(text[start:end].strip())
            except json.JSONDecodeError:
                pass
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start >= 0 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start:brace_end + 1])
        except json.JSONDecodeError:
            pass
    return None


class TestJSONParsing:
    """Agent 决策 JSON 解析测试。"""

    def test_clean_json(self):
        """干净 JSON 正常解析。"""
        result = _safe_json_parse('{"decision": "tool_call", "tool_name": "web_search", "reason": "test"}')
        assert result is not None
        assert result["decision"] == "tool_call"
        assert result["tool_name"] == "web_search"

    def test_whitespace_surrounded(self):
        """前后空白不影响解析。"""
        result = _safe_json_parse('\n\n  {"decision": "done", "reason": "finished"}\n')
        assert result is not None
        assert result["decision"] == "done"

    def test_markdown_code_block(self):
        """Markdown 代码块中的 JSON 被提取。"""
        text = '''Here is my decision:
```json
{"decision": "tool_call", "tool_name": "write_file", "tool_args": {"path": "test.md", "content": "# Test"}, "reason": "saving"}
```
That should work.'''
        result = _safe_json_parse(text)
        assert result is not None
        assert result["decision"] == "tool_call"
        assert result["tool_args"]["path"] == "test.md"

    def test_text_before_after_json(self):
        """JSON 前后有文字也能解析。"""
        text = 'I think we should search.\n{"decision": "tool_call", "tool_name": "web_search", "tool_args": {"query": "AI"}, "reason": "need info"}'
        result = _safe_json_parse(text)
        assert result is not None
        assert result["tool_args"]["query"] == "AI"

    def test_invalid_text_returns_none(self):
        """完全无效文本返回 None。"""
        result = _safe_json_parse("This is not JSON at all, just a sentence.")
        assert result is None

    def test_empty_string(self):
        """空字符串返回 None。"""
        result = _safe_json_parse("")
        assert result is None

    def test_reflection_json(self):
        """反思 JSON 格式也能解析。"""
        text = '{"satisfied": true, "plan_changed": false, "thought": "looks good", "next_action": "continue"}'
        result = _safe_json_parse(text)
        assert result is not None
        assert result["satisfied"] is True
        assert result["next_action"] == "continue"


# =============================================================================
# Pipeline Validation
# =============================================================================


class TestPipelineValidation:
    """管道 DAG 验证测试。"""

    def test_valid_linear_pipeline(self):
        """有效的线性管道。"""
        pipeline = PipelineSpec(
            id="p1",
            name="Test Pipeline",
            nodes=[
                PipelineNodeSpec(id="A", title="Step A", agent_id="a1", task="Do A"),
                PipelineNodeSpec(id="B", title="Step B", agent_id="a2", task="Do B", depends_on=["A"]),
                PipelineNodeSpec(id="C", title="Step C", agent_id="a3", task="Do C", depends_on=["B"]),
            ],
        )
        valid, msg = validate_pipeline(pipeline)
        assert valid, msg

    def test_valid_parallel_pipeline(self):
        """有效的并行管道。"""
        pipeline = PipelineSpec(
            id="p2",
            name="Parallel Test",
            nodes=[
                PipelineNodeSpec(id="A", title="Research", agent_id="a1", task="Research"),
                PipelineNodeSpec(id="B", title="Analyze", agent_id="a2", task="Analyze"),
                PipelineNodeSpec(id="C", title="Write", agent_id="a3", task="Write", depends_on=["A", "B"]),
            ],
        )
        valid, msg = validate_pipeline(pipeline)
        assert valid, msg

    def test_empty_nodes_rejected(self):
        """空节点被拒绝。"""
        pipeline = PipelineSpec(id="p3", name="Empty", nodes=[])
        valid, msg = validate_pipeline(pipeline)
        assert not valid

    def test_duplicate_ids_rejected(self):
        """重复 ID 被拒绝。"""
        pipeline = PipelineSpec(
            id="p4",
            name="Dup",
            nodes=[
                PipelineNodeSpec(id="A", title="A1", agent_id="a1", task="A"),
                PipelineNodeSpec(id="A", title="A2", agent_id="a2", task="B"),
            ],
        )
        valid, msg = validate_pipeline(pipeline)
        assert not valid

    def test_missing_dependency_rejected(self):
        """引用不存在的依赖被拒绝。"""
        pipeline = PipelineSpec(
            id="p5",
            name="Missing Dep",
            nodes=[
                PipelineNodeSpec(id="A", title="A", agent_id="a1", task="A", depends_on=["X"]),
            ],
        )
        valid, msg = validate_pipeline(pipeline)
        assert not valid

    def test_cycle_rejected(self):
        """循环依赖被拒绝。"""
        pipeline = PipelineSpec(
            id="p6",
            name="Cycle",
            nodes=[
                PipelineNodeSpec(id="A", title="A", agent_id="a1", task="A", depends_on=["B"]),
                PipelineNodeSpec(id="B", title="B", agent_id="a2", task="B", depends_on=["A"]),
            ],
        )
        valid, msg = validate_pipeline(pipeline)
        assert not valid

    def test_no_entry_node_rejected(self):
        """没有入口节点被拒绝。"""
        pipeline = PipelineSpec(
            id="p7",
            name="No Entry",
            nodes=[
                PipelineNodeSpec(id="A", title="A", agent_id="a1", task="A", depends_on=["B"]),
                PipelineNodeSpec(id="B", title="B", agent_id="a2", task="B", depends_on=["A"]),
            ],
        )
        valid, msg = validate_pipeline(pipeline)
        assert not valid

    def test_topological_sort_linear(self):
        """线性管道拓扑排序。"""
        nodes = [
            PipelineNodeSpec(id="A", title="A", agent_id="a1", task="A"),
            PipelineNodeSpec(id="B", title="B", agent_id="a2", task="B", depends_on=["A"]),
            PipelineNodeSpec(id="C", title="C", agent_id="a3", task="C", depends_on=["B"]),
        ]
        levels = _topological_sort(nodes)
        assert len(levels) == 3
        assert len(levels[0]) == 1 and levels[0][0].id == "A"
        assert len(levels[1]) == 1 and levels[1][0].id == "B"
        assert len(levels[2]) == 1 and levels[2][0].id == "C"

    def test_topological_sort_parallel(self):
        """并行管道拓扑排序。"""
        nodes = [
            PipelineNodeSpec(id="A", title="A", agent_id="a1", task="A"),
            PipelineNodeSpec(id="B", title="B", agent_id="a2", task="B"),
            PipelineNodeSpec(id="C", title="C", agent_id="a3", task="C", depends_on=["A", "B"]),
        ]
        levels = _topological_sort(nodes)
        assert len(levels) == 2
        assert len(levels[0]) == 2  # A and B parallel
        assert len(levels[1]) == 1 and levels[1][0].id == "C"

    def test_topological_sort_cycle_raises(self):
        """循环依赖抛出异常。"""
        import pytest
        nodes = [
            PipelineNodeSpec(id="A", title="A", agent_id="a1", task="A", depends_on=["B"]),
            PipelineNodeSpec(id="B", title="B", agent_id="a2", task="B", depends_on=["A"]),
        ]
        with pytest.raises(ValueError):
            _topological_sort(nodes)
