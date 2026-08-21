"""
Agent API 路由 单元测试 — Mock LLM + SQLite 持久化。
"""

import json
import tempfile

import httpx
import pytest
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.testclient import TestClient
from openai import AuthenticationError
from sqlalchemy import create_engine, text

from api.agents import get_agent_factory, router
from llm.errors import register_llm_error_middleware


# =============================================================================
# Mock 版本覆盖 FastAPI 依赖（不用真 LLM）
# =============================================================================

class _FakeCreateResult:
    def __init__(self, c): self.content = c


class MockModelClient:
    model_info = {"function_calling": True, "vision": False, "json_output": True}

    async def create(self, messages, **kw):
        from engines.persona.builder import MOCK_PERSONA_JSON
        return _FakeCreateResult(json.dumps(MOCK_PERSONA_JSON, ensure_ascii=False))


def _mock_factory():
    from engines.agent_factory.factory import AgentFactory
    return AgentFactory(MockModelClient())


# =============================================================================
# DB fixtures — 用同步 SQLite 管理测试数据库
# =============================================================================

_tmp_db = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp_db.close()
_TEST_DB_URL = f"sqlite+aiosqlite:///{_tmp_db.name}"
# 同步 URL 用于 setup/teardown
_SYNC_DB_URL = f"sqlite:///{_tmp_db.name}"


def _sync_create_tables():
    """用同步 SQLAlchemy 创建所有表。"""
    from db import Base
    import models.agent_orm   # noqa: F401
    import models.world_orm   # noqa: F401
    import models.event       # noqa: F401
    import models.memory      # noqa: F401

    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    engine.dispose()


def _sync_drop_tables():
    """用同步 SQLAlchemy 删除所有表。"""
    from db import Base
    engine = create_engine(_SYNC_DB_URL)
    Base.metadata.drop_all(engine)
    engine.dispose()


@asynccontextmanager
async def _test_lifespan(app):
    from db import init_db
    await init_db()
    yield


@pytest.fixture(autouse=True)
def _setup_db():
    """每个测试前重置数据库表。"""
    from db import reset_db_state
    from config import settings

    reset_db_state()
    settings.database_url = _TEST_DB_URL
    _sync_create_tables()

    yield

    _sync_drop_tables()


@pytest.fixture
def app():
    app = FastAPI(lifespan=_test_lifespan)
    register_llm_error_middleware(app)
    app.include_router(router)
    app.dependency_overrides[get_agent_factory] = _mock_factory
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


# =============================================================================
# POST /api/agents
# =============================================================================

class TestCreateAgent:
    def test_create_returns_201(self, client):
        resp = client.post("/api/agents/", json={"description": "内向的程序员"})
        assert resp.status_code == 201
        data = resp.json()
        assert "id" in data
        assert data["persona"]["mbti"] == "INTJ-T"

    def test_create_empty_description_returns_422(self, client):
        resp = client.post("/api/agents/", json={"description": ""})
        assert resp.status_code == 422  # Pydantic min_length=3

    def test_create_too_short_description(self, client):
        resp = client.post("/api/agents/", json={"description": "ab"})
        assert resp.status_code == 422

    def test_invalid_llm_key_returns_structured_error(self, app, client):
        """上游 401 应转换为前端可识别的安全错误。"""
        request = httpx.Request(
            "POST",
            "https://api.deepseek.com/v1/chat/completions",
        )
        response = httpx.Response(401, request=request)

        def invalid_factory():
            raise AuthenticationError(
                "Authentication Fails",
                response=response,  # type: ignore[arg-type]
                body={"error": "invalid key"},
            )

        app.dependency_overrides[get_agent_factory] = invalid_factory

        resp = client.post("/api/agents/", json={"description": "测试角色"})

        assert resp.status_code == 401
        assert resp.json() == {
            "error": "invalid_api_key",
            "message": "LLM API Key 无效，请检查 .env 配置并重启后端",
        }


# =============================================================================
# GET /api/agents
# =============================================================================

class TestListAgents:
    def test_list_empty(self, client):
        resp = client.get("/api/agents/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_after_create(self, client):
        client.post("/api/agents/", json={"description": "内向的程序员"})
        resp = client.get("/api/agents/")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1


class TestDuplicateNames:
    """BUG-M1-004：不同 Agent 重名时让 LLM 重新取名，LLM 失败则从名字池挑选。"""

    def test_duplicate_name_gets_new_name(self, client):
        """Mock LLM 始终返回 '小明'，regenerate_name 从名字池挑选 '叶舟'，
        第二次创建应得到完全不同的名字而非 '小明 (2)'."""
        resp1 = client.post("/api/agents/", json={"description": "角色A"})
        assert resp1.status_code == 201
        name1 = resp1.json()["name"]
        assert name1 == "小明"

        resp2 = client.post("/api/agents/", json={"description": "角色B"})
        assert resp2.status_code == 201
        name2 = resp2.json()["name"]
        # 名字池第一个候选是 "林风"，不在排除列表中
        assert name2 in ["林风", "苏晴", "叶舟", "陆远", "沈墨", "顾言", "白羽", "江潮", "程诺", "许晨"]
        assert name1 != name2

    def test_triple_duplicate_gets_unique_names(self, client):
        """三次创建相同描述的 Agent，应得到三个完全不同的名字。"""
        r1 = client.post("/api/agents/", json={"description": "角色甲"})
        assert r1.status_code == 201, f"first create failed: {r1.status_code} {r1.text}"
        r2 = client.post("/api/agents/", json={"description": "角色乙"})
        assert r2.status_code == 201, f"second create failed: {r2.status_code} {r2.text}"
        resp3 = client.post("/api/agents/", json={"description": "角色丙"})
        assert resp3.status_code == 201, f"third create failed: {resp3.status_code} {resp3.text}"
        name1 = r1.json()["name"]
        name2 = r2.json()["name"]
        name3 = resp3.json()["name"]
        # 三个名字互不相同
        assert len({name1, name2, name3}) == 3

    def test_llm_renames_on_duplicate(self):
        """当 regenerate_name 返回不同名字时，应使用 LLM 新名字而非序号。"""
        from unittest.mock import AsyncMock
        from engines.agent_factory.factory import AgentFactory

        # 创建一个会返回不同名字的 mock builder
        factory = AgentFactory(MockModelClient())
        factory.persona_builder.regenerate_name = AsyncMock(return_value="小红")

        def override_factory():
            return factory

        test_app = FastAPI()
        test_app.include_router(router)
        test_app.dependency_overrides[get_agent_factory] = override_factory

        with TestClient(test_app) as c:
            r1 = c.post("/api/agents/", json={"description": "角色A"})
            assert r1.json()["name"] == "小明"
            r2 = c.post("/api/agents/", json={"description": "角色B"})
            # 应该使用 LLM 返回的 "小红" 而非 "小明 (2)"
            assert r2.json()["name"] == "小红"
            factory.persona_builder.regenerate_name.assert_called_once()


# =============================================================================
# GET /api/agents/{id}
# =============================================================================

class TestGetAgent:
    def test_get_existing(self, client):
        create_resp = client.post("/api/agents/", json={"description": "测试角色"})
        agent_id = create_resp.json()["id"]

        resp = client.get(f"/api/agents/{agent_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == agent_id

    def test_get_missing_returns_404(self, client):
        resp = client.get("/api/agents/nonexistent")
        assert resp.status_code == 404


# =============================================================================
# DELETE /api/agents/{id}
# =============================================================================

class TestDeleteAgent:
    def test_delete_existing(self, client):
        create_resp = client.post("/api/agents/", json={"description": "要删除的角色"})
        agent_id = create_resp.json()["id"]

        resp = client.delete(f"/api/agents/{agent_id}")
        assert resp.status_code == 200
        assert resp.json() == {"ok": True}

        # 确认已删除
        get_resp = client.get(f"/api/agents/{agent_id}")
        assert get_resp.status_code == 404

    def test_delete_missing_returns_404(self, client):
        resp = client.delete("/api/agents/nonexistent")
        assert resp.status_code == 404
