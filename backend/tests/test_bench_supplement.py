"""
Bench API 补充测试 — M10 模块测试。
覆盖: 模板 CRUD / 取消评测 / 分场景雷达 / 评分诊断 / 劣化检测 / Agent 指纹。
"""

import json
import tempfile

import pytest
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from api.bench import router as bench_router


# =============================================================================
# DB fixtures（复用 test_bench_api 模式）
# =============================================================================

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
_TEST_DB_URL = f"sqlite+aiosqlite:///{_tmp_db.name}"
_SYNC_DB_URL = f"sqlite:///{_tmp_db.name}"


def _sync_create_tables():
    from db import Base
    import models.bench_orm  # noqa: F401
    import models.agent_orm  # noqa: F401

    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


def _set_run_status(run_id: str, status: str) -> None:
    from models.bench_orm import BenchRun

    engine = create_engine(_SYNC_DB_URL)
    from sqlalchemy.orm import Session
    with Session(engine) as session:
        run = session.get(BenchRun, run_id)
        if run:
            run.status = status
            session.commit()
    engine.dispose()


def _insert_done_run(run_id: str, model: str, scores: dict) -> None:
    """直接插入一条 done 状态的 BenchRun。"""
    from models.bench_orm import BenchRun

    engine = create_engine(_SYNC_DB_URL)
    from sqlalchemy.orm import Session
    with Session(engine) as session:
        run = BenchRun(
            id=run_id, name=f"评测-{run_id}",
            llm_model=model, status="done",
            total_tasks=27, completed_tasks=27,
            scores_json=json.dumps(scores, ensure_ascii=False),
            report="测试报告",
        )
        session.add(run)
        session.commit()
    engine.dispose()


def _insert_result(result_id: str, run_id: str, agent: str, scenario: str,
                   scores: dict, events: list | None = None) -> None:
    from models.bench_orm import BenchResult

    engine = create_engine(_SYNC_DB_URL)
    from sqlalchemy.orm import Session
    with Session(engine) as session:
        br = BenchResult(
            id=result_id, run_id=run_id,
            agent_template=agent, scenario=scenario,
            repeat_index=0, status="done",
            scores_json=json.dumps(scores, ensure_ascii=False),
            events_json=json.dumps(events or [], ensure_ascii=False),
        )
        session.add(br)
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
def client():
    app = FastAPI(lifespan=_test_lifespan)
    app.include_router(bench_router)
    with TestClient(app) as c:
        yield c


# =============================================================================
# Tests — 模板 CRUD
# =============================================================================

class TestTemplateCRUD:

    def test_list_templates_empty(self, client):
        """空模板列表。"""
        resp = client.get("/api/bench/templates")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_create_template(self, client):
        """创建模板成功。"""
        resp = client.post("/api/bench/templates", json={
            "name": "快速测试",
            "agents": [{"id": "a1", "name": "Agent1"}],
            "scenarios": [{"name": "期末周"}],
            "repeats": 2,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == "快速测试"
        assert data["repeats"] == 2
        assert "id" in data

    def test_list_after_create(self, client):
        """创建后可列出。"""
        client.post("/api/bench/templates", json={"name": "T1", "agents": [], "scenarios": [], "repeats": 1})
        resp = client.get("/api/bench/templates")
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_delete_template(self, client):
        """删除模板。"""
        create_resp = client.post("/api/bench/templates", json={"name": "T-del"})
        tpl_id = create_resp.json()["id"]

        resp = client.delete(f"/api/bench/templates/{tpl_id}")
        assert resp.status_code == 204

        # 确认已删除
        list_resp = client.get("/api/bench/templates")
        assert len(list_resp.json()) == 0

    def test_delete_nonexistent_template(self, client):
        """删除不存在的模板返回 204（幂等）。"""
        resp = client.delete("/api/bench/templates/nonexistent-id")
        assert resp.status_code == 204


# =============================================================================
# Tests — 取消评测
# =============================================================================

class TestCancelBenchRun:

    def test_cancel_running(self, client, monkeypatch):
        """取消运行中的评测。"""
        from fastapi import BackgroundTasks
        monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, *a, **kw: None)

        create_resp = client.post("/api/bench/runs", json={
            "api_key": "sk", "base_url": "http://t", "model": "m",
        })
        run_id = create_resp.json()["id"]

        resp = client.post(f"/api/bench/runs/{run_id}/cancel")
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

    def test_cancel_nonexistent(self, client):
        """取消不存在的评测返回 404。"""
        resp = client.post("/api/bench/runs/fake-id/cancel")
        assert resp.status_code == 404

    def test_cancel_completed_rejected(self, client, monkeypatch):
        """已完成的评测不可取消。"""
        from fastapi import BackgroundTasks
        monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, *a, **kw: None)

        create_resp = client.post("/api/bench/runs", json={
            "api_key": "sk", "base_url": "http://t", "model": "m",
        })
        run_id = create_resp.json()["id"]
        _set_run_status(run_id, "done")

        resp = client.post(f"/api/bench/runs/{run_id}/cancel")
        assert resp.status_code == 400


# =============================================================================
# Tests — 分场景雷达
# =============================================================================

class TestByScenario:

    def test_by_scenario_nonexistent(self, client):
        """不存在的 run 返回 404。"""
        resp = client.get("/api/bench/runs/fake-id/by-scenario")
        assert resp.status_code == 404

    def test_by_scenario_with_results(self, client, monkeypatch):
        """按场景分组返回雷达数据。"""
        from fastapi import BackgroundTasks
        monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, *a, **kw: None)

        create_resp = client.post("/api/bench/runs", json={
            "api_key": "sk", "base_url": "http://t", "model": "m",
        })
        run_id = create_resp.json()["id"]
        _set_run_status(run_id, "done")

        scores = {"人格一致性": 80, "决策质量": 70, "交互深度": 60,
                  "鲁棒性": 85, "创造力": 50, "适应性": 65}
        _insert_result("res-s1", run_id, "小明", "期末周", scores,
                       events=[{"type": "thought_stream", "content": "思考"}])
        _insert_result("res-s2", run_id, "小明", "新生报到", scores,
                       events=[{"type": "agent_message", "content": "你好"}])

        resp = client.get(f"/api/bench/runs/{run_id}/by-scenario")
        assert resp.status_code == 200
        data = resp.json()
        assert data["run_id"] == run_id
        assert "期末周" in data["scenarios"]
        assert "新生报到" in data["scenarios"]


# =============================================================================
# Tests — 评分诊断
# =============================================================================

class TestFingerprintDiagnosis:

    def test_fingerprint_empty_run(self, client, monkeypatch):
        """无子结果的评测返回空诊断。"""
        from fastapi import BackgroundTasks
        monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, *a, **kw: None)

        create_resp = client.post("/api/bench/runs", json={
            "api_key": "sk", "base_url": "http://t", "model": "m",
        })
        run_id = create_resp.json()["id"]

        resp = client.get(f"/api/bench/runs/{run_id}/fingerprint")
        assert resp.status_code == 200
        data = resp.json()
        assert "agents" in data

    def test_fingerprint_with_events(self, client, monkeypatch):
        """有事件数据时返回诊断信息。"""
        from fastapi import BackgroundTasks
        monkeypatch.setattr(BackgroundTasks, "add_task", lambda self, *a, **kw: None)

        create_resp = client.post("/api/bench/runs", json={
            "api_key": "sk", "base_url": "http://t", "model": "m",
        })
        run_id = create_resp.json()["id"]

        events = [
            {"type": "thought_stream", "content": f"思考{i}"} for i in range(5)
        ]
        scores = {"人格一致性": 80, "决策质量": 70, "交互深度": 60,
                  "鲁棒性": 85, "创造力": 50, "适应性": 65}
        _insert_result("res-fp1", run_id, "小明", "期末周", scores, events=events)

        resp = client.get(f"/api/bench/runs/{run_id}/fingerprint")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_agents"] >= 1


# =============================================================================
# Tests — 劣化检测
# =============================================================================

class TestDegradation:

    def test_degradation_empty(self, client):
        """无评测记录时返回空。"""
        resp = client.get("/api/bench/degradation")
        assert resp.status_code == 200
        assert resp.json() == {}

    def test_degradation_with_data(self, client):
        """有已完成评测时返回劣化分析。"""
        scores = {"人格一致性": 80, "决策质量": 70, "交互深度": 60,
                  "鲁棒性": 85, "创造力": 50, "适应性": 65}
        _insert_done_run("run-deg-1", "model-a", scores)

        resp = client.get("/api/bench/degradation")
        assert resp.status_code == 200
        data = resp.json()
        assert "model-a" in data
        assert "points" in data["model-a"]


# =============================================================================
# Tests — Agent 行为指纹
# =============================================================================

class TestAgentFingerprint:

    def test_agent_fingerprint_nonexistent(self, client):
        """不存在的 Agent 返回 404。"""
        resp = client.get("/api/bench/agents/nonexistent/fingerprint")
        assert resp.status_code == 404

    def test_agent_fingerprint_empty(self, client):
        """存在但无指纹的 Agent 返回空指纹。"""
        from models.agent_orm import AgentRow
        engine = create_engine(_SYNC_DB_URL)
        from sqlalchemy.orm import Session
        with Session(engine) as session:
            agent = AgentRow(id="agent-fp-test", name="测试Agent")
            session.add(agent)
            session.commit()
        engine.dispose()

        resp = client.get("/api/bench/agents/agent-fp-test/fingerprint")
        assert resp.status_code == 200
        data = resp.json()
        assert data["agent_id"] == "agent-fp-test"
        assert data["fingerprint"] == {}


# =============================================================================
# Tests — 对战端点基本验证
# =============================================================================

class TestDuelEndpoint:

    def test_duel_missing_fields(self, client):
        """缺少必填字段返回 422。"""
        resp = client.post("/api/bench/duel", json={})
        assert resp.status_code == 422

    def test_duel_request_validation(self, client):
        """对战请求参数校验——max_steps 超出范围返回 422。"""
        resp = client.post("/api/bench/duel", json={
            "agent_a_id": "a",
            "agent_b_id": "b",
            "task": "讨论",
            "max_steps": 999,  # 超出 le=50 限制
        })
        assert resp.status_code == 422
