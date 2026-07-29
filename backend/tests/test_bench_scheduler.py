"""
BatchScheduler 单元测试 — Step T3 / Layer 2。
覆盖: 任务列表生成（27 条）、并发控制、超时处理、进度回调（Mock LLM）。
"""

import json
import tempfile

import pytest
import pytest_asyncio
from sqlalchemy import create_engine, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from db import Base
from models.bench_orm import BenchRun, BenchResult
from engines.bench.scheduler import (
    STD_AGENTS, STD_SCENARIOS, REPEAT_COUNT,
    _build_tick_context,
    run_bench_suite,
)


# =============================================================================
# DB fixtures
# =============================================================================

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
_TEST_DB_URL = f"sqlite+aiosqlite:///{_tmp_db.name}"
_SYNC_DB_URL = f"sqlite:///{_tmp_db.name}"


def _sync_create_tables():
    import models.bench_orm  # noqa: F401
    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


@pytest.fixture(autouse=True)
def setup_db():
    _sync_create_tables()
    yield


@pytest_asyncio.fixture
async def session():
    engine = create_async_engine(_TEST_DB_URL, connect_args={"check_same_thread": False})
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        yield s
    await engine.dispose()


# =============================================================================
# Mock model client factory
# =============================================================================

class MockModelClient:
    """模拟 LLM 客户端——返回固定格式的响应。"""

    model_info = {"function_calling": True, "vision": False, "json_output": True}

    async def create(self, messages, **kw):
        from autogen_core.models import CreateResult, RequestUsage

        return CreateResult(
            finish_reason="stop",
            content="我觉得应该这样做。这是经过深思熟虑的决定。",
            usage=RequestUsage(prompt_tokens=10, completion_tokens=5),
            cached=False,
        )


class FailingModelClient:
    """模拟每个 tick 都无法调用 LLM。"""

    model_info = {"function_calling": True, "vision": False, "json_output": True}

    async def create(self, messages, **kw):
        raise ConnectionError("mock LLM unavailable")


def _mock_factory_factory(api_key, base_url, model):
    """model_client_factory 的 Mock 实现。"""
    return MockModelClient()


def _bad_factory_factory(api_key, base_url, model):
    """模拟连接失败。"""
    raise ConnectionError("无法连接到 LLM API")


def _failing_model_factory(api_key, base_url, model):
    """返回一个在生成阶段持续失败的 Mock 客户端。"""
    return FailingModelClient()


# =============================================================================
# Tests — 任务列表生成
# =============================================================================

class TestTaskGeneration:

    def test_std_agents_count(self):
        """标准 Agent 模板数量为 3。"""
        assert len(STD_AGENTS) == 3

    def test_std_scenarios_count(self):
        """标准场景数量为 3。"""
        assert len(STD_SCENARIOS) == 3

    def test_repeat_count(self):
        """重复次数为 3。"""
        assert REPEAT_COUNT == 3

    def test_total_tasks(self):
        """总任务数 = 3 × 3 × 3 = 27。"""
        total = len(STD_AGENTS) * len(STD_SCENARIOS) * REPEAT_COUNT
        assert total == 27

    def test_agent_templates_have_required_fields(self):
        """每个 Agent 模板有必填字段。"""
        for tpl in STD_AGENTS:
            assert "id" in tpl
            assert "name" in tpl
            assert "mbti" in tpl
            assert "big_five" in tpl
            assert "narrative" in tpl
            assert "decision_style" in tpl

    def test_scenario_fields(self):
        """每个场景有 name 和 description。"""
        for s in STD_SCENARIOS:
            assert s.name
            assert s.description

    def test_final_week_context_interpolates_remaining_seats(self):
        """期末周资源数量必须随 tick 变化，不能把表达式原样注入。"""
        final_week = next(s for s in STD_SCENARIOS if s.name == "期末周")

        context = _build_tick_context(final_week, 3)

        assert "图书馆剩余座位 50 个" in context
        assert "{max(" not in context

    def test_non_final_week_context_uses_weather(self):
        """非期末周场景使用普通天气上下文。"""
        registration = next(s for s in STD_SCENARIOS if s.name == "新生报到")

        context = _build_tick_context(registration, 2)

        assert "🌤️ 天气: 晴" in context


# =============================================================================
# Tests — run_bench_suite（集成测试，Mock LLM）
# =============================================================================

class TestRunBenchSuite:

    @pytest.mark.asyncio
    async def test_full_suite_completes(self, session):
        """完整套件 27 条全部执行完毕。"""
        run = BenchRun(
            id="test-run-001", name="Mock 评测",
            llm_api_key="sk-mock", llm_base_url="http://mock",
            llm_model="mock-model", status="running",
        )
        session.add(run)
        await session.commit()

        await run_bench_suite("test-run-001", session, _mock_factory_factory)

        # 验证 BenchRun 状态
        result = await session.execute(select(BenchRun).where(BenchRun.id == "test-run-001"))
        bench_run = result.scalar_one()
        assert bench_run.status == "done"
        assert bench_run.completed_tasks == 27
        assert bench_run.total_tasks == 27
        assert bench_run.scores_json is not None
        assert bench_run.llm_api_key == ""  # 安全：跑完即清除

    @pytest.mark.asyncio
    async def test_results_created(self, session):
        """每条评测产生一条 BenchResult。"""
        run = BenchRun(
            id="test-run-002", name="结果验证",
            llm_api_key="sk-mock", llm_base_url="http://mock",
            llm_model="mock-model",
        )
        session.add(run)
        await session.commit()

        await run_bench_suite("test-run-002", session, _mock_factory_factory)

        result = await session.execute(
            select(BenchResult).where(BenchResult.run_id == "test-run-002")
        )
        results = result.scalars().all()
        assert len(results) == 27

    @pytest.mark.asyncio
    async def test_scores_are_valid(self, session):
        """每条结果的分数在合理范围内。"""
        run = BenchRun(
            id="test-run-003", name="分数验证",
            llm_api_key="sk-mock", llm_base_url="http://mock",
            llm_model="mock-model",
        )
        session.add(run)
        await session.commit()

        await run_bench_suite("test-run-003", session, _mock_factory_factory)

        result = await session.execute(
            select(BenchResult).where(BenchResult.run_id == "test-run-003")
        )
        for r in result.scalars().all():
            assert r.status == "done"
            scores = json.loads(r.scores_json)
            for dim, val in scores.items():
                assert 0 <= val <= 100, f"{dim}={val} 超出范围"

    @pytest.mark.asyncio
    async def test_aggregated_scores(self, session):
        """聚合后的平均分写入 BenchRun.scores_json。"""
        run = BenchRun(
            id="test-run-004", name="聚合验证",
            llm_api_key="sk-mock", llm_base_url="http://mock",
            llm_model="mock-model",
        )
        session.add(run)
        await session.commit()

        await run_bench_suite("test-run-004", session, _mock_factory_factory)

        result = await session.execute(select(BenchRun).where(BenchRun.id == "test-run-004"))
        bench_run = result.scalar_one()
        agg = json.loads(bench_run.scores_json)
        assert "人格一致性" in agg
        assert "决策质量" in agg
        assert "鲁棒性" in agg

    @pytest.mark.asyncio
    async def test_report_generated(self, session):
        """报告生成（LLM 不可用时用规则兜底）。"""
        run = BenchRun(
            id="test-run-005", name="报告验证",
            llm_api_key="sk-mock", llm_base_url="http://mock",
            llm_model="mock-model",
        )
        session.add(run)
        await session.commit()

        await run_bench_suite("test-run-005", session, _mock_factory_factory)

        result = await session.execute(select(BenchRun).where(BenchRun.id == "test-run-005"))
        bench_run = result.scalar_one()
        assert bench_run.report is not None
        assert len(bench_run.report) > 0

    @pytest.mark.asyncio
    async def test_nonexistent_run_raises(self, session):
        """不存在的 run_id 抛异常。"""
        with pytest.raises(ValueError, match="not found"):
            await run_bench_suite("nonexistent-id", session, _mock_factory_factory)

    @pytest.mark.asyncio
    async def test_connection_failure(self, session):
        """LLM 连接失败时标记为 failed。"""
        run = BenchRun(
            id="test-run-006", name="连接失败测试",
            llm_api_key="sk-bad", llm_base_url="http://bad",
            llm_model="bad-model",
        )
        session.add(run)
        await session.commit()

        await run_bench_suite("test-run-006", session, _bad_factory_factory)

        result = await session.execute(select(BenchRun).where(BenchRun.id == "test-run-006"))
        bench_run = result.scalar_one()
        assert bench_run.status == "failed"
        assert "LLM 连接失败" in bench_run.report

    @pytest.mark.asyncio
    async def test_all_tick_failures_are_persisted_as_zero_score_failures(
        self,
        session,
        monkeypatch,
    ):
        """所有 tick 失败时，子任务与整次评测都必须明确失败。"""
        from engines.bench import reporter

        async def _mock_report(scores, task_count):
            return "Mock failure report"

        monkeypatch.setattr(reporter, "generate_report", _mock_report)
        run = BenchRun(
            id="test-run-all-failed",
            name="全失败验证",
            llm_api_key="sk-mock",
            llm_base_url="http://mock",
            llm_model="mock-model",
        )
        session.add(run)
        await session.commit()

        await run_bench_suite(
            "test-run-all-failed",
            session,
            _failing_model_factory,
        )

        run_result = await session.execute(
            select(BenchRun).where(BenchRun.id == "test-run-all-failed")
        )
        bench_run = run_result.scalar_one()
        result_rows = await session.execute(
            select(BenchResult).where(
                BenchResult.run_id == "test-run-all-failed"
            )
        )
        rows = result_rows.scalars().all()
        zero_scores = {
            "人格一致性": 0.0,
            "决策质量": 0.0,
            "交互深度": 0.0,
            "鲁棒性": 0.0,
            "创造力": 0.0,
            "适应性": 0.0,
        }

        assert bench_run.status == "failed"
        assert bench_run.completed_tasks == 27
        assert bench_run.llm_api_key == ""
        assert len(rows) == 27
        assert all(row.status == "failed" for row in rows)
        assert all(json.loads(row.scores_json) == zero_scores for row in rows)
        assert all("all 8 ticks failed" in (row.error or "") for row in rows)
