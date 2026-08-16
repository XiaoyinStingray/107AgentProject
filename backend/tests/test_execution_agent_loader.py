"""Regression tests for unified real-Agent restoration in M9/M12/Pipeline."""

import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from models.agent_orm import AgentRow


class MockModelClient:
    model_info = {
        "function_calling": True,
        "vision": False,
        "json_output": True,
    }


class _ScalarResult:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class FakeAsyncSession:
    def __init__(self, row):
        self.row = row

    async def execute(self, _statement):
        return _ScalarResult(self.row)


def _yue_shuyan_row() -> AgentRow:
    return AgentRow(
        id="agent-yue-shuyan",
        name="岳书言",
        persona_json=json.dumps({
            "name": "岳书言",
            "mbti": "ENFP",
            "values": ["连接", "成就"],
            "narrative": "爱热闹、擅长连接资源，也会在成绩压力下内耗。",
            "decision_style": {
                "info_processing": "intuitive",
                "risk_preference": "moderate",
                "social_tendency": "cooperative",
                "stress_response": "reactive",
            },
        }, ensure_ascii=False),
        background_json=json.dumps({
            "hometown": "信阳",
            "education": "中国科学技术大学信息学院",
            "key_events": ["从高中尖子生进入高手如云的大学"],
        }, ensure_ascii=False),
        goals_json=json.dumps([{
            "id": "goal-gpa",
            "description": "提高 GPA",
            "priority": 1,
            "status": "active",
            "progress": 0.2,
        }], ensure_ascii=False),
        emotional_json=json.dumps({
            "valence": 0.6,
            "arousal": 0.7,
            "dominance": 0.55,
            "label": "anxious",
        }, ensure_ascii=False),
        energy=82.0,
        created_at="2026-08-01T00:00:00+00:00",
        updated_at="2026-08-02T00:00:00+00:00",
    )


@pytest.mark.asyncio
async def test_real_agent_restores_identity_instead_of_generic_worker():
    from engines.agent_factory.loader import load_agent_for_execution

    agent = await load_agent_for_execution(
        "agent-yue-shuyan",
        db=FakeAsyncSession(_yue_shuyan_row()),
        model_client=MockModelClient(),
    )

    assert agent.id == "agent-yue-shuyan"
    assert agent.persona.name == "岳书言"
    assert agent.persona.mbti == "ENFP"
    assert agent.persona.values == ["连接", "成就"]
    assert agent.background.hometown == "信阳"
    assert agent.goals[0].description == "提高 GPA"
    assert agent.emotional_state.label == "anxious"
    assert agent.energy == 82.0
    assert "岳书言" in agent.autogen_agent.description
    assert "Worker Agent" not in agent.autogen_agent.description


@pytest.mark.asyncio
async def test_only_explicit_worker_default_builds_generic_worker():
    from engines.agent_factory.loader import load_agent_for_execution

    agent = await load_agent_for_execution(
        "worker-default",
        db=FakeAsyncSession(None),
        model_client=MockModelClient(),
    )

    assert agent.id == "worker-default"
    assert agent.persona.name == "Worker Agent"
    assert agent.persona.mbti == "ISTJ"


@pytest.mark.asyncio
@pytest.mark.parametrize("agent_id", ["agent-deleted", "", "   "])
async def test_missing_or_blank_agent_id_never_silently_degrades(agent_id):
    from engines.agent_factory.loader import AgentNotFoundError, load_agent_for_execution

    with pytest.raises(AgentNotFoundError, match="不存在|未指定"):
        await load_agent_for_execution(
            agent_id,
            db=FakeAsyncSession(None),
            model_client=MockModelClient(),
        )


@pytest.mark.asyncio
async def test_m9_uses_shared_loader_and_caches_restored_agent(monkeypatch):
    from engines.agent_factory import loader
    from engines.team.engine import TeamEngine

    restored = SimpleNamespace(persona=SimpleNamespace(name="岳书言"))
    calls = []

    async def fake_load(agent_id, *, db, model_client):
        calls.append((agent_id, db, model_client))
        return restored

    monkeypatch.setattr(loader, "load_agent_for_execution", fake_load)
    db = object()
    client = object()
    engine = TeamEngine({"id": "team-1", "agent_ids": []}, db)
    engine._model_client = client

    first = await engine._get_agent_instance("agent-yue-shuyan")
    second = await engine._get_agent_instance("agent-yue-shuyan")

    assert first is second is restored
    assert calls == [("agent-yue-shuyan", db, client)]


@pytest.mark.asyncio
async def test_m12_wrapper_uses_shared_loader(monkeypatch):
    from api.workers import _get_or_create_agent
    from engines.agent_factory import loader

    restored = object()

    async def fake_load(agent_id):
        assert agent_id == "agent-yue-shuyan"
        return restored

    monkeypatch.setattr(loader, "load_agent_for_execution", fake_load)

    assert await _get_or_create_agent("agent-yue-shuyan") is restored


@pytest.mark.asyncio
async def test_m12_execute_returns_404_for_deleted_agent(monkeypatch):
    from api import workers
    from engines.agent_factory.loader import AgentNotFoundError

    async def missing_agent(_agent_id):
        raise AgentNotFoundError("Agent 'agent-deleted' 不存在或已被删除")

    monkeypatch.setattr(workers, "_get_or_create_agent", missing_agent)
    request = workers.WorkerExecuteRequest(
        agent_id="agent-deleted",
        task="整理课程资料",
    )

    with pytest.raises(HTTPException) as exc_info:
        await workers.execute_worker_task(request)

    assert exc_info.value.status_code == 404
    assert "不存在或已被删除" in exc_info.value.detail


@pytest.mark.asyncio
async def test_pipeline_rejects_deleted_agent_before_streaming(monkeypatch):
    from api import pipelines
    from engines.agent_factory import loader
    from engines.agent_factory.loader import AgentNotFoundError
    from engines.worker.pipeline import PipelineNodeSpec, PipelineSpec

    pipeline = PipelineSpec(
        id="pipeline-deleted-agent",
        name="删除 Agent 测试",
        nodes=[PipelineNodeSpec(
            id="node-1",
            title="整理资料",
            agent_id="agent-deleted",
            task="整理课程资料",
        )],
        edges=[],
    )
    pipelines._pipelines[pipeline.id] = pipeline

    async def reject(agent_id):
        raise AgentNotFoundError(f"Agent {agent_id!r} 不存在或已被删除")

    monkeypatch.setattr(loader, "validate_execution_agent_id", reject)
    try:
        with pytest.raises(HTTPException) as exc_info:
            await pipelines.execute_pipeline(pipeline.id)
        assert exc_info.value.status_code == 404
        assert "不存在或已被删除" in exc_info.value.detail
    finally:
        pipelines._pipelines.pop(pipeline.id, None)
