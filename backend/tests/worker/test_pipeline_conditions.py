"""M12 管道条件与 LLM 审查产物衔接测试。"""

import json
from unittest.mock import MagicMock, patch

from engines.worker.pipeline import (
    EdgeType,
    PipelineEdge,
    PipelineNodeSpec,
    PipelineSpec,
)
from engines.worker.pipeline_engine import PipelineEngine, PipelineRun, _eval_condition
from engines.worker.workspace import LocalWorkspace


def _run(coro):
    import asyncio

    return asyncio.run(coro)


async def _get_agent(_agent_id):
    agent = MagicMock()
    agent.persona.name = "Reviewer"
    return agent


def _node(node_id: str, task: str, *, depends_on=None, produces=None):
    return PipelineNodeSpec(
        id=node_id,
        title=node_id,
        agent_id="reviewer",
        task=task,
        depends_on=depends_on or [],
        produces=produces or [],
    )


def test_condition_reads_real_file_instead_of_task_text(tmp_path):
    """任务描述含 FAILED 但真实结果为 PASS 时，不得误触发回边。"""
    workspace = LocalWorkspace(str(tmp_path), "condition-file")
    pipeline = PipelineSpec(
        id="condition-file",
        name="condition-file",
        nodes=[_node("review", "失败时输出 FAILED", produces=["review.json"])],
    )
    run = PipelineRun(pipeline, workspace)
    edge = PipelineEdge(
        id="retry",
        from_node="review",
        to_node="review",
        edge_type=EdgeType.LOOP,
        condition="FAILED",
        condition_field="review.json",
    )

    async def scenario():
        await workspace.write_file("review.json", json.dumps({"result": "PASS"}))
        assert await _eval_condition(edge, run, workspace) is False

    _run(scenario())


def test_loop_replays_after_failed_review_and_stops_after_pass(tmp_path):
    """审查首次 FAILED、第二次 PASS：只回放一次并提前退出。"""
    workspace = LocalWorkspace(str(tmp_path), "fail-then-pass")
    counters = {"draft": 0, "review": 0}
    pipeline = PipelineSpec(
        id="fail-then-pass",
        name="fail-then-pass",
        nodes=[
            _node("draft", "draft", produces=["draft.md"]),
            _node("review", "review", depends_on=["draft"], produces=["review.json"]),
        ],
        edges=[PipelineEdge(
            id="retry-review",
            from_node="review",
            to_node="draft",
            edge_type=EdgeType.LOOP,
            condition="FAILED",
            condition_field="review.json",
            max_iterations=3,
        )],
    )

    def make_worker(*_args, **_kwargs):
        worker = MagicMock()
        worker._step_index = 1

        async def execute(task, **_execute_kwargs):
            counters[task] += 1
            if task == "draft":
                await workspace.write_file("draft.md", f"draft {counters[task]}")
                files = ["draft.md"]
            else:
                result = "FAILED" if counters[task] == 1 else "PASS"
                await workspace.write_file("review.json", json.dumps({"result": result}))
                files = ["review.json"]
            yield json.dumps({"type": "worker.done", "data": {"files": files}})

        worker.execute = execute
        return worker

    async def scenario():
        with patch("engines.worker.engine.AgentWorker", side_effect=make_worker):
            events = []
            async for event in PipelineEngine().execute(pipeline, workspace, _get_agent):
                events.append(json.loads(event))

        loops = [event for event in events if event["type"] == "pipeline.loop_triggered"]
        assert [event["data"]["iteration"] for event in loops] == [1]
        assert counters == {"draft": 2, "review": 2}
        assert events[-1]["type"] == "pipeline.done"
        assert events[-1]["data"]["status"] == "complete"

    _run(scenario())


def test_loop_stops_at_configured_iteration_limit(tmp_path):
    """审查持续 FAILED：达到三次回放上限后退出，不会无限循环。"""
    workspace = LocalWorkspace(str(tmp_path), "always-fail")
    review_count = 0
    pipeline = PipelineSpec(
        id="always-fail",
        name="always-fail",
        nodes=[
            _node("draft", "draft"),
            _node("review", "review", depends_on=["draft"], produces=["review.json"]),
        ],
        edges=[PipelineEdge(
            id="retry-review",
            from_node="review",
            to_node="draft",
            edge_type=EdgeType.LOOP,
            condition="FAILED",
            max_iterations=3,
        )],
    )

    def make_worker(*_args, **_kwargs):
        worker = MagicMock()
        worker._step_index = 1

        async def execute(task, **_execute_kwargs):
            nonlocal review_count
            files = []
            if task == "review":
                review_count += 1
                await workspace.write_file("review.json", json.dumps({"result": "FAILED"}))
                files = ["review.json"]
            yield json.dumps({"type": "worker.done", "data": {"files": files}})

        worker.execute = execute
        return worker

    async def scenario():
        with patch("engines.worker.engine.AgentWorker", side_effect=make_worker):
            events = []
            async for event in PipelineEngine().execute(pipeline, workspace, _get_agent):
                events.append(json.loads(event))

        loops = [event for event in events if event["type"] == "pipeline.loop_triggered"]
        assert [event["data"]["iteration"] for event in loops] == [1, 2, 3]
        assert review_count == 4  # 首次执行 + 3 次回放
        assert events[-1]["type"] == "pipeline.done"

    _run(scenario())
