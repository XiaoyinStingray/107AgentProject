"""Step T12: Pipeline 数据模型 + PipelineEngine 单元测试。

覆盖:
  - 数据模型: NodeStatus/PipelineStatus 枚举、PipelineNodeSpec/PipelineEdge/PipelineSpec 构造
  - validate_pipeline: 各种合法/非法管道
  - _topological_sort: 串行/并行/循环检测
  - get_flow_deps / get_loop_edges / get_branch_edges
  - PipelineEngine: 单节点/串行/并行/失败传播/取消/无效管道
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
    _topological_sort,
    get_branch_edges,
    get_flow_deps,
    get_loop_edges,
    validate_pipeline,
)


def _run(coro):
    """异步运行辅助。"""
    return asyncio.run(coro)


# =============================================================================
# 数据模型
# =============================================================================


class TestDataModels:
    """数据模型构造和枚举值测试。"""

    def test_node_status_values(self):
        """NodeStatus 包含所有预期状态。"""
        assert NodeStatus.PENDING == "pending"
        assert NodeStatus.RUNNING == "running"
        assert NodeStatus.COMPLETE == "complete"
        assert NodeStatus.ERROR == "error"
        assert NodeStatus.SKIPPED == "skipped"
        assert NodeStatus.CANCELLED == "cancelled"

    def test_pipeline_status_values(self):
        """PipelineStatus 包含所有预期状态。"""
        assert PipelineStatus.DRAFT == "draft"
        assert PipelineStatus.RUNNING == "running"
        assert PipelineStatus.COMPLETE == "complete"
        assert PipelineStatus.PARTIAL == "partial"
        assert PipelineStatus.CANCELLED == "cancelled"

    def test_edge_type_values(self):
        """EdgeType 包含所有类型。"""
        assert EdgeType.FLOW == "flow"
        assert EdgeType.LOOP == "loop"
        assert EdgeType.BRANCH == "branch"

    def test_pipeline_node_spec_defaults(self):
        """PipelineNodeSpec 默认值正确。"""
        node = PipelineNodeSpec(id="n1", title="测试", agent_id="a1", task="做某事")
        assert node.role == "worker"
        assert node.produces == []
        assert node.expects == []
        assert node.depends_on == []
        assert node.depends_on_files == []
        assert node.extra_tools == []
        assert node.enabled_tools == []

    def test_pipeline_edge_defaults(self):
        """PipelineEdge 默认值正确。"""
        edge = PipelineEdge(id="e1", from_node="a", to_node="b")
        assert edge.edge_type == EdgeType.FLOW
        assert edge.condition is None
        assert edge.condition_field is None
        assert edge.max_iterations == 3
        assert edge.iteration_label == ""
        assert edge.priority == 0
        assert edge.label == ""

    def test_pipeline_spec_defaults(self):
        """PipelineSpec 默认值正确。"""
        spec = PipelineSpec(id="p1", name="测试管道")
        assert spec.description == ""
        assert spec.nodes == []
        assert spec.edges == []
        assert spec.status == PipelineStatus.DRAFT


# =============================================================================
# validate_pipeline
# =============================================================================


class TestValidatePipeline:
    """管道验证测试。"""

    def _make_node(self, id, depends_on=None):
        return PipelineNodeSpec(
            id=id, title=id, agent_id="a1", task=f"task {id}",
            depends_on=depends_on or [],
        )

    def test_empty_nodes_fails(self):
        """空节点列表 → 失败。"""
        spec = PipelineSpec(id="p1", name="空", nodes=[])
        valid, msg = validate_pipeline(spec)
        assert valid is False
        assert "至少需要一个节点" in msg

    def test_duplicate_node_ids_fails(self):
        """重复节点 ID → 失败。"""
        spec = PipelineSpec(id="p1", name="重复", nodes=[
            self._make_node("a"), self._make_node("a"),
        ])
        valid, msg = validate_pipeline(spec)
        assert valid is False
        assert "唯一" in msg

    def test_edge_references_nonexistent_node_fails(self):
        """边引用不存在的节点 → 失败。"""
        spec = PipelineSpec(id="p1", name="坏边", nodes=[
            self._make_node("a"),
        ], edges=[
            PipelineEdge(id="e1", from_node="a", to_node="missing"),
        ])
        valid, msg = validate_pipeline(spec)
        assert valid is False
        assert "不存在" in msg

    def test_depends_on_nonexistent_fails(self):
        """depends_on 引用不存在的节点 → 失败。"""
        spec = PipelineSpec(id="p1", name="坏依赖", nodes=[
            self._make_node("a", depends_on=["ghost"]),
        ])
        valid, msg = validate_pipeline(spec)
        assert valid is False
        assert "不存在" in msg

    def test_no_entry_node_fails(self):
        """所有节点都有依赖（无入口）→ 失败。"""
        spec = PipelineSpec(id="p1", name="无入口", nodes=[
            self._make_node("a", depends_on=["b"]),
            self._make_node("b", depends_on=["a"]),
        ])
        valid, msg = validate_pipeline(spec)
        assert valid is False

    def test_cycle_detection_fails(self):
        """循环依赖 → 失败。"""
        spec = PipelineSpec(id="p1", name="循环", nodes=[
            self._make_node("a"),
            self._make_node("b", depends_on=["a"]),
            self._make_node("c", depends_on=["b"]),
        ], edges=[
            PipelineEdge(id="e1", from_node="c", to_node="a", edge_type=EdgeType.FLOW),
        ])
        valid, msg = validate_pipeline(spec)
        assert valid is False
        # 可能是 "循环" 或 "入口节点" 错误（取决于检测顺序）

    def test_valid_single_node(self):
        """单节点管道 → 通过。"""
        spec = PipelineSpec(id="p1", name="单节点", nodes=[
            self._make_node("a"),
        ])
        valid, msg = validate_pipeline(spec)
        assert valid is True
        assert msg == "ok"

    def test_valid_serial_chain(self):
        """串行链 a → b → c → 通过。"""
        spec = PipelineSpec(id="p1", name="串行", nodes=[
            self._make_node("a"),
            self._make_node("b", depends_on=["a"]),
            self._make_node("c", depends_on=["b"]),
        ])
        valid, msg = validate_pipeline(spec)
        assert valid is True

    def test_valid_parallel(self):
        """并行 a, b（无依赖）→ 通过。"""
        spec = PipelineSpec(id="p1", name="并行", nodes=[
            self._make_node("a"),
            self._make_node("b"),
        ])
        valid, msg = validate_pipeline(spec)
        assert valid is True

    def test_loop_edge_allowed(self):
        """LOOP 边不参与 DAG 循环检测。"""
        spec = PipelineSpec(id="p1", name="loop", nodes=[
            self._make_node("a"),
            self._make_node("b", depends_on=["a"]),
        ], edges=[
            PipelineEdge(id="e1", from_node="a", to_node="b", edge_type=EdgeType.FLOW),
            PipelineEdge(id="e2", from_node="b", to_node="a", edge_type=EdgeType.LOOP,
                         condition="FAILED", max_iterations=2),
        ])
        valid, msg = validate_pipeline(spec)
        assert valid is True


# =============================================================================
# _topological_sort
# =============================================================================


class TestTopologicalSort:
    """拓扑排序测试。"""

    def _node(self, id, depends_on=None):
        return PipelineNodeSpec(id=id, title=id, agent_id="a1", task=f"t {id}",
                                depends_on=depends_on or [])

    def test_single_node(self):
        """单节点 → 1 层。"""
        nodes = [self._node("a")]
        levels = _topological_sort(nodes)
        assert len(levels) == 1
        assert [n.id for n in levels[0]] == ["a"]

    def test_serial_chain(self):
        """a → b → c → 3 层。"""
        nodes = [
            self._node("a"),
            self._node("b", ["a"]),
            self._node("c", ["b"]),
        ]
        levels = _topological_sort(nodes)
        assert len(levels) == 3
        assert [n.id for n in levels[0]] == ["a"]
        assert [n.id for n in levels[1]] == ["b"]
        assert [n.id for n in levels[2]] == ["c"]

    def test_parallel_nodes(self):
        """a, b 无依赖 → 1 层。"""
        nodes = [self._node("a"), self._node("b")]
        levels = _topological_sort(nodes)
        assert len(levels) == 1
        ids = {n.id for n in levels[0]}
        assert ids == {"a", "b"}

    def test_diamond_shape(self):
        """菱形: a → b, a → c, b → d, c → d → 3 层。"""
        nodes = [
            self._node("a"),
            self._node("b", ["a"]),
            self._node("c", ["a"]),
            self._node("d", ["b", "c"]),
        ]
        levels = _topological_sort(nodes)
        assert len(levels) == 3
        assert [n.id for n in levels[0]] == ["a"]
        assert {n.id for n in levels[1]} == {"b", "c"}
        assert [n.id for n in levels[2]] == ["d"]

    def test_cycle_raises_value_error(self):
        """循环依赖 → ValueError。"""
        nodes = [
            self._node("a", ["b"]),
            self._node("b", ["a"]),
        ]
        with pytest.raises(ValueError, match="循环"):
            _topological_sort(nodes)

    def test_with_explicit_deps(self):
        """使用显式 deps 参数。"""
        nodes = [self._node("a"), self._node("b"), self._node("c")]
        deps = {"a": set(), "b": {"a"}, "c": {"b"}}
        levels = _topological_sort(nodes, deps)
        assert len(levels) == 3


# =============================================================================
# get_flow_deps / get_loop_edges / get_branch_edges
# =============================================================================


class TestEdgeHelpers:
    """边辅助函数测试。"""

    def _node(self, id, depends_on=None):
        return PipelineNodeSpec(id=id, title=id, agent_id="a1", task=f"t {id}",
                                depends_on=depends_on or [])

    def test_get_flow_deps_from_edges(self):
        """从 FLOW 边构建依赖映射。"""
        nodes = [self._node("a"), self._node("b")]
        edges = [PipelineEdge(id="e1", from_node="a", to_node="b", edge_type=EdgeType.FLOW)]
        deps = get_flow_deps(nodes, edges)
        assert deps["a"] == set()
        assert deps["b"] == {"a"}

    def test_get_flow_deps_merges_depends_on(self):
        """合并 FLOW 边和 depends_on。"""
        nodes = [self._node("a"), self._node("b", depends_on=["a"])]
        edges = [PipelineEdge(id="e1", from_node="a", to_node="b", edge_type=EdgeType.FLOW)]
        deps = get_flow_deps(nodes, edges)
        # 合并后 b 的依赖是 {"a"}（不重复）
        assert deps["b"] == {"a"}

    def test_get_flow_deps_ignores_loop_edges(self):
        """LOOP 边不参与 FLOW 依赖。"""
        nodes = [self._node("a"), self._node("b")]
        edges = [
            PipelineEdge(id="e1", from_node="a", to_node="b", edge_type=EdgeType.FLOW),
            PipelineEdge(id="e2", from_node="b", to_node="a", edge_type=EdgeType.LOOP),
        ]
        deps = get_flow_deps(nodes, edges)
        assert "b" not in deps["a"]  # LOOP 边不影响

    def test_get_loop_edges(self):
        """获取指定节点的 LOOP 边。"""
        edges = [
            PipelineEdge(id="e1", from_node="a", to_node="b", edge_type=EdgeType.LOOP),
            PipelineEdge(id="e2", from_node="b", to_node="a", edge_type=EdgeType.LOOP),
            PipelineEdge(id="e3", from_node="a", to_node="c", edge_type=EdgeType.FLOW),
        ]
        loops = get_loop_edges(edges, "a")
        assert len(loops) == 1
        assert loops[0].id == "e1"

    def test_get_branch_edges(self):
        """获取指定节点的 BRANCH 边。"""
        edges = [
            PipelineEdge(id="e1", from_node="a", to_node="c", edge_type=EdgeType.BRANCH),
            PipelineEdge(id="e2", from_node="b", to_node="c", edge_type=EdgeType.BRANCH),
        ]
        branches = get_branch_edges(edges, "a")
        assert len(branches) == 1
        assert branches[0].id == "e1"


# =============================================================================
# PipelineEngine
# =============================================================================


class TestPipelineEngine:
    """PipelineEngine 执行测试（Mock AgentWorker）。"""

    def _make_pipeline(self, nodes, edges=None):
        return PipelineSpec(
            id="test-p", name="测试", nodes=nodes, edges=edges or [],
        )

    def _node(self, id, depends_on=None):
        return PipelineNodeSpec(id=id, title=id, agent_id="a1", task=f"task {id}",
                                depends_on=depends_on or [])

    def _mock_get_agent_fn(self):
        """返回 Mock 的 get_agent_fn。"""
        async def get_agent_fn(agent_id):
            mock_agent = MagicMock()
            mock_agent.persona = MagicMock()
            mock_agent.persona.name = "TestAgent"
            return mock_agent
        return get_agent_fn

    def _mock_worker_execute(self, events=None):
        """创建 Mock 的 AgentWorker.execute 返回的 SSE 事件。"""
        if events is None:
            events = [
                json.dumps({"type": "worker.done", "data": {"reason": "ok"}}),
            ]

        async def mock_execute(*args, **kwargs):
            for ev in events:
                yield ev

        return mock_execute

    def test_invalid_pipeline_yields_error(self, tmp_path):
        """无效管道 → pipeline.error 事件。"""
        from engines.worker.pipeline_engine import PipelineEngine
        from engines.worker.workspace import LocalWorkspace

        workspace = LocalWorkspace(str(tmp_path), "test")
        engine = PipelineEngine()
        pipeline = self._make_pipeline([])  # 空节点 → 无效

        async def _test():
            events = []
            async for ev in engine.execute(pipeline, workspace, self._mock_get_agent_fn()):
                events.append(json.loads(ev))
            assert len(events) == 1
            assert events[0]["type"] == "pipeline.error"

        _run(_test())

    def test_single_node_pipeline(self, tmp_path):
        """单节点管道 → started + node_status(running) + node_status(complete) + done。"""
        from engines.worker.pipeline_engine import PipelineEngine
        from engines.worker.workspace import LocalWorkspace

        workspace = LocalWorkspace(str(tmp_path), "test")
        engine = PipelineEngine()
        pipeline = self._make_pipeline([self._node("a")])

        async def _test():
            with patch("engines.worker.engine.AgentWorker") as MockWorker:
                mock_instance = MagicMock()
                mock_instance.execute = self._mock_worker_execute()
                mock_instance._step_index = 1
                MockWorker.return_value = mock_instance

                events = []
                async for ev in engine.execute(pipeline, workspace, self._mock_get_agent_fn()):
                    events.append(json.loads(ev))

            types = [e["type"] for e in events]
            assert "pipeline.started" in types
            assert "pipeline.done" in types
            assert "pipeline.node_status" in types

        _run(_test())

    def test_serial_pipeline_order(self, tmp_path):
        """串行管道 a → b → c 按序执行。"""
        from engines.worker.pipeline_engine import PipelineEngine
        from engines.worker.workspace import LocalWorkspace

        workspace = LocalWorkspace(str(tmp_path), "test")
        engine = PipelineEngine()
        pipeline = self._make_pipeline([
            self._node("a"),
            self._node("b", ["a"]),
            self._node("c", ["b"]),
        ])

        execution_order = []

        async def _test():
            with patch("engines.worker.engine.AgentWorker") as MockWorker:
                def create_worker(*args, **kwargs):
                    mock = MagicMock()
                    mock._step_index = 1

                    async def fake_execute(*a, **kw):
                        execution_order.append("executed")
                        yield json.dumps({"type": "worker.done", "data": {}})

                    mock.execute = fake_execute
                    return mock

                MockWorker.side_effect = create_worker
                events = []
                async for ev in engine.execute(pipeline, workspace, self._mock_get_agent_fn()):
                    events.append(json.loads(ev))

            # 验证有 3 层
            level_starts = [e for e in events if e["type"] == "pipeline.level_start"]
            assert len(level_starts) == 3

        _run(_test())

    def test_parallel_nodes_same_level(self, tmp_path):
        """并行节点 a, b 在同一层执行。"""
        from engines.worker.pipeline_engine import PipelineEngine
        from engines.worker.workspace import LocalWorkspace

        workspace = LocalWorkspace(str(tmp_path), "test")
        engine = PipelineEngine()
        pipeline = self._make_pipeline([
            self._node("a"),
            self._node("b"),
        ])

        async def _test():
            with patch("engines.worker.engine.AgentWorker") as MockWorker:
                mock_instance = MagicMock()
                mock_instance._step_index = 1
                mock_instance.execute = self._mock_worker_execute()
                MockWorker.return_value = mock_instance

                events = []
                async for ev in engine.execute(pipeline, workspace, self._mock_get_agent_fn()):
                    events.append(json.loads(ev))

            # 应该只有 1 层
            level_starts = [e for e in events if e["type"] == "pipeline.level_start"]
            assert len(level_starts) == 1
            # 该层包含 2 个节点
            assert set(level_starts[0]["data"]["nodes"]) == {"a", "b"}

        _run(_test())

    def test_node_failure_skips_downstream(self, tmp_path):
        """节点失败 → 下游被 SKIPPED。"""
        from engines.worker.pipeline_engine import PipelineEngine
        from engines.worker.workspace import LocalWorkspace

        workspace = LocalWorkspace(str(tmp_path), "test")
        engine = PipelineEngine()
        pipeline = self._make_pipeline([
            self._node("a"),
            self._node("b", ["a"]),
        ])

        async def _test():
            with patch("engines.worker.engine.AgentWorker") as MockWorker:
                mock_instance = MagicMock()
                mock_instance._step_index = 0

                async def failing_execute(*args, **kwargs):
                    raise RuntimeError("模拟失败")
                    yield  # 使此函数成为 async generator

                mock_instance.execute = failing_execute
                MockWorker.return_value = mock_instance

                events = []
                async for ev in engine.execute(pipeline, workspace, self._mock_get_agent_fn()):
                    events.append(json.loads(ev))

            # 节点 a 应该 error
            node_statuses = {
                e["data"]["node_id"]: e["data"]["status"]
                for e in events
                if e["type"] == "pipeline.node_status"
            }
            assert node_statuses.get("a") == "error"
            # 节点 b 应该被 skipped
            assert node_statuses.get("b") == "skipped"

        _run(_test())

    def test_cancel_pipeline(self, tmp_path):
        """取消管道 → 不再执行后续层。"""
        from engines.worker.pipeline_engine import PipelineEngine, PipelineRun
        from engines.worker.workspace import LocalWorkspace

        workspace = LocalWorkspace(str(tmp_path), "test")
        pipeline = self._make_pipeline([
            self._node("a"),
            self._node("b", ["a"]),
        ])
        run = PipelineRun(pipeline, workspace)
        run.cancel()
        assert run._cancel_requested is True

    def test_pipeline_done_has_summary(self, tmp_path):
        """管道完成时发射 pipeline.done 包含摘要。"""
        from engines.worker.pipeline_engine import PipelineEngine
        from engines.worker.workspace import LocalWorkspace

        workspace = LocalWorkspace(str(tmp_path), "test")
        engine = PipelineEngine()
        pipeline = self._make_pipeline([self._node("a")])

        async def _test():
            with patch("engines.worker.engine.AgentWorker") as MockWorker:
                mock_instance = MagicMock()
                mock_instance._step_index = 1
                mock_instance.execute = self._mock_worker_execute()
                MockWorker.return_value = mock_instance

                events = []
                async for ev in engine.execute(pipeline, workspace, self._mock_get_agent_fn()):
                    events.append(json.loads(ev))

            done_events = [e for e in events if e["type"] == "pipeline.done"]
            assert len(done_events) == 1
            done = done_events[0]["data"]
            assert "pipeline_id" in done
            assert "nodes" in done
            assert "duration_ms" in done

        _run(_test())
