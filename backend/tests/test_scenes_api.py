"""Phase 16 scenes API + Checkpoint 集成测试 — T5 Layer 2。"""

from collections.abc import AsyncGenerator
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from api.scenes import router as scenes_router
from db import Base, get_db
from engines.scene.engine import scene_engine
import models.scenario_orm  # noqa: F401 — 注册 custom_scenarios 测试表
import models.world_orm  # noqa: F401 — 注册 worlds 测试表
from models.checkpoint_orm import CheckpointRow


def _agent(agent_id: str, x: int = 1, y: int = 2) -> dict:
    return {
        "agentId": agent_id,
        "name": f"Agent {agent_id}",
        "emoji": "🧑",
        "color": "#336699",
        "tileX": x,
        "tileY": y,
        "action": "idle",
        "emotion": "neutral",
    }


@pytest.fixture(autouse=True)
def _reset_scene_engine():
    scene_engine._scenes.clear()
    yield
    scene_engine._scenes.clear()


@pytest.fixture
async def client(tmp_path, monkeypatch) -> AsyncGenerator[AsyncClient, None]:
    database_path = (tmp_path / "t5-scenes.db").as_posix()
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    sessions = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with sessions() as session:
            yield session

    # start_scene 在函数内直接导入 db.async_session，不经过 Depends(get_db)。
    # 将它指向同一个临时数据库，避免测试接触开发数据库。
    import db as db_module
    monkeypatch.setattr(db_module, "async_session", sessions)

    app = FastAPI()
    app.include_router(scenes_router)
    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as test_client:
        yield test_client

    await engine.dispose()


@pytest.mark.anyio
async def test_scene_state_round_trip_and_isolation(client: AsyncClient):
    library_agents = [_agent("a"), _agent("b", 4, 5)]

    updated = await client.post(
        "/api/scenes/library/state",
        json=library_agents,
    )
    assert updated.status_code == 200
    assert updated.json()["agents"] == library_agents

    dorm_agent = _agent("dorm-agent", 6, 7)
    added = await client.post("/api/scenes/dorm/agents", json=dorm_agent)
    assert added.status_code == 200

    library = await client.get("/api/scenes/library/state")
    dorm = await client.get("/api/scenes/dorm/state")
    assert [agent["agentId"] for agent in library.json()["agents"]] == ["a", "b"]
    assert [agent["agentId"] for agent in dorm.json()["agents"]] == ["dorm-agent"]

    removed = await client.delete("/api/scenes/library/agents/a")
    assert removed.status_code == 200
    assert [agent["agentId"] for agent in removed.json()["agents"]] == ["b"]


@pytest.mark.anyio
async def test_checkpoint_preserves_agent_state(client: AsyncClient):
    saved_agents = [_agent("a", 2, 3), _agent("b", 8, 9)]

    created = await client.post(
        "/api/scenes/library/checkpoints",
        json={"name": "回退点", "agents": saved_agents},
    )
    assert created.status_code == 200
    checkpoint = created.json()
    assert checkpoint["scene_id"] == "library"
    assert checkpoint["name"] == "回退点"
    assert checkpoint["agents"] == saved_agents

    listed = await client.get("/api/scenes/library/checkpoints")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == checkpoint["id"]
    assert listed.json()[0]["agents"] == saved_agents

    deleted = await client.delete(
        f"/api/scenes/library/checkpoints/{checkpoint['id']}",
    )
    assert deleted.status_code == 200
    assert (await client.get("/api/scenes/library/checkpoints")).json() == []


@pytest.mark.anyio
async def test_checkpoint_cannot_be_deleted_through_another_scene(
    client: AsyncClient,
):
    created = await client.post(
        "/api/scenes/library/checkpoints",
        json={"name": "图书馆存档", "agents": [_agent("a")]},
    )
    checkpoint_id = created.json()["id"]

    cross_scene_delete = await client.delete(
        f"/api/scenes/dorm/checkpoints/{checkpoint_id}",
    )

    assert cross_scene_delete.status_code == 404
    library_checkpoints = await client.get("/api/scenes/library/checkpoints")
    assert [item["id"] for item in library_checkpoints.json()] == [checkpoint_id]


@pytest.mark.anyio
async def test_checkpoint_limit_is_enforced_per_scene(
    client: AsyncClient,
    monkeypatch,
):
    monkeypatch.setattr(CheckpointRow, "MAX_PER_SCENE", 2)
    payload = {"name": "存档", "agents": [_agent("a")]}

    assert (
        await client.post("/api/scenes/library/checkpoints", json=payload)
    ).status_code == 200
    assert (
        await client.post("/api/scenes/library/checkpoints", json=payload)
    ).status_code == 200
    rejected = await client.post(
        "/api/scenes/library/checkpoints",
        json=payload,
    )

    assert rejected.status_code == 400
    assert "存档已达上限" in rejected.json()["detail"]
    assert (
        await client.post("/api/scenes/dorm/checkpoints", json=payload)
    ).status_code == 200


@pytest.mark.anyio
async def test_scene_start_persists_serialized_scenario_and_registers_engine(
    client: AsyncClient,
    monkeypatch,
):
    """Scene World 使用 WorldRow.scenario_json，而不是不存在的 scenario_id。"""
    import api.sse as sse_api
    import api.worlds as worlds_api
    import engines.scene.engine as scene_module

    rebuild_agents = AsyncMock(return_value=[object()])
    fake_engine = SimpleNamespace(
        world=SimpleNamespace(status="idle"),
        scene_bridge=None,
    )
    build_engine = AsyncMock(return_value=fake_engine)
    monkeypatch.setattr(
        worlds_api,
        "_rebuild_agents_from_db",
        rebuild_agents,
    )
    monkeypatch.setattr(worlds_api, "_build_world_engine", build_engine)

    bridge_syncs: list[str] = []

    class FakeSceneBridge:
        def __init__(self, scene_id, engine):
            self.scene_id = scene_id
            self.engine = engine

        def sync_to_scene(self):
            bridge_syncs.append(self.scene_id)

    monkeypatch.setattr(scene_module, "SceneBridge", FakeSceneBridge)

    registered: dict[str, object] = {}
    monkeypatch.setattr(
        sse_api,
        "register_world",
        lambda world_id, engine: registered.update({world_id: engine}),
    )

    response = await client.post(
        "/api/scenes/library/start",
        json={"agent_ids": ["agent-a"]},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["scene_id"] == "library"
    assert payload["status"] == "running"
    rebuild_agents.assert_awaited_once_with(["agent-a"])

    world = build_engine.await_args.args[0]  # type: ignore[union-attr]
    assert world.world_type == "scene"
    assert world.scenario.name == "scene_library"
    assert world.scenario.environment_params == {"scene_id": "library"}
    assert world.agent_ids == ["agent-a"]
    assert fake_engine.world.status == "running"
    assert bridge_syncs == ["library"]
    assert registered == {payload["world_id"]: fake_engine}
