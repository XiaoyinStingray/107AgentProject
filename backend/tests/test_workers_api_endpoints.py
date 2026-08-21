"""
Worker API 端点防护测试 — 磁盘恢复条目的边界场景。

覆盖:
- GET /{run_id} 对 worker=None 的磁盘恢复条目不 crash
- POST /{run_id}/cancel 对 worker=None 的磁盘恢复条目安全返回
- GET /history 正确返回磁盘恢复条目的状态
- GET /{run_id}/events 对磁盘恢复条目返回空事件
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import workers as worker_api


@pytest.fixture(autouse=True)
def _clean_workers_registry():
    """每个测试前后清理 _active_workers，防止泄漏。"""
    saved = dict(worker_api._active_workers)
    worker_api._active_workers.clear()
    yield
    worker_api._active_workers.clear()
    worker_api._active_workers.update(saved)


@pytest.fixture()
def app():
    application = FastAPI()
    application.include_router(worker_api.router)
    return application


@pytest.fixture()
def client(app):
    return TestClient(app)


# =============================================================================
# 磁盘恢复条目 (worker=None)
# =============================================================================


class TestDiskRestoredWorkerEndpoints:
    """磁盘恢复条目的端点防护——worker=None 不 crash。"""

    def _make_restored_entry(self, run_id="restored-run-1"):
        """构造一个典型的磁盘恢复条目。"""
        entry = {
            "worker": None,
            "agent_id": "agent-abc",
            "agent_name": "测试Agent",
            "task": "写一份报告",
            "running": False,
            "accepted": False,
            "events": [],
            "created_at": "2026-08-18T00:00:00+00:00",
        }
        worker_api._active_workers[run_id] = entry
        return entry

    def test_get_worker_status_restored_entry(self, client):
        """GET /{run_id} 对磁盘恢复条目返回 done 状态而非 crash。"""
        self._make_restored_entry()
        resp = client.get("/api/workers/restored-run-1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["run_id"] == "restored-run-1"
        assert data["state"] == "done"
        assert data["agent_name"] == "测试Agent"
        assert data["task"] == "写一份报告"

    def test_get_worker_status_not_found(self, client):
        """GET /{run_id} 对不存在的 run_id 返回 404。"""
        resp = client.get("/api/workers/nonexistent")
        assert resp.status_code == 404

    def test_cancel_worker_restored_entry(self, client):
        """POST /{run_id}/cancel 对磁盘恢复条目安全返回 not_running。"""
        self._make_restored_entry()
        resp = client.post("/api/workers/restored-run-1/cancel")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "not_running"
        assert data["run_id"] == "restored-run-1"

    def test_cancel_worker_not_found(self, client):
        """POST /{run_id}/cancel 对不存在的 run_id 返回 404。"""
        resp = client.post("/api/workers/nonexistent/cancel")
        assert resp.status_code == 404

    def test_history_includes_restored_entries(self, client):
        """GET /history 包含磁盘恢复条目，state 显示为 done。"""
        self._make_restored_entry()
        resp = client.get("/api/workers/history")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        restored = [h for h in data if h["run_id"] == "restored-run-1"]
        assert len(restored) == 1
        assert restored[0]["state"] == "done"
        assert restored[0]["agent_name"] == "测试Agent"
        assert restored[0]["running"] is False

    def test_get_worker_events_restored_entry(self, client):
        """GET /{run_id}/events 对磁盘恢复条目返回空事件列表。"""
        self._make_restored_entry()
        resp = client.get("/api/workers/restored-run-1/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["run_id"] == "restored-run-1"
        assert data["events"] == []
        assert data["running"] is False

    def test_read_worker_file_restored_entry_fallback(self, client):
        """GET /{run_id}/files/{path} 对磁盘恢复条目尝试文件系统回退。"""
        self._make_restored_entry()
        # 工作区不存在 → 404
        resp = client.get("/api/workers/restored-run-1/files/test.txt")
        assert resp.status_code == 404


# =============================================================================
# 活跃 Worker (worker!=None) 的正常路径
# =============================================================================


class TestActiveWorkerEndpoints:
    """活跃 Worker 的正常端点行为。"""

    def _make_active_entry(self, run_id="active-run-1"):
        """构造一个活跃 Worker 条目。"""
        mock_worker = MagicMock()
        mock_worker.state = MagicMock()
        mock_worker.state.value = "executing"
        mock_worker.run_id = run_id
        mock_worker._step_index = 3
        mock_worker.cancel = MagicMock()

        entry = {
            "worker": mock_worker,
            "agent_id": "agent-xyz",
            "agent_name": "活跃Agent",
            "task": "搜索最新论文",
            "running": True,
            "accepted": False,
            "events": [{"type": "worker.started"}],
            "created_at": "2026-08-18T01:00:00+00:00",
        }
        worker_api._active_workers[run_id] = entry
        return entry, mock_worker

    def test_get_worker_status_active(self, client):
        """GET /{run_id} 对活跃 Worker 返回真实状态。"""
        _, mock_worker = self._make_active_entry()
        resp = client.get("/api/workers/active-run-1")
        assert resp.status_code == 200
        data = resp.json()
        assert data["state"] == "executing"
        assert data["agent_name"] == "活跃Agent"

    def test_cancel_worker_active(self, client):
        """POST /{run_id}/cancel 对活跃 Worker 调用 cancel()。"""
        _, mock_worker = self._make_active_entry()
        resp = client.post("/api/workers/active-run-1/cancel")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "cancelling"
        mock_worker.cancel.assert_called_once()

    def test_delete_worker(self, client):
        """DELETE /{run_id} 移除条目。"""
        self._make_active_entry()
        resp = client.delete("/api/workers/active-run-1")
        assert resp.status_code == 200
        assert "active-run-1" not in worker_api._active_workers

    def test_running_list_includes_active(self, client):
        """GET /running/list 包含活跃 Worker。"""
        self._make_active_entry()
        resp = client.get("/api/workers/running/list")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert any(w["run_id"] == "active-run-1" for w in data)
