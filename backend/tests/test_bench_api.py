"""
Bench API 路由测试 — Step T3 / Layer 2。
覆盖: POST runs / GET runs / GET runs/{id} / DELETE / report / test-api。
"""

import tempfile

import pytest
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from api.bench import router as bench_router


# =============================================================================
# DB fixtures
# =============================================================================

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
_TEST_DB_URL = f"sqlite+aiosqlite:///{_tmp_db.name}"
_SYNC_DB_URL = f"sqlite:///{_tmp_db.name}"


def _sync_create_tables():
    from db import Base
    import models.bench_orm  # noqa: F401

    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


def _set_run_status(run_id: str, status: str) -> None:
    """通过独立同步会话模拟后台任务完成。"""
    from models.bench_orm import BenchRun

    engine = create_engine(_SYNC_DB_URL)
    with Session(engine) as session:
        run = session.get(BenchRun, run_id)
        assert run is not None
        run.status = status
        session.commit()
    engine.dispose()


@asynccontextmanager
async def _test_lifespan(app):
    from db import init_db
    await init_db()
    yield


@pytest.fixture(autouse=True)
def _setup_db():
    from db import reset_db_state
    from config import settings

    reset_db_state()
    settings.database_url = _TEST_DB_URL
    _sync_create_tables()
    yield


@pytest.fixture
def app():
    app = FastAPI(lifespan=_test_lifespan)
    app.include_router(bench_router)
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


# =============================================================================
# Tests — POST /api/bench/runs
# =============================================================================

class TestCreateBenchRun:

    def test_create_success(self, client, monkeypatch):
        """创建评测任务成功。"""
        # Mock 后台任务，防止实际执行
        from fastapi import BackgroundTasks

        def mock_add_task(self, func, *args, **kwargs):
            pass  # 不执行后台任务

        monkeypatch.setattr(BackgroundTasks, "add_task", mock_add_task)

        resp = client.post("/api/bench/runs", json={
            "api_key": "sk-test", "base_url": "http://test", "model": "test-model",
            "name": "测试评测",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["name"] == "测试评测"
        assert data["status"] == "running"

    def test_create_missing_fields(self, client):
        """缺少必填字段返回 400。"""
        resp = client.post("/api/bench/runs", json={
            "api_key": "sk-test",
        })
        assert resp.status_code == 400

    def test_create_empty_body(self, client):
        """空 body 返回 400。"""
        resp = client.post("/api/bench/runs", json={})
        assert resp.status_code == 400


# =============================================================================
# Tests — GET /api/bench/runs
# =============================================================================

class TestListBenchRuns:

    def test_list_empty(self, client):
        """空列表。"""
        resp = client.get("/api/bench/runs")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_after_create(self, client, monkeypatch):
        """创建后可列出。"""
        from fastapi import BackgroundTasks
        monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, *a, **kw: None)

        client.post("/api/bench/runs", json={
            "api_key": "sk", "base_url": "http://t", "model": "m",
        })
        resp = client.get("/api/bench/runs")
        assert resp.status_code == 200
        runs = resp.json()
        assert len(runs) == 1
        assert runs[0]["status"] == "running"


# =============================================================================
# Tests — GET /api/bench/runs/{id}
# =============================================================================

class TestGetBenchRun:

    def test_get_nonexistent(self, client):
        """不存在的 run 返回 404。"""
        resp = client.get("/api/bench/runs/nonexistent-id")
        assert resp.status_code == 404

    def test_get_existing(self, client, monkeypatch):
        """获取存在的 run 详情（含空 results 列表）。"""
        from fastapi import BackgroundTasks
        monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, *a, **kw: None)

        create_resp = client.post("/api/bench/runs", json={
            "api_key": "sk", "base_url": "http://t", "model": "m",
        })
        run_id = create_resp.json()["id"]

        resp = client.get(f"/api/bench/runs/{run_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == run_id
        assert "results" in data
        assert isinstance(data["results"], list)


# =============================================================================
# Tests — DELETE /api/bench/runs/{id}
# =============================================================================

class TestDeleteBenchRun:

    def test_delete_completed_run(self, client, monkeypatch):
        """已完成的评测记录可以删除。"""
        from fastapi import BackgroundTasks
        monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, *a, **kw: None)

        create_resp = client.post("/api/bench/runs", json={
            "api_key": "sk", "base_url": "http://t", "model": "m",
        })
        run_id = create_resp.json()["id"]
        _set_run_status(run_id, "done")

        resp = client.delete(f"/api/bench/runs/{run_id}")
        assert resp.status_code == 204

        # 确认已删除
        get_resp = client.get(f"/api/bench/runs/{run_id}")
        assert get_resp.status_code == 404

    def test_delete_running_run_rejected(self, client, monkeypatch):
        """运行中的评测不可删除，防止后台产生孤立结果。"""
        from fastapi import BackgroundTasks

        monkeypatch.setattr(
            BackgroundTasks,
            "add_task",
            lambda self, *a, **kw: None,
        )
        create_resp = client.post("/api/bench/runs", json={
            "api_key": "sk",
            "base_url": "http://t",
            "model": "m",
        })
        run_id = create_resp.json()["id"]

        response = client.delete(f"/api/bench/runs/{run_id}")

        assert response.status_code == 409
        assert "运行中的评测不可删除" in response.json()["detail"]
        assert client.get(f"/api/bench/runs/{run_id}").status_code == 200

    def test_delete_nonexistent(self, client):
        """删除不存在的记录返回 404。"""
        resp = client.delete("/api/bench/runs/fake-id")
        assert resp.status_code == 404


# =============================================================================
# Tests — GET /api/bench/runs/{id}/report
# =============================================================================

class TestGetReport:

    def test_report_nonexistent(self, client):
        """不存在的 run 返回 404。"""
        resp = client.get("/api/bench/runs/fake-id/report")
        assert resp.status_code == 404

    def test_report_existing(self, client, monkeypatch):
        """获取存在的 run 报告（可能为空）。"""
        from fastapi import BackgroundTasks
        monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, *a, **kw: None)

        create_resp = client.post("/api/bench/runs", json={
            "api_key": "sk", "base_url": "http://t", "model": "m",
        })
        run_id = create_resp.json()["id"]

        resp = client.get(f"/api/bench/runs/{run_id}/report")
        assert resp.status_code == 200
        data = resp.json()
        assert "report" in data
        assert "scores" in data


# =============================================================================
# Tests — POST /api/bench/test-api
# =============================================================================

class TestTestApi:

    def test_missing_fields(self, client):
        """缺少必填字段返回 400。"""
        resp = client.post("/api/bench/test-api", json={})
        assert resp.status_code == 400

    def test_bad_connection(self, client):
        """无效 API 配置返回 ok=False。"""
        resp = client.post("/api/bench/test-api", json={
            "api_key": "sk-bad", "base_url": "http://127.0.0.1:1",
            "model": "bad-model",
        })
        assert resp.status_code == 200
        data = resp.json()
        # 连接应该失败
        assert data["ok"] is False or "error" in data
