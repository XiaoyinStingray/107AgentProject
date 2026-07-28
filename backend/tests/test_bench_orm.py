"""
Bench ORM 单元测试 — Step T3 / Layer 2。
覆盖: BenchRun + BenchResult CRUD、scores_json 序列化、状态转换。
"""

import json
import tempfile

import pytest
import pytest_asyncio
from sqlalchemy import create_engine, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from db import Base
from models.bench_orm import BenchRun, BenchResult


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
# Tests — BenchRun
# =============================================================================

class TestBenchRunCRUD:

    @pytest.mark.asyncio
    async def test_create_and_read(self, session):
        """创建 BenchRun 后可读取。"""
        run = BenchRun(
            id="run-001", name="测试评测",
            llm_api_key="sk-test", llm_base_url="http://localhost",
            llm_model="test-model", status="running",
            total_tasks=27, completed_tasks=0,
        )
        session.add(run)
        await session.commit()

        result = await session.execute(select(BenchRun).where(BenchRun.id == "run-001"))
        row = result.scalar_one()
        assert row.name == "测试评测"
        assert row.status == "running"
        assert row.total_tasks == 27

    @pytest.mark.asyncio
    async def test_to_dict(self, session):
        """to_dict 序列化正确。"""
        run = BenchRun(
            id="run-002", name="序列化测试",
            llm_model="model-x", status="done",
            total_tasks=27, completed_tasks=27,
            scores_json=json.dumps({"人格一致性": 80, "决策质量": 70}),
        )
        session.add(run)
        await session.commit()

        result = await session.execute(select(BenchRun).where(BenchRun.id == "run-002"))
        row = result.scalar_one()
        d = row.to_dict()
        assert d["id"] == "run-002"
        assert d["status"] == "done"
        assert d["scores"]["人格一致性"] == 80

    @pytest.mark.asyncio
    async def test_status_transition(self, session):
        """状态转换: running → done。"""
        run = BenchRun(id="run-003", status="running")
        session.add(run)
        await session.commit()

        run.status = "done"
        await session.commit()

        result = await session.execute(select(BenchRun).where(BenchRun.id == "run-003"))
        row = result.scalar_one()
        assert row.status == "done"

    @pytest.mark.asyncio
    async def test_scores_json_nullable(self, session):
        """scores_json 可为 None。"""
        run = BenchRun(id="run-004", status="running", scores_json=None)
        session.add(run)
        await session.commit()

        result = await session.execute(select(BenchRun).where(BenchRun.id == "run-004"))
        row = result.scalar_one()
        d = row.to_dict()
        assert d["scores"] is None


# =============================================================================
# Tests — BenchResult
# =============================================================================

class TestBenchResultCRUD:

    @pytest.mark.asyncio
    async def test_create_and_read(self, session):
        """创建 BenchResult 后可读取。"""
        result_item = BenchResult(
            id="res-001", run_id="run-001",
            agent_template="学霸小明", scenario="期末周", repeat_index=0,
            scores_json=json.dumps({"人格一致性": 75, "创造力": 60}),
            status="done",
        )
        session.add(result_item)
        await session.commit()

        result = await session.execute(select(BenchResult).where(BenchResult.id == "res-001"))
        row = result.scalar_one()
        assert row.agent_template == "学霸小明"
        assert row.scenario == "期末周"
        assert row.repeat_index == 0

    @pytest.mark.asyncio
    async def test_to_dict_with_scores(self, session):
        """to_dict 正确解析 scores_json。"""
        scores = {"人格一致性": 85, "决策质量": 70, "交互深度": 65,
                  "鲁棒性": 90, "创造力": 55, "适应性": 75}
        result_item = BenchResult(
            id="res-002", run_id="run-001",
            scores_json=json.dumps(scores, ensure_ascii=False),
            status="done",
        )
        session.add(result_item)
        await session.commit()

        result = await session.execute(select(BenchResult).where(BenchResult.id == "res-002"))
        row = result.scalar_one()
        d = row.to_dict()
        assert d["scores"]["鲁棒性"] == 90
        assert d["status"] == "done"

    @pytest.mark.asyncio
    async def test_failed_result_with_error(self, session):
        """失败结果含 error 字段。"""
        result_item = BenchResult(
            id="res-003", run_id="run-001",
            status="failed", error="timeout after 30s",
            scores_json=None,
        )
        session.add(result_item)
        await session.commit()

        result = await session.execute(select(BenchResult).where(BenchResult.id == "res-003"))
        row = result.scalar_one()
        d = row.to_dict()
        assert d["status"] == "failed"
        assert d["error"] == "timeout after 30s"
        assert d["scores"] is None

    @pytest.mark.asyncio
    async def test_multiple_results_per_run(self, session):
        """同一 run_id 下多条结果。"""
        for i in range(5):
            session.add(BenchResult(
                id=f"res-batch-{i}", run_id="run-batch",
                agent_template=f"Agent-{i}", scenario="期末周",
                repeat_index=i % 3, status="done",
                scores_json=json.dumps({"人格一致性": 60 + i}),
            ))
        await session.commit()

        result = await session.execute(
            select(BenchResult).where(BenchResult.run_id == "run-batch")
        )
        rows = result.scalars().all()
        assert len(rows) == 5
