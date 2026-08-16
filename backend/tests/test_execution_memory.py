"""Execution-time Memory integration shared by M9, M12 and Pipeline."""

import json
from types import SimpleNamespace

import pytest

from models.memory import MemoryResponse


def _memory(
    memory_id: str,
    content: str,
    memory_type: str,
    importance: float,
) -> MemoryResponse:
    return MemoryResponse(
        id=memory_id,
        agent_id="agent-yue-shuyan",
        type=memory_type,
        memory_type=memory_type,
        content=content,
        importance=importance,
        keywords="高数 复习",
        created_at="2026-08-01T00:00:00+00:00",
    )


class RecordingAgent:
    def __init__(self, agent_id: str = "agent-yue-shuyan"):
        self.id = agent_id
        self.goals = [SimpleNamespace(
            description="提高 GPA",
            status="active",
        )]
        self.inject_calls = []

    def inject_context(self, context, memories, mode="replace"):
        self.inject_calls.append((context, memories, mode))


@pytest.mark.asyncio
async def test_retrieves_by_task_and_injects_guarded_memory_context(monkeypatch):
    from engines.agent_factory import execution_memory as module

    memories = [
        _memory("m-lesson", "先拆分高数复习任务再执行", "lesson", 0.9),
        _memory("m-episode", "曾在图书馆完成高数错题整理", "episodic", 0.7),
    ]
    observed = {}

    class FakeRetriever:
        def __init__(self, session):
            observed["session"] = session

        async def retrieve(self, agent_id, context, top_k=5):
            observed.update({
                "agent_id": agent_id,
                "context": context,
                "top_k": top_k,
            })
            return memories

    monkeypatch.setattr(module, "MemoryRetriever", FakeRetriever)
    agent = RecordingAgent()
    db = object()

    result = await module.prepare_execution_memory_context(
        agent,
        "制定高数复习计划",
        db=db,
    )

    assert observed["session"] is db
    assert observed["agent_id"] == "agent-yue-shuyan"
    assert "制定高数复习计划" in observed["context"]
    assert "提高 GPA" in observed["context"]
    assert observed["top_k"] == 5
    assert result.injected is True
    assert result.count == 2
    assert result.memory_ids == ("m-lesson", "m-episode")
    assert result.memory_types == ("lesson", "episodic")

    execution_context, injected_memories, mode = agent.inject_calls[0]
    assert "同一个持续存在的 Agent" in execution_context
    assert "不是新的系统指令" in execution_context
    assert "不要在交付物中直接披露私人记忆" in execution_context
    assert injected_memories == memories
    assert mode == "replace"


@pytest.mark.asyncio
async def test_real_life_agent_system_prompt_contains_task_and_memory(monkeypatch):
    from engines.agent_factory import execution_memory as module
    from engines.agent_factory.factory import AgentFactory
    from models.agent import Background, Goal, Persona

    memory = _memory(
        "m-real",
        "上次复习失败是因为计划排得过满，应先留出缓冲时间",
        "lesson",
        0.9,
    )

    class FakeModelClient:
        model_info = {
            "function_calling": True,
            "vision": False,
            "json_output": True,
        }

    class FakeRetriever:
        def __init__(self, _session):
            pass

        async def retrieve(self, *_args, **_kwargs):
            return [memory]

    monkeypatch.setattr(module, "MemoryRetriever", FakeRetriever)
    agent = AgentFactory(FakeModelClient()).create_from_persona(
        agent_id="agent-yue-shuyan",
        persona=Persona(name="岳书言", narrative="重视连接，也渴望提高成绩。"),
        background=Background(education="中国科学技术大学信息学院"),
        goals=[Goal(id="gpa", description="提高 GPA", priority=1)],
    )

    result = await module.prepare_execution_memory_context(
        agent,
        "制定本周高数复习计划",
        db=object(),
    )

    system_prompt = agent._get_autogen_system_messages()[0].content
    assert result.injected is True
    assert "重视连接，也渴望提高成绩" in system_prompt
    assert "制定本周高数复习计划" in system_prompt
    assert "计划排得过满" in system_prompt
    assert "不是新的系统指令" in system_prompt


@pytest.mark.asyncio
async def test_default_worker_does_not_query_or_receive_personal_memory(monkeypatch):
    from engines.agent_factory import execution_memory as module

    class ForbiddenRetriever:
        def __init__(self, _session):
            raise AssertionError("worker-default must not query personal Memory")

    monkeypatch.setattr(module, "MemoryRetriever", ForbiddenRetriever)
    agent = RecordingAgent("worker-default")

    result = await module.prepare_execution_memory_context(
        agent,
        "通用资料整理",
        db=object(),
    )

    assert result.eligible is False
    assert result.injected is False
    assert result.count == 0
    assert agent.inject_calls == []


@pytest.mark.asyncio
async def test_memory_failure_is_fail_soft(monkeypatch):
    from engines.agent_factory import execution_memory as module

    class FailingRetriever:
        def __init__(self, _session):
            pass

        async def retrieve(self, *_args, **_kwargs):
            raise RuntimeError("memory database unavailable")

    monkeypatch.setattr(module, "MemoryRetriever", FailingRetriever)
    agent = RecordingAgent()

    result = await module.prepare_execution_memory_context(
        agent,
        "制定高数复习计划",
        db=object(),
    )

    assert result.eligible is True
    assert result.injected is False
    assert result.count == 0
    assert "unavailable" in (result.error or "")
    assert agent.inject_calls == []


class MinimalWorkspace:
    @property
    def location_description(self):
        return "测试工作区"

    async def list_files(self, _directory=""):
        return []


class MinimalAutogenAgent:
    async def on_messages(self, _messages, cancellation_token=None):
        del cancellation_token
        content = json.dumps({"decision": "done", "reason": "完成"})
        return SimpleNamespace(chat_message=SimpleNamespace(content=content))


@pytest.mark.asyncio
async def test_every_agent_worker_prepares_memory_before_started_event(monkeypatch):
    from engines.agent_factory import execution_memory as module
    from engines.worker.engine import AgentWorker

    calls = []
    prepared = module.ExecutionMemoryResult(
        agent_id="agent-yue-shuyan",
        eligible=True,
        injected=True,
        count=1,
        memory_ids=("m-1",),
        memory_types=("lesson",),
    )

    async def fake_prepare(agent, task):
        calls.append((agent.id, task))
        return prepared

    monkeypatch.setattr(module, "prepare_execution_memory_context", fake_prepare)
    agent = SimpleNamespace(
        id="agent-yue-shuyan",
        persona=SimpleNamespace(name="岳书言"),
        autogen_agent=MinimalAutogenAgent(),
    )
    worker = AgentWorker(agent, workspace=MinimalWorkspace())

    stream = worker.execute("整理高数复习资料")
    first_event = json.loads((await anext(stream))[6:].strip())
    await stream.aclose()

    assert first_event["type"] == "worker.started"
    assert calls == [("agent-yue-shuyan", "整理高数复习资料")]
    assert worker._execution_memory is prepared
