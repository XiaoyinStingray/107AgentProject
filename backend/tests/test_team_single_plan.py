"""Regression tests for M9's one-run/one-Plan contract."""

import json

import pytest


@pytest.mark.asyncio
async def test_prepare_is_idempotent_and_persists_one_plan(monkeypatch):
    from engines.team import engine as engine_module

    engine = engine_module.TeamEngine(
        team={"id": "team-1", "name": "课程作业", "description": "完成课程报告"},
        db=None,
    )
    agents = [{"id": "agent-1", "name": "岳书言", "role": "负责人", "mbti": "ENFJ"}]
    calls = {"decompose": 0, "persist": 0}

    async def fake_load_agents():
        return agents

    async def fake_decompose(task, loaded_agents, model_client):
        calls["decompose"] += 1
        assert task == "完成课程报告"
        assert loaded_agents == agents
        return [{
            "id": "step-1",
            "title": "整理材料",
            "assignee": "agent-1",
            "description": "整理课程材料",
            "status": "pending",
            "progress": 0.0,
            "depends_on": [],
        }]

    async def fake_create_plan(task, steps):
        calls["persist"] += 1
        return "plan-only"

    monkeypatch.setattr(engine, "_load_agents", fake_load_agents)
    monkeypatch.setattr(engine_module, "decompose_task", fake_decompose)
    monkeypatch.setattr(engine, "_create_plan_row", fake_create_plan)

    first = await engine.prepare(model_client=object())
    second = await engine.prepare(model_client=object())

    assert first == second == "plan-only"
    assert calls == {"decompose": 1, "persist": 1}
    assert engine._prepared_steps[0]["assignee_name"] == "岳书言"


@pytest.mark.asyncio
async def test_execute_reuses_prepared_plan_without_redecomposing(monkeypatch):
    from engines.team import engine as engine_module

    engine = engine_module.TeamEngine(
        team={"id": "team-1", "name": "课程作业", "description": "完成课程报告"},
        db=None,
    )
    engine._agents = [
        {"id": "agent-1", "name": "岳书言", "role": "负责人", "mbti": "ENFJ"}
    ]
    engine._plan_id = "plan-only"
    engine._prepared_steps = [{
        "id": "step-1",
        "title": "整理材料",
        "assignee": "agent-1",
        "assignee_name": "岳书言",
        "description": "整理课程材料",
        "status": "pending",
        "progress": 0.0,
        "depends_on": [],
    }]

    async def forbidden_decompose(*_args, **_kwargs):
        raise AssertionError("execute must not decompose an already prepared Plan")

    async def forbidden_create_plan(*_args, **_kwargs):
        raise AssertionError("execute must not persist a second Plan")

    monkeypatch.setattr(engine_module, "decompose_task", forbidden_decompose)
    monkeypatch.setattr(engine, "_create_plan_row", forbidden_create_plan)
    monkeypatch.setattr(engine_module, "init_team_workspace", lambda **_kwargs: "workspace")

    stream = engine.execute(model_client=object())
    first_event = await anext(stream)
    await stream.aclose()
    payload = json.loads(first_event.removeprefix("data: ").strip())

    assert payload["type"] == "plan_created"
    assert payload["data"]["plan_id"] == "plan-only"
    assert payload["data"]["steps"][0]["assignee_name"] == "岳书言"
