"""
Phase 15 E2E 全链路测试 — Step T3 / Layer 3。
使用真实 LLM API 验证 Bench 配置→评测→指标→报告 的完整链路。

运行方式:
    cd backend && PYTHONPATH=src python -m pytest tests/test_e2e_bench.py -v -s

注意: 需要 .env 中配置有效的 LLM API Key，否则跳过 E2E 测试。
"""

import json
import tempfile

import pytest
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from db import Base, reset_db_state
from config import settings
from api.bench import router as bench_router
from api.market import router as market_router
from api.teams import router as teams_router
from api.agents import router as agents_router, get_agent_factory
from models.bench_orm import BenchRun, BenchResult


# =============================================================================
# DB Setup
# =============================================================================

_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
_TEST_DB_URL = f"sqlite+aiosqlite:///{_tmp.name}"
_SYNC_DB_URL = f"sqlite:///{_tmp.name}"


def _sync_create_tables():
    from db import Base
    import models.agent_orm    # noqa: F401
    import models.world_orm    # noqa: F401
    import models.event        # noqa: F401
    import models.memory       # noqa: F401
    import models.team_orm     # noqa: F401
    import models.plan_orm     # noqa: F401
    import models.market_orm   # noqa: F401
    import models.bench_orm    # noqa: F401

    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


@asynccontextmanager
async def _test_lifespan(app):
    from db import init_db
    await init_db()
    yield


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture(scope="module")
def client():
    """模块级 fixture：启动一次 FastAPI app，所有测试共享。"""
    reset_db_state()
    settings.database_url = _TEST_DB_URL
    _sync_create_tables()

    app = FastAPI(lifespan=_test_lifespan)
    app.include_router(agents_router)
    app.include_router(teams_router)
    app.include_router(bench_router)
    app.include_router(market_router)

    with TestClient(app) as c:
        yield c


# =============================================================================
# E2E: Bench 全链路（真实 LLM）
# =============================================================================

@pytest.mark.skipif(
    not settings.llm_api_key,
    reason="需要真实 LLM API Key，跳过 E2E 测试"
)
class TestBenchFullChain:

    def test_bench_full_chain(self, client):
        """完整链路：创建 Run → 27 条评测 → 聚合分数 → 报告。

        使用真实 LLM API，通过 API 端点创建并等待完成。
        注意: 单次评测约 3 分钟，27 条并发约 5-8 分钟。
        """
        import time

        # 1. 创建评测任务（触发后台异步执行）
        resp = client.post("/api/bench/runs", json={
            "api_key": settings.llm_api_key,
            "base_url": settings.llm_base_url,
            "model": settings.llm_model,
            "name": "E2E 评测（真实 LLM）",
        })
        assert resp.status_code == 201
        run_data = resp.json()
        run_id = run_data["id"]
        assert run_data["status"] == "running"
        print(f"\n[BENCH E2E] Run created: {run_id}")

        # 2. 轮询等待完成（最长 15 分钟）
        max_wait = 900  # 15 分钟
        interval = 15   # 每 15 秒轮询一次
        elapsed = 0
        while elapsed < max_wait:
            time.sleep(interval)
            elapsed += interval

            resp = client.get(f"/api/bench/runs/{run_id}")
            assert resp.status_code == 200
            data = resp.json()
            completed = data.get("completed_tasks", 0)
            total = data.get("total_tasks", 27)
            status = data.get("status", "unknown")
            print(f"[BENCH E2E] {elapsed}s: status={status}, progress={completed}/{total}")

            if status in ("done", "failed"):
                break

        assert status == "done", f"评测应在 15 分钟内完成，实际状态: {status}"

        # 3. 验证 BenchRun 最终状态
        resp = client.get(f"/api/bench/runs/{run_id}")
        assert resp.status_code == 200
        final = resp.json()
        assert final["status"] == "done"
        assert final["completed_tasks"] == 27
        assert final["total_tasks"] == 27
        assert final["scores"] is not None

        # 4. 验证聚合分数——六维均在合理范围
        scores = final["scores"]
        for dim in ["人格一致性", "决策质量", "交互深度", "鲁棒性", "创造力", "适应性"]:
            assert dim in scores, f"缺少维度: {dim}"
            assert 0 <= scores[dim] <= 100, f"{dim}={scores[dim]} 超出范围"

        # 5. 验证报告已生成
        assert final.get("report") is not None
        assert len(final["report"]) > 50, "报告内容过短"

        # 6. 验证 27 条子结果
        results = final.get("results", [])
        assert len(results) == 27, f"应有 27 条子结果，实际: {len(results)}"

        done_count = sum(1 for r in results if r["status"] == "done")
        assert done_count >= 24, f"至少 24/27 条应成功，实际: {done_count}"

        for r in results:
            if r["status"] == "done":
                assert r["scores"] is not None
                for dim, val in r["scores"].items():
                    assert 0 <= val <= 100, f"{dim}={val} 超出范围"

        # 7. 验证报告端点
        resp = client.get(f"/api/bench/runs/{run_id}/report")
        assert resp.status_code == 200
        report_data = resp.json()
        assert report_data["report"] is not None
        assert report_data["scores"] is not None

        print(f"[BENCH E2E] ✅ 全链路通过: {done_count}/27 成功")
        print(f"[BENCH E2E] 聚合分数: {json.dumps(scores, ensure_ascii=False)}")


# =============================================================================
# E2E: A+B 交叉回归（不需要 LLM）
# =============================================================================

class TestCrossRegression:

    def test_teams_and_bench_tables_coexist(self, client):
        """Team 和 Bench 表无冲突——两个 router 同时注册。"""
        resp = client.get("/api/teams")
        assert resp.status_code == 200

        resp = client.get("/api/bench/runs")
        assert resp.status_code == 200

    def test_market_endpoint_available(self, client):
        """Market 端点可用。"""
        resp = client.get("/api/market")
        assert resp.status_code == 200

    def test_bench_endpoint_returns_list(self, client):
        """Bench 列表端点返回数组。"""
        resp = client.get("/api/bench/runs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
