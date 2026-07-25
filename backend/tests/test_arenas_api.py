"""Step 46 Arena API 集成测试 — 真 SQLite + Mock LLM/引擎。"""

import asyncio
import tempfile

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

import api.agents as agents_api
from api.arenas import get_arena_engine, router
from db import Base, get_db
from engines.agent_factory.factory import AgentFactory
from models.agent_orm import AgentRow
from models.arena import ArenaMode, ArenaResult, ArenaTranscriptEntry
from tests.test_arena_engine import MockModelClient, make_agent


class FakeArenaEngine:
    """不调用外部 LLM 的确定性竞技引擎。"""

    async def run_debate(self, agent_a, agent_b, topic, rounds):
        return self._duel_result(agent_a, agent_b, topic, rounds, ArenaMode.DEBATE)

    async def run_interview(self, agent_a, agent_b, topic, rounds):
        return self._duel_result(agent_a, agent_b, topic, rounds, ArenaMode.INTERVIEW)

    async def run_pitch(self, agent_a, agent_b, topic, rounds):
        return self._duel_result(agent_a, agent_b, topic, rounds, ArenaMode.PITCH)

    async def run_battle_royale(self, agents, topic):
        return self._result(agents, topic, ArenaMode.BATTLE_ROYALE, 3)

    def _duel_result(self, agent_a, agent_b, topic, rounds, mode):
        return self._result([agent_a, agent_b], topic, mode, rounds)

    @staticmethod
    def _result(agents, topic, mode, rounds):
        scores = {
            agent.id: float(36 - index * 4)
            for index, agent in enumerate(agents)
        }
        return ArenaResult(
            winner_id=agents[0].id,
            scores=scores,
            score_breakdown={
                agent.id: {
                    "argument_quality": 9,
                    "expression": 9,
                    "adaptability": 9,
                    "character_consistency": 9,
                }
                for agent in agents
            },
            judge_reasoning="第一位参赛者表现更完整。",
            transcript=[
                ArenaTranscriptEntry(
                    turn=index,
                    round=1,
                    speaker_id=agent.id,
                    speaker=agent.persona.name,
                    content=("完整发言" * 500) if index == 0 else "回应发言",
                )
                for index, agent in enumerate(agents)
            ],
            mode=mode,
            topic=topic,
            rounds=rounds,
            participant_ids=[agent.id for agent in agents],
            participant_names={
                agent.id: agent.persona.name for agent in agents
            },
        )


@pytest.fixture
def arena_client(monkeypatch):
    """创建隔离的 Arena API、临时 SQLite 和八个真实 Agent 行。"""
    temp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    temp.close()
    engine = create_async_engine(f"sqlite+aiosqlite:///{temp.name}")
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    fake_engine = FakeArenaEngine()

    async def setup():
        import models.arena_orm  # noqa: F401

        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        async with session_factory() as session:
            session.add_all([
                AgentRow.from_response(
                    make_agent(f"agent-{index}", f"参赛者{index}")
                    .to_response()
                    .model_dump()
                )
                for index in range(8)
            ])
            await session.commit()

    async def override_db():
        async with session_factory() as session:
            yield session

    asyncio.run(setup())
    monkeypatch.setattr(
        agents_api,
        "_agent_factory",
        AgentFactory(MockModelClient()),
    )
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_arena_engine] = lambda: fake_engine

    with TestClient(app) as client:
        yield client, fake_engine

    asyncio.run(engine.dispose())


def duel_payload(mode: str = "debate") -> dict:
    """创建有效 1v1 请求体。"""
    return {
        "mode": mode,
        "agent_a_id": "agent-0",
        "agent_b_id": "agent-1",
        "topic": "测试主题",
        "rounds": 3,
    }


def test_duel_persists_full_result_and_report(arena_client):
    client, _ = arena_client
    response = client.post("/api/arenas/debate", json=duel_payload())
    assert response.status_code == 201
    data = response.json()
    arena_id = data["id"]

    assert len(data["transcript"][0]["content"]) == 2000
    assert data["score_breakdown"]["agent-0"]["argument_quality"] == 9
    assert client.get(f"/api/arenas/{arena_id}").status_code == 200

    report = client.get(f"/api/arenas/{arena_id}/report")
    assert report.status_code == 200
    assert len(report.json()["markdown"]) > 2000
    assert "## 逐轮分析" in report.json()["markdown"]


@pytest.mark.parametrize("mode", ["interview", "pitch"])
def test_all_duel_modes_use_their_matching_endpoint(arena_client, mode):
    client, _ = arena_client
    response = client.post(f"/api/arenas/{mode}", json=duel_payload(mode))
    assert response.status_code == 201
    assert response.json()["mode"] == mode


def test_endpoint_rejects_mismatched_mode(arena_client):
    client, _ = arena_client
    response = client.post("/api/arenas/debate", json=duel_payload("pitch"))
    assert response.status_code == 422


def test_battle_royale_and_agent_history_filter(arena_client):
    client, _ = arena_client
    payload = {
        "agent_ids": [f"agent-{index}" for index in range(6)],
        "topic": "多人测试",
    }
    response = client.post("/api/arenas/battle_royale", json=payload)
    assert response.status_code == 201
    assert len(response.json()["participant_ids"]) == 6

    history = client.get("/api/arenas", params={"agent_id": "agent-5"})
    assert history.status_code == 200
    assert len(history.json()) == 1
    assert history.json()[0]["mode"] == "battle_royale"

    unrelated = client.get("/api/arenas", params={"agent_id": "agent-7"})
    assert unrelated.json() == []


def test_battle_royale_rejects_five_agents(arena_client):
    client, _ = arena_client
    response = client.post("/api/arenas/battle_royale", json={
        "agent_ids": [f"agent-{index}" for index in range(5)],
        "topic": "人数不足",
    })
    assert response.status_code == 422


def test_timeout_returns_504_and_does_not_persist(arena_client, monkeypatch):
    client, fake_engine = arena_client

    async def timeout(*args, **kwargs):
        raise asyncio.TimeoutError

    monkeypatch.setattr(fake_engine, "run_debate", timeout)
    response = client.post("/api/arenas/debate", json=duel_payload())
    assert response.status_code == 504
    assert client.get("/api/arenas").json() == []
