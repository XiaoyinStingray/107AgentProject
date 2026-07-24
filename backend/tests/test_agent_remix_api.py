"""Agent Remix API 集成测试——真 SQLite + Mock LLM。"""

import json
import tempfile
from contextlib import asynccontextmanager

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from api.agents import (
    get_agent_factory,
    get_persona_remixer,
    router,
)


class _Result:
    def __init__(self, content: str):
        self.content = content


class MockClient:
    model_info = {"function_calling": True, "vision": False, "json_output": True}

    async def create(self, messages, **kwargs):
        from engines.persona.builder import MOCK_PERSONA_JSON

        system = messages[0].content
        if "角色设定编辑器" not in system:
            return _Result(json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False))

        source = json.loads(messages[1].content)["source_agent"]
        source["persona"]["name"] = "擅自改名"
        source["persona"]["big_five"]["extraversion"] = 0.75
        source["persona"]["narrative"] = "更愿意主动交流，但仍保留原有经历和目标。"
        source["background"]["hometown"] = "擅自改家乡"
        source["summary"] = "提高外向性。"
        return _Result(json.dumps(source, ensure_ascii=False))


_client = MockClient()


def _factory():
    from engines.agent_factory.factory import AgentFactory

    return AgentFactory(_client)


def _remixer():
    from engines.persona.remixer import PersonaRemixer

    return PersonaRemixer(_client)


_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
_TEST_DB_URL = f"sqlite+aiosqlite:///{_tmp_db.name}"
_SYNC_DB_URL = f"sqlite:///{_tmp_db.name}"


def _reset_tables():
    from db import Base
    import models.agent_orm  # noqa: F401
    import models.world_orm  # noqa: F401

    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


@asynccontextmanager
async def _lifespan(app):
    from db import init_db

    await init_db()
    yield


@pytest.fixture(autouse=True)
def setup_db():
    from config import settings
    from db import reset_db_state

    original_url = settings.database_url
    reset_db_state()
    settings.database_url = _TEST_DB_URL
    _reset_tables()
    yield
    _reset_tables()
    reset_db_state()
    settings.database_url = original_url


@pytest.fixture
def client():
    app = FastAPI(lifespan=_lifespan)
    app.include_router(router)
    app.dependency_overrides[get_agent_factory] = _factory
    app.dependency_overrides[get_persona_remixer] = _remixer
    with TestClient(app) as test_client:
        yield test_client


def _preview_payload():
    return {
        "action": "preview",
        "spec": {
            "instruction": "保留背景和目标，变得更外向",
            "trait_targets": {"extraversion": 0.8},
            "preserve_fields": ["name", "background", "goals"],
        },
        "draft": None,
    }


def test_preview_does_not_persist_and_preserves_source(client):
    source = client.post("/api/agents", json={"description": "内向学生"}).json()

    response = client.post(f"/api/agents/{source['id']}/remix", json=_preview_payload())

    assert response.status_code == 200
    preview = response.json()
    assert preview["status"] == "preview"
    assert preview["draft"]["persona"]["name"] == source["persona"]["name"]
    assert preview["draft"]["background"] == source["background"]
    assert preview["draft"]["persona"]["big_five"]["extraversion"] == 0.8
    assert len(client.get("/api/agents").json()) == 1
    assert client.get(f"/api/agents/{source['id']}").json() == source


def test_create_persists_new_agent_with_fresh_dynamic_state(client):
    source = client.post("/api/agents", json={"description": "内向学生"}).json()
    preview = client.post(
        f"/api/agents/{source['id']}/remix",
        json=_preview_payload(),
    ).json()
    create_payload = {
        "action": "create",
        "spec": preview["spec"],
        "draft": preview["draft"],
    }

    response = client.post(f"/api/agents/{source['id']}/remix", json=create_payload)

    assert response.status_code == 200
    created = response.json()["agent"]
    assert created["id"] != source["id"]
    assert created["energy"] == 100
    assert created["emotional_state"]["label"] == "neutral"
    assert len(client.get("/api/agents").json()) == 2
    assert client.get(f"/api/agents/{source['id']}").json() == source


def test_remix_missing_source_returns_404(client):
    response = client.post("/api/agents/missing/remix", json=_preview_payload())

    assert response.status_code == 404


def test_create_without_preview_draft_returns_422(client):
    source = client.post("/api/agents", json={"description": "内向学生"}).json()
    payload = _preview_payload()
    payload["action"] = "create"

    response = client.post(f"/api/agents/{source['id']}/remix", json=payload)

    assert response.status_code == 422
