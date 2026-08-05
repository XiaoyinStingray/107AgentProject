"""Step T12: 3 Agent 管道 E2E 测试 — Mock Agent + LocalWorkspace。

覆盖:
  - 3 节点串行管道: research → analyze → write
  - 2 并行 + 1 汇聚: A, B 并行 → C 依赖 A+B
  - 节点失败传播: A 成功 → B 失败 → C 被 SKIPPED
  - 管道 CRUD + 执行 + 历史查询
  - SSE 事件流完整性
"""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from engines.worker.pipeline import (
    EdgeType,
    NodeStatus,
    PipelineEdge,
    PipelineNodeSpec,
    PipelineSpec,
    PipelineStatus,
    validate_pipeline,
)
from engines.worker.workspace import LocalWorkspace


def _run(coro):
    """异步运行辅助。"""
    return asyncio.run(coro)


# =============================================================================
# 辅助工具
# =============================================================================


def _make_node(id, task, agent_id="worker-default", depends_on=None, produces=None):
    """创建测试用节点。"""
    return PipelineNodeSpec(
        id=id, title=id.capitalize(), agent_id=agent_id,
        task=task, depends_on=depends_on or [], produces=produces or [],
    )


def _make_mock_agent_fn():
    """创建 Mock 的 get_agent_fn。"""
    async def get_agent_fn(agent_id: str):
        mock_agent = MagicMock()
        mock_agent.persona = MagicMock()
        mock_agent.persona.name = f"Agent-{agent_id}"
        return mock_agent
    return get_agent_fn


def _make_mock_worker_with_files(workspace, node_outputs=None):
    """创建 Mock 的 AgentWorker，模拟写入产出文件。

    Args:
        workspace: LocalWorkspace 实例
        node_outputs: dict[node_id] = {filename: content} — 节点执行后写入的文件
    """
    if node_outputs is None:
        node_outputs = {}

    class MockAgentWorker:
        def __init__(self, agent, workspace):
            self.agent = agent
            self.workspace = workspace
            self._step_index = 0
            self._node_id = None

        def cancel(self):
            pass

        async def execute(self, task, extra_tools=None):
            """模拟执行：写入产出文件并发射完成事件。"""
            self._step_index += 1
            # 根据 task 内容判断是哪个节点，写入对应文件
            for node_id, files in node_outputs.items():
                if node_id.lower() in task.lower() or node_id in task:
                    for filename, content in files.items():
                        await self.workspace.write_file(filename, content)
                    break

            yield json.dumps({
                "type": "worker.done",
                "data": {"reason": "任务完成", "total_steps": 1, "files": list(
                    f for files in node_outputs.values() for f in files.keys()
                )},
            })

    return MockAgentWorker


# =============================================================================
# E2E: 3 节点串行管道
# =============================================================================


class TestSerialPipelineE2E:
    """3 节点串行管道 E2E 测试。"""

    def test_research_analyze_write_serial(self, tmp_path):
        """research → analyze → write 串行执行，验证文件传递 + SSE 事件。"""
        from engines.worker.pipeline_engine import PipelineEngine

        workspace = LocalWorkspace(str(tmp_path), "serial-test")
        engine = PipelineEngine()

        pipeline = PipelineSpec(
            id="p-serial", name="调研管道",
            nodes=[
                _make_node("research", "research: 搜索资料", produces=["research.md"]),
                _make_node("analyze", "analyze: 分析资料", depends_on=["research"],
                           produces=["analysis.md"]),
                _make_node("write", "write: 撰写报告", depends_on=["analyze"],
                           produces=["report.md"]),
            ],
        )

        async def _test():
            with patch("engines.worker.engine.AgentWorker") as MockWorker:
                call_count = 0

                def create_worker(*args, **kwargs):
                    nonlocal call_count
                    call_count += 1
                    mock = MagicMock()
                    mock._step_index = call_count

                    async def fake_execute(*a, **kw):
                        # 每个节点写入对应文件
                        node_task = a[0] if a else ""
                        if "research" in node_task:
                            await workspace.write_file("research.md", "# 调研结果")
                        elif "analyze" in node_task:
                            await workspace.write_file("analysis.md", "# 分析报告")
                        elif "write" in node_task:
                            await workspace.write_file("report.md", "# 最终报告")
                        yield json.dumps({"type": "worker.done", "data": {"reason": "ok"}})

                    mock.execute = fake_execute
                    return mock

                MockWorker.side_effect = create_worker

                events = []
                async for ev in engine.execute(pipeline, workspace, _make_mock_agent_fn()):
                    events.append(json.loads(ev))

            # 验证事件流
            types = [e["type"] for e in events]
            assert "pipeline.started" in types
            assert "pipeline.done" in types

            # 验证 3 层
            level_starts = [e for e in events if e["type"] == "pipeline.level_start"]
            assert len(level_starts) == 3

            # 验证所有节点都完成
            node_complete = [
                e for e in events
                if e["type"] == "pipeline.node_status" and e["data"]["status"] == "complete"
            ]
            assert len(node_complete) == 3

            # 验证文件被创建
            assert await workspace.exists("research.md")
            assert await workspace.exists("analysis.md")
            assert await workspace.exists("report.md")

            # 验证 pipeline.done 状态
            done = next(e for e in events if e["type"] == "pipeline.done")
            assert done["data"]["status"] == "complete"

        _run(_test())

    def test_serial_pipeline_sse_event_types(self, tmp_path):
        """验证串行管道产生的 SSE 事件类型完整性。"""
        from engines.worker.pipeline_engine import PipelineEngine

        workspace = LocalWorkspace(str(tmp_path), "sse-test")
        engine = PipelineEngine()

        pipeline = PipelineSpec(
            id="p-sse", name="SSE 测试",
            nodes=[
                _make_node("a", "task a"),
                _make_node("b", "task b", depends_on=["a"]),
            ],
        )

        async def _test():
            with patch("engines.worker.engine.AgentWorker") as MockWorker:
                mock = MagicMock()
                mock._step_index = 1

                async def fake_execute(*a, **kw):
                    yield json.dumps({"type": "worker.step_decision", "data": {}})
                    yield json.dumps({"type": "worker.done", "data": {"reason": "ok"}})

                mock.execute = fake_execute
                MockWorker.return_value = mock

                events = []
                async for ev in engine.execute(pipeline, workspace, _make_mock_agent_fn()):
                    events.append(json.loads(ev))

            # 必要事件
            types = [e["type"] for e in events]
            assert "pipeline.started" in types
            assert "pipeline.level_start" in types
            assert "pipeline.node_status" in types
            assert "pipeline.level_end" in types
            assert "pipeline.done" in types

            # node_event 转发
            node_events = [e for e in events if e["type"] == "pipeline.node_event"]
            assert len(node_events) > 0

        _run(_test())


# =============================================================================
# E2E: 2 并行 + 1 汇聚
# =============================================================================


class TestParallelPipelineE2E:
    """2 并行 + 1 汇聚管道 E2E 测试。"""

    def test_parallel_then_converge(self, tmp_path):
        """A, B 并行 → C 依赖 A+B，验证同层并行 + 依赖等待。"""
        from engines.worker.pipeline_engine import PipelineEngine

        workspace = LocalWorkspace(str(tmp_path), "parallel-test")
        engine = PipelineEngine()

        pipeline = PipelineSpec(
            id="p-parallel", name="并行汇聚",
            nodes=[
                _make_node("a", "task a: 搜索数据", produces=["data_a.json"]),
                _make_node("b", "task b: 搜索补充数据", produces=["data_b.json"]),
                _make_node("c", "task c: 合并分析", depends_on=["a", "b"],
                           produces=["merged.json"]),
            ],
        )

        async def _test():
            with patch("engines.worker.engine.AgentWorker") as MockWorker:
                def create_worker(*args, **kwargs):
                    mock = MagicMock()
                    mock._step_index = 1

                    async def fake_execute(*a, **kw):
                        task = a[0] if a else ""
                        if "a:" in task:
                            await workspace.write_file("data_a.json", '{"a": 1}')
                        elif "b:" in task:
                            await workspace.write_file("data_b.json", '{"b": 2}')
                        elif "c:" in task:
                            await workspace.write_file("merged.json", '{"merged": true}')
                        yield json.dumps({"type": "worker.done", "data": {"reason": "ok"}})

                    mock.execute = fake_execute
                    return mock

                MockWorker.side_effect = create_worker

                events = []
                async for ev in engine.execute(pipeline, workspace, _make_mock_agent_fn()):
                    events.append(json.loads(ev))

            # 验证 2 层（第一层 A+B 并行，第二层 C）
            level_starts = [e for e in events if e["type"] == "pipeline.level_start"]
            assert len(level_starts) == 2
            # 第一层有 2 个节点
            assert len(level_starts[0]["data"]["nodes"]) == 2
            # 第二层有 1 个节点
            assert len(level_starts[1]["data"]["nodes"]) == 1

            # 验证所有文件被创建
            assert await workspace.exists("data_a.json")
            assert await workspace.exists("data_b.json")
            assert await workspace.exists("merged.json")

            # 验证管道完成
            done = next(e for e in events if e["type"] == "pipeline.done")
            assert done["data"]["status"] == "complete"

        _run(_test())


# =============================================================================
# E2E: 节点失败传播
# =============================================================================


class TestFailurePropagationE2E:
    """节点失败传播 E2E 测试。"""

    def test_failure_skips_downstream(self, tmp_path):
        """A 成功 → B 失败 → C（依赖 B）被 SKIPPED。"""
        from engines.worker.pipeline_engine import PipelineEngine

        workspace = LocalWorkspace(str(tmp_path), "fail-test")
        engine = PipelineEngine()

        pipeline = PipelineSpec(
            id="p-fail", name="失败传播",
            nodes=[
                _make_node("a", "task a: 正常执行"),
                _make_node("b", "task b: 会失败", depends_on=["a"]),
                _make_node("c", "task c: 依赖 b", depends_on=["b"]),
            ],
        )

        async def _test():
            with patch("engines.worker.engine.AgentWorker") as MockWorker:
                call_count = 0

                def create_worker(*args, **kwargs):
                    nonlocal call_count
                    call_count += 1
                    mock = MagicMock()
                    mock._step_index = call_count

                    async def fake_execute(*a, **kw):
                        task = a[0] if a else ""
                        if "b:" in task:
                            raise RuntimeError("节点 B 模拟失败")
                            yield  # async generator
                        else:
                            await workspace.write_file(f"output_{call_count}.md", "ok")
                            yield json.dumps({"type": "worker.done", "data": {"reason": "ok"}})

                    mock.execute = fake_execute
                    return mock

                MockWorker.side_effect = create_worker

                events = []
                async for ev in engine.execute(pipeline, workspace, _make_mock_agent_fn()):
                    events.append(json.loads(ev))

            # 验证节点状态
            node_statuses = {}
            for e in events:
                if e["type"] == "pipeline.node_status":
                    node_statuses[e["data"]["node_id"]] = e["data"]["status"]

            assert node_statuses.get("a") == "complete"
            assert node_statuses.get("b") == "error"
            assert node_statuses.get("c") == "skipped"

            # 验证管道状态为 partial
            done = next(e for e in events if e["type"] == "pipeline.done")
            assert done["data"]["status"] == "partial"

        _run(_test())

    def test_independent_nodes_not_affected_by_failure(self, tmp_path):
        """B 失败不影响同层的 D（不依赖 B）。"""
        from engines.worker.pipeline_engine import PipelineEngine

        workspace = LocalWorkspace(str(tmp_path), "independent-test")
        engine = PipelineEngine()

        pipeline = PipelineSpec(
            id="p-indep", name="独立节点",
            nodes=[
                _make_node("a", "task a"),
                _make_node("b", "task b: 失败"),
                _make_node("c", "task c: 依赖 b", depends_on=["b"]),
                _make_node("d", "task d: 独立"),
            ],
        )

        async def _test():
            with patch("engines.worker.engine.AgentWorker") as MockWorker:
                call_count = 0

                def create_worker(*args, **kwargs):
                    nonlocal call_count
                    call_count += 1
                    mock = MagicMock()
                    mock._step_index = call_count

                    async def fake_execute(*a, **kw):
                        task = a[0] if a else ""
                        if "b:" in task:
                            raise RuntimeError("B 失败")
                            yield
                        else:
                            yield json.dumps({"type": "worker.done", "data": {"reason": "ok"}})

                    mock.execute = fake_execute
                    return mock

                MockWorker.side_effect = create_worker

                events = []
                async for ev in engine.execute(pipeline, workspace, _make_mock_agent_fn()):
                    events.append(json.loads(ev))

            node_statuses = {}
            for e in events:
                if e["type"] == "pipeline.node_status":
                    node_statuses[e["data"]["node_id"]] = e["data"]["status"]

            # A 和 D 应该完成（同层并行，互不影响）
            assert node_statuses.get("a") == "complete"
            assert node_statuses.get("d") == "complete"
            # B 失败
            assert node_statuses.get("b") == "error"
            # C 被跳过
            assert node_statuses.get("c") == "skipped"

        _run(_test())


# =============================================================================
# E2E: 管道 CRUD + 执行
# =============================================================================


class TestPipelineCRUDE2E:
    """管道 CRUD 操作 E2E 测试。"""

    def test_create_and_get_pipeline(self, tmp_path):
        """创建管道 → 获取详情。"""
        from api.pipelines import _pipelines, PipelineCreateRequest, NodeCreateRequest
        from api.pipelines import create_pipeline, get_pipeline, _pipelines as store

        # 清理
        store.clear()

        req = PipelineCreateRequest(
            name="测试管道",
            description="测试用",
            nodes=[
                NodeCreateRequest(id="a", title="A", task="task a"),
                NodeCreateRequest(id="b", title="B", task="task b", depends_on=["a"]),
            ],
        )

        async def _test():
            result = await create_pipeline(req)
            assert "id" in result
            assert result["name"] == "测试管道"
            assert result["node_count"] == 2

            # 获取详情
            detail = await get_pipeline(result["id"])
            assert detail["name"] == "测试管道"
            assert len(detail["nodes"]) == 2

        _run(_test())

    def test_list_pipelines(self, tmp_path):
        """创建多个管道 → 列出。"""
        from api.pipelines import _pipelines as store, PipelineCreateRequest, NodeCreateRequest
        from api.pipelines import create_pipeline, list_pipelines

        store.clear()

        async def _test():
            await create_pipeline(PipelineCreateRequest(
                name="管道1", nodes=[NodeCreateRequest(id="a", task="t")],
            ))
            await create_pipeline(PipelineCreateRequest(
                name="管道2", nodes=[NodeCreateRequest(id="b", task="t")],
            ))

            result = await list_pipelines()
            assert len(result) == 2

        _run(_test())

    def test_delete_pipeline(self, tmp_path):
        """创建 → 删除 → 获取 404。"""
        from api.pipelines import _pipelines as store, PipelineCreateRequest, NodeCreateRequest
        from api.pipelines import create_pipeline, delete_pipeline, get_pipeline
        from fastapi import HTTPException

        store.clear()

        async def _test():
            result = await create_pipeline(PipelineCreateRequest(
                name="待删除", nodes=[NodeCreateRequest(id="a", task="t")],
            ))
            pid = result["id"]

            del_result = await delete_pipeline(pid)
            assert del_result["status"] == "deleted"

            with pytest.raises(HTTPException) as exc_info:
                await get_pipeline(pid)
            assert exc_info.value.status_code == 404

        _run(_test())

    def test_invalid_pipeline_rejected(self, tmp_path):
        """无效管道创建被拒绝。"""
        from api.pipelines import PipelineCreateRequest, NodeCreateRequest, create_pipeline
        from fastapi import HTTPException

        async def _test():
            # 重复 ID
            req = PipelineCreateRequest(
                name="无效", nodes=[
                    NodeCreateRequest(id="a", task="t"),
                    NodeCreateRequest(id="a", task="t2"),  # 重复
                ],
            )
            with pytest.raises(HTTPException) as exc_info:
                await create_pipeline(req)
            assert exc_info.value.status_code == 400

        _run(_test())


# =============================================================================
# E2E: Coordinator 多 Agent 协作
# =============================================================================


class TestMultiAgentCoordinationE2E:
    """多 Agent 协调 E2E 测试。"""

    def test_two_agents_share_workspace(self, tmp_path):
        """两个 Agent 共享同一工作区，各自文件互见。"""
        from engines.worker.coordinator import WorkspaceCoordinator

        workspace = LocalWorkspace(str(tmp_path), "shared-test")
        coord = WorkspaceCoordinator(workspace)

        async def _test():
            # Agent A 写入文件
            async def agent_a():
                await workspace.write_file("a_output.md", "# Agent A 的输出")

            # Agent B 写入文件
            async def agent_b():
                await workspace.write_file("b_output.md", "# Agent B 的输出")

            # 并行执行
            await asyncio.gather(agent_a(), agent_b())

            # 验证两个文件都存在
            assert await workspace.exists("a_output.md")
            assert await workspace.exists("b_output.md")

            # Agent B 可以读取 Agent A 的文件
            content = await workspace.read_file("a_output.md")
            assert "Agent A" in content

        _run(_test())

    def test_file_lock_prevents_conflict(self, tmp_path):
        """文件锁防止并发写冲突。"""
        from engines.worker.coordinator import WorkspaceCoordinator

        workspace = LocalWorkspace(str(tmp_path), "lock-test")
        coord = WorkspaceCoordinator(workspace)
        write_order = []

        async def _test():
            async def writer(name, content, delay=0.05):
                acquired = await coord.lock("shared.md")
                if acquired:
                    write_order.append(f"{name}_start")
                    await workspace.write_file("shared.md", content)
                    await asyncio.sleep(delay)
                    write_order.append(f"{name}_end")
                    coord.unlock("shared.md")

            await asyncio.gather(
                writer("A", "content A"),
                writer("B", "content B"),
            )

            # 验证序列化
            assert len(write_order) == 4
            assert write_order[0].endswith("_start")
            assert write_order[1].endswith("_end")
            assert write_order[2].endswith("_start")
            assert write_order[3].endswith("_end")

        _run(_test())

    def test_dependency_wait_between_agents(self, tmp_path):
        """Agent B 等待 Agent A 创建文件后继续。"""
        from engines.worker.coordinator import WorkspaceCoordinator

        workspace = LocalWorkspace(str(tmp_path), "wait-test")
        coord = WorkspaceCoordinator(workspace)

        async def _test():
            results = []

            async def agent_a():
                await asyncio.sleep(0.2)
                await workspace.write_file("data.json", '{"result": 42}')
                results.append("A_done")

            async def agent_b():
                # 等待 data.json
                success = await coord.wait_for_files(["data.json"], timeout=5.0)
                if success:
                    content = await workspace.read_file("data.json")
                    data = json.loads(content)
                    results.append(f"B_read_{data['result']}")

            await asyncio.gather(agent_a(), agent_b())

            assert "A_done" in results
            assert "B_read_42" in results

        _run(_test())
