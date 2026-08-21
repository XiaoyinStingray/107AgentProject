import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from api import workers as worker_api
from engines.worker import fork as fork_module


class _FakeAutogenAgent:
    async def on_messages(self, messages, cancellation_token=None):
        payload = {
            "options": [
                {"title": "先验证", "decision": "先核验来源", "rationale": "更稳"},
                {"title": "先成稿", "decision": "先写最小版本", "rationale": "更快"},
                {"title": "做对照", "decision": "整理正反证据", "rationale": "更全面"},
            ]
        }
        return SimpleNamespace(
            chat_message=SimpleNamespace(content=f"```json\n{json.dumps(payload, ensure_ascii=False)}\n```")
        )


class _FakeLifeAgent:
    persona = SimpleNamespace(name="岳书妍")
    autogen_agent = _FakeAutogenAgent()


@pytest.fixture
def isolated_decision_logs(tmp_path, monkeypatch):
    decision_dir = tmp_path / "decision-logs"
    monkeypatch.setattr(fork_module, "DECISION_LOG_DIR", decision_dir)
    return decision_dir


@pytest.mark.anyio
async def test_generate_fork_options_returns_three_clean_routes():
    options = await fork_module.generate_fork_options(
        agent=_FakeLifeAgent(),
        task="整理高数复习方案",
        fork_point_step=2,
        decision_log=[
            {"step_index": 1, "action": "tool_call", "reason": "搜索资料"},
            {"step_index": 2, "action": "tool_call", "reason": "写入文件"},
        ],
    )

    assert [item["title"] for item in options] == ["先验证", "先成稿", "做对照"]
    assert all(item["decision"] for item in options)


@pytest.mark.anyio
async def test_fork_uses_one_run_id_for_registry_workspace_and_events(
    tmp_path,
    isolated_decision_logs,
):
    fork_module.save_decision_step("run-original", 1, "tool_call", "搜索资料", "web_search")

    fork_run_id, worker = await fork_module.fork_from_checkpoint(
        original_run_id="run-original",
        fork_point_step=1,
        alternative_decision="跳过泛搜，直接核验指定来源",
        agent=_FakeLifeAgent(),
        task="整理高数复习方案",
        base_dir=tmp_path / "workspaces",
    )

    assert worker.run_id == fork_run_id
    assert Path(worker._workspace.root).name == fork_run_id
    assert worker._fork_point == 1  # type: ignore[attr-defined]
    assert worker._fork_decision.startswith("跳过泛搜")  # type: ignore[attr-defined]


def test_snapshot_reconstruction_uses_version_present_before_decision(
    tmp_path,
    isolated_decision_logs,
):
    base_dir = tmp_path / "workspaces"
    run_dir = base_dir / "run-original"
    files_dir = run_dir / "files"
    snapshots_dir = run_dir / ".snapshots"
    files_dir.mkdir(parents=True)
    snapshots_dir.mkdir(parents=True)

    target_time = datetime.now().replace(microsecond=0)
    fork_module._log_path("run-original").write_text(
        json.dumps({
            "step_index": 2,
            "action": "tool_call",
            "reason": "改写报告",
            "timestamp": target_time.isoformat(),
        }, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    current = files_dir / "report.md"
    current.write_text("分叉之后的版本", encoding="utf-8")
    after = target_time + timedelta(seconds=20)
    os.utime(current, (after.timestamp(), after.timestamp()))

    snapshot = snapshots_dir / f"report.md---{after.strftime('%Y%m%d_%H%M%S')}"
    snapshot.write_text("分叉之前的版本", encoding="utf-8")
    before = target_time - timedelta(seconds=20)
    os.utime(snapshot, (before.timestamp(), before.timestamp()))

    reconstructed = fork_module.find_snapshot_at_step(
        "run-original",
        2,
        base_dir=base_dir,
    )

    assert reconstructed == {"report.md": snapshot}


@pytest.mark.anyio
async def test_legacy_worker_binding_preserves_existing_state_fields(tmp_path):
    state_dir = tmp_path / "run-legacy"
    state_dir.mkdir()
    state_file = state_dir / "worker_state.json"
    state_file.write_text(json.dumps({
        "run_id": "run-legacy",
        "agent_name": "岳书妍",
        "steps": 7,
        "state": "done",
        "custom_field": "keep-me",
    }, ensure_ascii=False), encoding="utf-8")
    entry = {
        "worker": None,
        "agent_id": "agent-yue",
        "agent_name": "岳书妍",
        "task": "旧任务",
        "running": False,
        "accepted": True,
        "created_at": "2026-08-14T10:00:00",
    }

    await worker_api._persist_worker_agent_binding(
        "run-legacy",
        entry,
        base_dir=str(tmp_path),
    )

    saved = json.loads(state_file.read_text(encoding="utf-8"))
    assert saved["agent_id"] == "agent-yue"
    assert saved["agent_name"] == "岳书妍"
    assert saved["steps"] == 7
    assert saved["custom_field"] == "keep-me"


@pytest.mark.anyio
async def test_bind_worker_agent_accepts_only_same_name(monkeypatch):
    legacy_entry = {
        "worker": None,
        "agent_id": "",
        "agent_name": "岳书妍",
        "task": "旧任务",
        "running": False,
        "accepted": False,
        "created_at": "2026-08-14T10:00:00",
    }
    monkeypatch.setitem(worker_api._active_workers, "run-legacy", legacy_entry)

    async def fake_load_agent(agent_id):
        assert agent_id == "agent-yue"
        return _FakeLifeAgent()

    persisted = []

    async def fake_persist(run_id, entry, base_dir=None):
        persisted.append((run_id, entry["agent_id"]))

    monkeypatch.setattr(worker_api, "_get_or_create_agent", fake_load_agent)
    monkeypatch.setattr(worker_api, "_persist_worker_agent_binding", fake_persist)

    result = await worker_api.bind_worker_agent(
        "run-legacy",
        worker_api.BindWorkerAgentRequest(agent_id="agent-yue"),
    )

    assert result["bound"] is True
    assert legacy_entry["agent_id"] == "agent-yue"
    assert persisted == [("run-legacy", "agent-yue")]

    legacy_entry["agent_id"] = ""
    legacy_entry["agent_name"] = "另一个人"
    with pytest.raises(HTTPException) as exc_info:
        await worker_api.bind_worker_agent(
            "run-legacy",
            worker_api.BindWorkerAgentRequest(agent_id="agent-yue"),
        )
    assert exc_info.value.status_code == 409
