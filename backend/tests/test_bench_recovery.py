"""Bench 后端重启恢复测试。"""

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from db import Base
from engines.bench.recovery import recover_interrupted_bench_runs
from models.bench_orm import BenchResult, BenchRun


@pytest_asyncio.fixture
async def session():
    """提供真实 SQLite 内存数据库会话。"""
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as db:
        yield db
    await engine.dispose()


@pytest.mark.asyncio
async def test_running_run_is_failed_without_losing_progress(session):
    """遗留运行任务应失败并清除 Key，同时保留进度和子结果。"""
    interrupted = BenchRun(
        id="interrupted",
        name="中断评测",
        llm_api_key="sk-sensitive",
        llm_base_url="https://provider.example",
        llm_model="test-model",
        status="running",
        total_tasks=27,
        completed_tasks=6,
    )
    completed = BenchRun(
        id="completed",
        name="完成评测",
        llm_model="test-model",
        status="done",
        total_tasks=27,
        completed_tasks=27,
        report="原报告",
    )
    child = BenchResult(
        id="result-1",
        run_id="interrupted",
        agent_template="agent-a",
        scenario="scenario-a",
        repeat_index=0,
        status="done",
    )
    session.add_all([interrupted, completed, child])
    await session.commit()

    recovered = await recover_interrupted_bench_runs(session)

    assert recovered == 1
    assert interrupted.status == "failed"
    assert interrupted.llm_api_key == ""
    assert interrupted.completed_tasks == 6
    assert "6/27" in str(interrupted.report)
    assert completed.status == "done"
    assert completed.report == "原报告"
    result = await session.execute(
        select(BenchResult).where(BenchResult.run_id == interrupted.id)
    )
    assert result.scalar_one().id == child.id


@pytest.mark.asyncio
async def test_no_running_runs_is_a_noop(session):
    """没有遗留运行任务时不修改数据库。"""
    failed = BenchRun(
        id="failed",
        name="已有失败",
        llm_model="test-model",
        status="failed",
        report="原失败原因",
    )
    session.add(failed)
    await session.commit()

    recovered = await recover_interrupted_bench_runs(session)

    assert recovered == 0
    assert failed.report == "原失败原因"


@pytest.mark.asyncio
async def test_app_lifespan_runs_bench_recovery(monkeypatch):
    """应用就绪前必须执行 Bench 中断恢复。"""
    import main

    calls: list[str] = []
    fake_db = object()

    async def fake_init_db():
        calls.append("init_db")

    async def fake_recover(db):
        assert db is fake_db
        calls.append("recover")
        return 0

    class FakeSessionContext:
        async def __aenter__(self):
            return fake_db

        async def __aexit__(self, exc_type, exc, traceback):
            return False

    monkeypatch.setattr(main, "ensure_dirs", lambda: calls.append("ensure_dirs"))
    monkeypatch.setattr(main, "init_db", fake_init_db)
    monkeypatch.setattr(main, "async_session", lambda: FakeSessionContext())
    monkeypatch.setattr(main, "recover_interrupted_bench_runs", fake_recover)

    async with main.lifespan(main.app):
        calls.append("ready")

    assert calls == ["ensure_dirs", "init_db", "recover", "ready"]
