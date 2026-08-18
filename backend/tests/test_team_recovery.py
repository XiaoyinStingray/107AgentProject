"""M9 部分完成恢复流程测试。"""

import json
from types import SimpleNamespace

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from db import Base
from engines.team import recovery
from models.agent_orm import AgentRow
from models.plan_orm import PlanRow
from models.team_orm import TeamRow


async def _make_recovery_case(tmp_path):
    db_path = tmp_path / "recovery.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    db = session_factory()
    agent = AgentRow(
        id="agent-yue",
        name="岳书妍",
        persona_json=json.dumps({"name": "岳书妍", "mbti": "ENFJ"}, ensure_ascii=False),
        background_json="{}",
        goals_json="[]",
        emotional_json="{}",
    )
    team = TeamRow.from_create(
        team_id="team-1",
        name="课程项目团队",
        description="完成课程选题报告",
        agent_ids=[agent.id],
        roles=[{"agent_id": agent.id, "role": "协调整合师", "reason": "测试"}],
    )
    team.status = "finished"
    steps = [{
        "id": "s1",
        "title": "整合报告",
        "assignee": agent.id,
        "assignee_name": "岳书妍",
        "description": "整理完整报告",
        "status": "error",
        "depends_on": [],
        "result": {
            "files": ["step_1_整合报告/work/files/output.md"],
            "error": "产物已保存，但最终格式解析失败",
            "recoverable": True,
            "artifact_status": "preserved",
        },
    }]
    plan = PlanRow.from_decomposition(
        plan_id="plan-1",
        team_id=team.id,
        task=team.description,
        steps=steps,
    )
    plan.status = "finished"
    db.add_all([agent, team, plan])
    await db.commit()

    run_root = tmp_path / "run-1"
    files_dir = run_root / "step_1_整合报告" / "work" / "files"
    files_dir.mkdir(parents=True)
    (files_dir / "output.md").write_text("# 已有报告\n\n内容完整。", encoding="utf-8")
    return engine, db, team, plan, run_root


@pytest.mark.asyncio
async def test_accept_preserved_artifact_updates_same_plan(tmp_path, monkeypatch):
    sql_engine, db, team, plan, run_root = await _make_recovery_case(tmp_path)
    monkeypatch.setattr(recovery, "_find_run_root", lambda *args: run_root)

    response = await recovery.recover_team_step(
        action="accept",
        team_row=team,
        plan_row=plan,
        step_id="s1",
        db=db,
        model_client=None,
    )

    updated = response["plan"]
    assert updated["id"] == "plan-1"
    assert updated["outcome"] == "success"
    assert updated["steps"][0]["status"] == "done"
    result = updated["steps"][0]["result"]
    assert result["accepted_with_warning"] is True
    assert result["artifact_status"] == "accepted"
    assert result["recovery_history"][-1]["action"] == "accept"
    assert "恢复与调整记录" in updated["report"]["content"]

    await db.close()
    await sql_engine.dispose()


@pytest.mark.asyncio
async def test_reaudit_passes_without_rerunning_worker(tmp_path, monkeypatch):
    sql_engine, db, team, plan, run_root = await _make_recovery_case(tmp_path)
    monkeypatch.setattr(recovery, "_find_run_root", lambda *args: run_root)

    class FakeAgent:
        class Persona:
            name = "岳书妍"

        persona = Persona()

    async def fake_get_agent(self, agent_id):
        return FakeAgent()

    async def fake_audit(self, task):
        assert "恢复要求" not in task
        assert "整理完整报告" in task
        return {
            "passed": True,
            "checked_constraints": [],
            "issues": [],
            "repair_instructions": "",
        }

    monkeypatch.setattr(recovery.TeamEngine, "_get_agent_instance", fake_get_agent)
    monkeypatch.setattr(recovery.AgentWorker, "_audit_delivery", fake_audit)

    response = await recovery.recover_team_step(
        action="reaudit",
        team_row=team,
        plan_row=plan,
        step_id="s1",
        db=db,
        model_client=object(),
    )

    assert response["status"] == "passed"
    assert response["plan"]["steps"][0]["status"] == "done"
    assert response["plan"]["steps"][0]["result"]["artifact_status"] == "reaudited"

    await db.close()
    await sql_engine.dispose()


@pytest.mark.asyncio
async def test_retry_runs_only_selected_step_and_preserves_plan(tmp_path, monkeypatch):
    sql_engine, db, team, plan, run_root = await _make_recovery_case(tmp_path)
    monkeypatch.setattr(recovery, "_find_run_root", lambda *args: run_root)

    class FakeAgent:
        class Persona:
            name = "岳书妍"

        persona = Persona()

    async def fake_get_agent(self, agent_id):
        assert agent_id == "agent-yue"
        return FakeAgent()

    class FakeWorker:
        def __init__(self, agent, workspace):
            self.state = SimpleNamespace(value="done")

        async def execute(self, task, is_follow_up=False):
            assert is_follow_up is True
            yield 'data: {"type":"worker.file_updated","data":{"files":[{"path":"output.md","size":20}]}}\n\n'
            yield 'data: {"type":"worker.summary","data":{"deliverable_summary":"修订完成"}}\n\n'
            yield 'data: {"type":"worker.done","data":{"total_steps":1}}\n\n'

    monkeypatch.setattr(recovery.TeamEngine, "_get_agent_instance", fake_get_agent)
    monkeypatch.setattr(recovery, "AgentWorker", FakeWorker)

    response = await recovery.recover_team_step(
        action="retry",
        team_row=team,
        plan_row=plan,
        step_id="s1",
        db=db,
        model_client=object(),
    )

    assert response["status"] == "passed"
    assert response["plan"]["id"] == "plan-1"
    step = response["plan"]["steps"][0]
    assert step["status"] == "done"
    assert step["result"]["artifact_status"] == "retried"
    assert step["result"]["recovery_history"][-1]["action"] == "retry"

    await db.close()
    await sql_engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("step_status", "recoverable", "files", "expected_message"),
    [
        ("done", True, ["step_1_整合报告/work/files/output.md"], "只有待调整"),
        ("error", False, ["step_1_整合报告/work/files/output.md"], "不是可恢复状态"),
        ("error", True, [], "没有已保留的产物"),
    ],
)
async def test_recovery_rejects_steps_outside_recoverable_contract(
    tmp_path,
    step_status,
    recoverable,
    files,
    expected_message,
):
    sql_engine, db, team, plan, _run_root = await _make_recovery_case(tmp_path)
    steps = json.loads(plan.steps)
    steps[0]["status"] = step_status
    steps[0]["result"]["recoverable"] = recoverable
    steps[0]["result"]["files"] = files
    plan.steps = json.dumps(steps, ensure_ascii=False)
    await db.commit()

    with pytest.raises(recovery.TeamRecoveryError, match=expected_message):
        await recovery.recover_team_step(
            action="accept",
            team_row=team,
            plan_row=plan,
            step_id="s1",
            db=db,
            model_client=None,
        )

    await db.close()
    await sql_engine.dispose()
